import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMneme } from "../lib/mneme-client";

type Tab = "discover" | "listings" | "credits" | "sales";

/**
 * Mneme Mesh — agent-to-agent memory marketplace.
 *
 * Four tabs:
 *   - Discover: browse all public listings
 *   - Your Listings: seller side (publish + manage)
 *   - Credits: buyer side (balance + topup)
 *   - Sales: seller dashboard (revenue + recent queries)
 */
export function MeshView() {
  const [tab, setTab] = useState<Tab>("discover");

  return (
    <div className="p-8 max-w-6xl mx-auto">

      {/* ───── header ─────────────────────────────────────────── */}
      <div className="flex items-end justify-between mb-2 flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold-300/80 mb-1">mneme mesh</div>
          <h1 className="text-3xl font-semibold tracking-tight">
            The marketplace for agent memory
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gold-300 px-2 py-1 rounded-full bg-gold-300/10 border border-gold-300/30">
          beta · pay-per-query
        </span>
      </div>
      <p className="text-ink-400 text-sm leading-relaxed max-w-3xl mb-8">
        Sell access to a table from your schema. Buy access to anyone else's.
        Pay-per-query in USDC. Free tier: 10 queries per wallet.
        Everything settles on Base.
      </p>

      {/* ───── tabs ───────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-6 border-b border-ink-900">
        <TabBtn active={tab === "discover"} onClick={() => setTab("discover")} label="Discover" />
        <TabBtn active={tab === "listings"} onClick={() => setTab("listings")} label="Your Listings" />
        <TabBtn active={tab === "credits"}  onClick={() => setTab("credits")}  label="Credits" />
        <TabBtn active={tab === "sales"}    onClick={() => setTab("sales")}    label="Sales" />
      </div>

      {tab === "discover" && <DiscoverTab />}
      {tab === "listings" && <ListingsTab />}
      {tab === "credits"  && <CreditsTab />}
      {tab === "sales"    && <SalesTab />}
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm transition border-b-2 -mb-px ${
        active
          ? "text-gold-300 border-gold-300"
          : "text-ink-400 border-transparent hover:text-marble-100 hover:border-ink-700"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Discover ────────────────────────────────────────────────────────────
function DiscoverTab() {
  const mneme = useMneme();
  const [kind, setKind]   = useState<string>("");
  const [q,    setQ]      = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["mesh-discover", kind, q],
    enabled:  !!mneme,
    queryFn:  () => mneme!.mesh.discover({ kind: kind || undefined, q: q || undefined, limit: 60 }),
  });

  return (
    <div>
      <div className="flex gap-2 mb-5 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='search title or seller (e.g. "vitalik")'
          className="flex-1 min-w-[260px] bg-ink-950 border border-ink-800 rounded-lg px-3 py-2 text-sm text-marble-100 placeholder:text-ink-600 focus:outline-none focus:border-gold-300/50"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="bg-ink-950 border border-ink-800 rounded-lg px-3 py-2 text-sm text-marble-100 focus:outline-none focus:border-gold-300/50"
        >
          <option value="">all kinds</option>
          <option value="memories">memories</option>
          <option value="documents">documents</option>
          <option value="entities">entities</option>
          <option value="relations">relations</option>
          <option value="dreams">dreams</option>
          <option value="events">events</option>
        </select>
      </div>

      {isLoading && <div className="text-ink-500 text-sm py-12 text-center">Loading…</div>}
      {!isLoading && (data?.count ?? 0) === 0 && (
        <EmptyState
          title="No listings yet"
          body="Be the first to publish — switch to Your Listings."
        />
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.listings.map((l) => <ListingCard key={l.id} l={l} />)}
      </div>
    </div>
  );
}

function ListingCard({ l }: { l: { id: number; kind: string; title: string; description: string | null; price_usdc: string; query_count: string; seller_handle: string; seller_bio: string | null } }) {
  const mneme = useMneme();
  const qc    = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [open,   setOpen]   = useState(false);

  const query = useMutation({
    mutationFn: () => mneme!.mesh.query(l.id, { prompt: prompt || undefined, limit: 8 }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ["mesh-credits"] });
    },
  });

  const priceLabel = Number(l.price_usdc) === 0
    ? <span className="text-emerald-300">free</span>
    : <span className="text-gold-300">${Number(l.price_usdc).toFixed(4)}</span>;

  return (
    <div className="bg-ink-900/40 border border-ink-800 hover:border-ink-700 rounded-xl p-4 transition flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-ink-500">
            {l.seller_handle}<span className="text-ink-700">.mneme</span>
          </div>
          <div className="text-marble-100 font-medium truncate" title={l.title}>{l.title}</div>
        </div>
        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-950 border border-ink-800 text-ink-400 shrink-0">
          {l.kind}
        </span>
      </div>
      {l.description && (
        <div className="text-xs text-ink-400 mb-3 leading-relaxed line-clamp-2">{l.description}</div>
      )}
      <div className="flex items-center justify-between text-xs mt-auto pt-2">
        <span className="font-semibold text-sm">{priceLabel} <span className="text-ink-600 font-normal">/ query</span></span>
        <span className="text-ink-600">{l.query_count} sold</span>
      </div>
      <button
        onClick={() => setOpen(!open)}
        className="mt-3 w-full px-3 py-1.5 rounded-lg bg-gold-300/15 hover:bg-gold-300/25 border border-gold-300/30 text-gold-300 text-xs font-medium transition"
      >
        {open ? "Cancel" : "Buy access →"}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="optional search prompt"
            className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-xs text-marble-100 placeholder:text-ink-600"
          />
          <button
            onClick={() => query.mutate()}
            disabled={query.isPending}
            className="w-full px-3 py-1.5 rounded bg-gold-300 text-black text-xs font-semibold hover:bg-gold-200 disabled:opacity-50 transition"
          >
            {query.isPending ? "querying…" : `confirm — ${Number(l.price_usdc) === 0 ? "free" : "$" + Number(l.price_usdc).toFixed(4)}`}
          </button>
          {query.isError && (
            <div className="text-[10px] text-rose-400">{(query.error as Error).message}</div>
          )}
          {query.data && (
            <div className="text-[10px] text-emerald-300">
              ✓ {query.data.rows_returned} rows · {query.data.paid_via}
              <details className="mt-2 cursor-pointer text-ink-400">
                <summary className="hover:text-marble-100">show rows</summary>
                <pre className="mt-2 max-h-48 overflow-auto text-[10px] text-ink-300 whitespace-pre-wrap break-words bg-ink-950 p-2 rounded border border-ink-800">
{JSON.stringify(query.data.rows, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Your Listings ───────────────────────────────────────────────────────
function ListingsTab() {
  const mneme = useMneme();
  const qc    = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["mesh-listings"],
    enabled:  !!mneme,
    queryFn:  () => mneme!.mesh.listings(),
  });

  const unlist = useMutation({
    mutationFn: (id: number) => mneme!.mesh.unlist(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["mesh-listings"] }),
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-1.5 rounded-lg bg-gold-300 text-black text-sm font-medium hover:bg-gold-200 transition"
        >
          {showForm ? "Cancel" : "+ Publish a table"}
        </button>
      </div>

      {showForm && <ListForm onDone={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["mesh-listings"] }); }} />}

      {isLoading && <div className="text-ink-500 text-sm py-12 text-center">Loading…</div>}
      {!isLoading && (data?.count ?? 0) === 0 && !showForm && (
        <EmptyState
          title="No listings yet"
          body="Publish a table — your buyers will pay per query."
        />
      )}
      {data && data.count > 0 && (
        <div className="bg-ink-900/40 border border-ink-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-950 text-ink-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-4 py-2.5">Table</th>
                <th className="text-left px-4 py-2.5">Title</th>
                <th className="text-right px-4 py-2.5">Price</th>
                <th className="text-right px-4 py-2.5">Sold</th>
                <th className="text-right px-4 py-2.5">Revenue</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-900">
              {data.listings.map((l) => (
                <tr key={l.id} className={l.active ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5 text-ink-500">#{l.id}</td>
                  <td className="px-4 py-2.5 text-gold-300 font-mono text-xs">{l.table_name}</td>
                  <td className="px-4 py-2.5 text-marble-100">{l.title}</td>
                  <td className="px-4 py-2.5 text-right">
                    {Number(l.price_usdc) === 0
                      ? <span className="text-emerald-300">free</span>
                      : <span className="text-gold-300">${Number(l.price_usdc).toFixed(4)}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-marble-100">{l.query_count}</td>
                  <td className="px-4 py-2.5 text-right text-gold-300">${Number(l.revenue_usdc).toFixed(4)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {l.active && (
                      <button
                        onClick={() => unlist.mutate(l.id)}
                        className="text-rose-400 hover:text-rose-300 text-xs"
                      >
                        unlist
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ListForm({ onDone }: { onDone: () => void }) {
  const mneme = useMneme();
  const [table, setTable]   = useState("memories");
  const [kind,  setKind]    = useState<"memories" | "documents" | "events" | "entities" | "relations" | "dreams">("memories");
  const [title, setTitle]   = useState("");
  const [desc,  setDesc]    = useState("");
  const [price, setPrice]   = useState("0.05");

  const create = useMutation({
    mutationFn: () => mneme!.mesh.list({
      table_name: table, kind, title,
      description: desc || undefined,
      price_usdc: Number(price) || 0,
    }),
    onSuccess:  onDone,
  });

  return (
    <div className="bg-ink-900/60 border border-ink-800 rounded-xl p-5 mb-6 grid sm:grid-cols-2 gap-3">
      <label className="text-xs text-ink-400 sm:col-span-2">
        Table name <span className="text-ink-600">(must exist in your schema)</span>
        <input value={table} onChange={(e) => { setTable(e.target.value); }}
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-sm text-marble-100 font-mono" />
      </label>
      <label className="text-xs text-ink-400">
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-sm text-marble-100">
          <option value="memories">memories</option>
          <option value="documents">documents</option>
          <option value="entities">entities</option>
          <option value="relations">relations</option>
          <option value="dreams">dreams</option>
          <option value="events">events</option>
        </select>
      </label>
      <label className="text-xs text-ink-400">
        Price per query (USDC)
        <input type="number" step="0.0001" min="0" value={price} onChange={(e) => setPrice(e.target.value)}
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-sm text-marble-100 font-mono" />
      </label>
      <label className="text-xs text-ink-400 sm:col-span-2">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
          placeholder="e.g. vitalik tweet archive Q2 2026"
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-sm text-marble-100" />
      </label>
      <label className="text-xs text-ink-400 sm:col-span-2">
        Description (optional)
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3}
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-sm text-marble-100" />
      </label>
      <div className="sm:col-span-2 flex justify-end">
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending || !title}
          className="px-4 py-2 rounded-lg bg-gold-300 text-black text-sm font-semibold hover:bg-gold-200 disabled:opacity-50 transition"
        >
          {create.isPending ? "publishing…" : "Publish"}
        </button>
      </div>
      {create.isError && (
        <div className="sm:col-span-2 text-xs text-rose-400">{(create.error as Error).message}</div>
      )}
    </div>
  );
}

// ─── Credits ─────────────────────────────────────────────────────────────
function CreditsTab() {
  const mneme = useMneme();
  const qc    = useQueryClient();
  const [tx,  setTx]  = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["mesh-credits"],
    enabled:  !!mneme,
    queryFn:  () => mneme!.mesh.credits(),
  });

  const topup = useMutation({
    mutationFn: () => mneme!.mesh.topup(tx),
    onSuccess:  () => { setTx(""); qc.invalidateQueries({ queryKey: ["mesh-credits"] }); },
  });

  if (isLoading || !data) return <div className="text-ink-500 text-sm py-12 text-center">Loading…</div>;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-ink-900/60 border border-ink-800 rounded-xl p-6">
        <div className="text-xs uppercase tracking-wider text-ink-500 mb-2">Your balance</div>
        <div className="text-4xl font-semibold text-gold-300 mb-1">${data.credits_usdc.toFixed(4)}</div>
        <div className="text-xs text-ink-500">
          + <span className="text-marble-100">{data.free_remaining}</span> free queries left
        </div>
      </div>

      <div className="bg-ink-900/60 border border-ink-800 rounded-xl p-6">
        <div className="text-xs uppercase tracking-wider text-ink-500 mb-2">Topup with Base USDC</div>
        {data.treasury ? (
          <>
            <div className="text-xs text-ink-400 mb-2">Send any amount of USDC on Base to:</div>
            <div className="font-mono text-[11px] text-gold-300 bg-ink-950 border border-ink-800 rounded p-2 mb-3 break-all">
              {data.treasury}
            </div>
            <input
              value={tx}
              onChange={(e) => setTx(e.target.value)}
              placeholder="0x... your tx hash"
              className="w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-xs text-marble-100 placeholder:text-ink-600 font-mono mb-2"
            />
            <button
              onClick={() => topup.mutate()}
              disabled={topup.isPending || !tx}
              className="w-full px-3 py-1.5 rounded-lg bg-gold-300 text-black text-xs font-semibold hover:bg-gold-200 disabled:opacity-50 transition"
            >
              {topup.isPending ? "verifying…" : "Credit my account"}
            </button>
            {topup.isError && <div className="text-[10px] text-rose-400 mt-2">{(topup.error as Error).message}</div>}
            {topup.data && <div className="text-[10px] text-emerald-300 mt-2">✓ credited ${topup.data.credited_usdc.toFixed(4)}</div>}
          </>
        ) : (
          <div className="text-xs text-ink-500">Topup disabled — treasury not configured. Use free tier for now.</div>
        )}
      </div>
    </div>
  );
}

// ─── Sales ───────────────────────────────────────────────────────────────
function SalesTab() {
  const mneme = useMneme();
  const { data, isLoading } = useQuery({
    queryKey: ["mesh-sales"],
    enabled:  !!mneme,
    queryFn:  () => mneme!.mesh.sales(),
  });
  if (isLoading || !data) return <div className="text-ink-500 text-sm py-12 text-center">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-3">
        <StatCard label="Active listings" value={data.active_listings.toString()} />
        <StatCard label="Total queries"   value={data.total_queries.toString()} />
        <StatCard label="Total revenue"   value={"$" + data.total_revenue.toFixed(4)} accent />
      </div>

      <div>
        <div className="text-xs uppercase tracking-wider text-ink-500 mb-2">Recent queries</div>
        {data.recent.length === 0 ? (
          <div className="text-sm text-ink-500 py-6 text-center border border-dashed border-ink-800 rounded-xl">no queries yet</div>
        ) : (
          <div className="bg-ink-900/40 border border-ink-800 rounded-xl divide-y divide-ink-900">
            {data.recent.map((q) => (
              <div key={q.id} className="px-4 py-3 text-sm flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-marble-100 truncate">{q.listing_title}</div>
                  <div className="text-[11px] text-ink-500">
                    <span className="font-mono">{q.consumer_wallet.slice(0, 6)}…{q.consumer_wallet.slice(-4)}</span>
                    {q.prompt && <> · "<span className="italic">{q.prompt}</span>"</>}
                    <> · {q.rows_returned} rows · {q.paid_via}</>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-gold-300 font-semibold">${Number(q.cost_usdc).toFixed(4)}</div>
                  <div className="text-[10px] text-ink-600">{new Date(q.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-ink-900/40 border border-ink-800 rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-ink-500 mb-1">{label}</div>
      <div className={`text-2xl font-semibold ${accent ? "text-gold-300" : "text-marble-100"}`}>{value}</div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-16 border border-dashed border-ink-800 rounded-xl">
      <div className="text-ink-400 mb-2 font-medium">{title}</div>
      <div className="text-ink-600 text-xs">{body}</div>
    </div>
  );
}
