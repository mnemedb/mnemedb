import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMneme } from "../lib/mneme-client";

type Status = "" | "pending" | "armed" | "triggered" | "executed" | "cancelled" | "failed";

/**
 * Mneme Mandate — declarative agent intents.
 *
 * Sell what your agent intends to do; route through MetaMask Agentic
 * Wallet (or Coinbase Smart Wallet / Privy) for execution; track every
 * tx in the same schema.
 */
export function MandatesView() {
  const mneme = useMneme();
  const qc    = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter,   setFilter]   = useState<Status>("");

  const { data, isLoading } = useQuery({
    queryKey: ["mandates", filter],
    enabled:  !!mneme,
    queryFn:  () => mneme!.mandates.list({ status: filter || undefined, limit: 100 }),
  });

  const arm    = useMutation({ mutationFn: (id: number) => mneme!.mandates.arm(id),    onSuccess: () => qc.invalidateQueries({ queryKey: ["mandates"] }) });
  const cancel = useMutation({ mutationFn: (id: number) => mneme!.mandates.cancel(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["mandates"] }) });
  const remove = useMutation({ mutationFn: (id: number) => mneme!.mandates.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["mandates"] }) });

  return (
    <div className="p-8 max-w-6xl mx-auto">

      <div className="flex items-end justify-between mb-2 flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold-300/80 mb-1">mneme mandate</div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Declarative agent intents
          </h1>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-gold-300 px-2 py-1 rounded-full bg-gold-300/10 border border-gold-300/30">
          MetaMask Agentic Wallet ready
        </span>
      </div>
      <p className="text-ink-400 text-sm leading-relaxed max-w-3xl mb-8">
        Write what your agent should do — swap, send, LP, perp, predict —
        with guardrails (spend cap, allowed protocols, risk profile).
        Mneme stores the intent; your wallet adapter (MetaMask Agentic
        Wallet, Coinbase Smart Wallet, Privy) executes it within those
        constraints. Every tx writes back to this schema.
      </p>

      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip label="all"       active={filter === ""}          onClick={() => setFilter("")} />
          <StatusChip label="pending"   active={filter === "pending"}   onClick={() => setFilter("pending")} />
          <StatusChip label="armed"     active={filter === "armed"}     onClick={() => setFilter("armed")} />
          <StatusChip label="executed"  active={filter === "executed"}  onClick={() => setFilter("executed")} />
          <StatusChip label="cancelled" active={filter === "cancelled"} onClick={() => setFilter("cancelled")} />
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-1.5 rounded-lg bg-gold-300 text-black text-sm font-medium hover:bg-gold-200 transition"
        >
          {showForm ? "Cancel" : "+ New mandate"}
        </button>
      </div>

      {showForm && <MandateForm onDone={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["mandates"] }); }} />}

      {isLoading && <div className="text-ink-500 text-sm py-12 text-center">Loading…</div>}
      {!isLoading && (data?.count ?? 0) === 0 && !showForm && (
        <div className="text-center py-16 border border-dashed border-ink-800 rounded-xl">
          <div className="text-ink-400 mb-2 font-medium">No mandates yet</div>
          <div className="text-ink-600 text-xs">create your first intent → arm it → wallet executes when conditions hit</div>
        </div>
      )}

      <div className="space-y-3">
        {data?.mandates.map((m) => (
          <MandateCard
            key={m.id}
            m={m}
            onArm={()    => arm.mutate(m.id)}
            onCancel={() => cancel.mutate(m.id)}
            onDelete={() => remove.mutate(m.id)}
          />
        ))}
      </div>
    </div>
  );
}

function StatusChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full transition ${
        active
          ? "bg-gold-300 text-black border border-gold-300"
          : "bg-ink-950 text-ink-400 hover:text-marble-100 border border-ink-800 hover:border-ink-700"
      }`}
    >
      {label}
    </button>
  );
}

function MandateCard({ m, onArm, onCancel, onDelete }: {
  m: {
    id: number; kind: string; title: string;
    intent: Record<string, unknown>; conditions: Record<string, unknown>;
    spend_cap_usdc: string | null; wallet_provider: string;
    status: string; tx_hash: string | null;
    created_at: string;
  };
  onArm:    () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const statusColor: Record<string, string> = {
    pending:   "bg-ink-800 text-ink-300 border-ink-700",
    armed:     "bg-gold-300/15 text-gold-300 border-gold-300/40",
    triggered: "bg-amber-300/15 text-amber-300 border-amber-300/40",
    executed:  "bg-emerald-400/10 text-emerald-300 border-emerald-400/40",
    cancelled: "bg-ink-900 text-ink-500 border-ink-800",
    failed:    "bg-rose-400/10 text-rose-300 border-rose-400/40",
  };
  const sc = statusColor[m.status] ?? "bg-ink-800 text-ink-400 border-ink-700";

  return (
    <div className="bg-ink-900/40 border border-ink-800 hover:border-ink-700 rounded-xl p-4 transition">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-[10px] uppercase tracking-[0.15em] font-medium px-2 py-0.5 rounded-full border ${sc} shrink-0`}>
            {m.status}
          </span>
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-950 border border-ink-800 text-ink-400 shrink-0">
            {m.kind}
          </span>
          <h3 className="text-marble-100 font-medium truncate">{m.title}</h3>
        </div>
        <span className="text-[10px] text-ink-600 shrink-0">#{m.id}</span>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mt-3 text-xs">
        <div>
          <div className="text-ink-500 mb-1 text-[10px] uppercase tracking-wider">Wallet</div>
          <div className="text-marble-100">{m.wallet_provider}</div>
        </div>
        <div>
          <div className="text-ink-500 mb-1 text-[10px] uppercase tracking-wider">Spend cap</div>
          <div className="text-marble-100">{m.spend_cap_usdc ? `$${Number(m.spend_cap_usdc).toFixed(2)}` : "—"}</div>
        </div>
        <div>
          <div className="text-ink-500 mb-1 text-[10px] uppercase tracking-wider">Created</div>
          <div className="text-marble-100">{new Date(m.created_at).toLocaleString()}</div>
        </div>
      </div>

      <details className="mt-3">
        <summary className="text-[11px] text-ink-500 cursor-pointer hover:text-marble-100">show intent + conditions</summary>
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          <pre className="text-[10px] text-ink-300 bg-ink-950 p-2 rounded border border-ink-800 overflow-auto">{JSON.stringify(m.intent, null, 2)}</pre>
          <pre className="text-[10px] text-ink-300 bg-ink-950 p-2 rounded border border-ink-800 overflow-auto">{JSON.stringify(m.conditions, null, 2)}</pre>
        </div>
      </details>

      {m.tx_hash && (
        <div className="mt-3 text-[11px]">
          <span className="text-ink-500">tx</span>{" "}
          <a
            href={`https://basescan.org/tx/${m.tx_hash}`}
            target="_blank" rel="noreferrer"
            className="font-mono text-gold-300 hover:text-gold-200 underline underline-offset-2"
          >
            {m.tx_hash.slice(0, 10)}…{m.tx_hash.slice(-6)}
          </a>
        </div>
      )}

      <div className="mt-3 flex gap-2 text-xs">
        {m.status === "pending" && (
          <button onClick={onArm} className="px-3 py-1 rounded bg-gold-300/15 hover:bg-gold-300/25 border border-gold-300/30 text-gold-300 transition">
            Arm
          </button>
        )}
        {(m.status === "pending" || m.status === "armed" || m.status === "triggered") && (
          <button onClick={onCancel} className="px-3 py-1 rounded bg-ink-900 hover:bg-ink-800 border border-ink-800 text-ink-300 transition">
            Cancel
          </button>
        )}
        {m.status !== "executed" && (
          <button onClick={onDelete} className="ml-auto px-3 py-1 rounded text-rose-400 hover:text-rose-300 transition">
            delete
          </button>
        )}
      </div>
    </div>
  );
}

function MandateForm({ onDone }: { onDone: () => void }) {
  const mneme = useMneme();
  const [kind,     setKind]     = useState<"swap" | "send" | "stake" | "lp" | "perp" | "predict" | "mint" | "vote">("swap");
  const [title,    setTitle]    = useState("");
  const [provider, setProvider] = useState<"metamask" | "coinbase_smart" | "privy">("metamask");
  const [cap,      setCap]      = useState("");
  const [intent,   setIntent]   = useState('{"from_token":"USDC","to_token":"MNEME","amount":100}');
  const [conds,    setConds]    = useState('{"when":"on_event","spec":{"price_drop_pct":5}}');

  const create = useMutation({
    mutationFn: () => mneme!.mandates.create({
      kind, title,
      intent:           JSON.parse(intent),
      conditions:       JSON.parse(conds),
      spend_cap_usdc:   cap ? Number(cap) : undefined,
      wallet_provider:  provider,
    }),
    onSuccess:  onDone,
  });

  return (
    <div className="bg-ink-900/60 border border-ink-800 rounded-xl p-5 mb-6 grid sm:grid-cols-2 gap-3">
      <label className="text-xs text-ink-400">
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-sm text-marble-100">
          <option value="swap">swap</option>
          <option value="send">send</option>
          <option value="stake">stake</option>
          <option value="lp">lp</option>
          <option value="perp">perp</option>
          <option value="predict">predict</option>
          <option value="mint">mint</option>
          <option value="vote">vote</option>
        </select>
      </label>
      <label className="text-xs text-ink-400">
        Wallet provider
        <select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-sm text-marble-100">
          <option value="metamask">MetaMask Agentic Wallet</option>
          <option value="coinbase_smart">Coinbase Smart Wallet</option>
          <option value="privy">Privy</option>
        </select>
      </label>
      <label className="text-xs text-ink-400 sm:col-span-2">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
          placeholder="auto-DCA into MNEME on dip"
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-sm text-marble-100" />
      </label>
      <label className="text-xs text-ink-400">
        Spend cap (USDC)
        <input type="number" step="0.01" min="0" value={cap} onChange={(e) => setCap(e.target.value)}
          placeholder="optional"
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-sm text-marble-100 font-mono" />
      </label>
      <div />
      <label className="text-xs text-ink-400 sm:col-span-2">
        Intent (JSON)
        <textarea value={intent} onChange={(e) => setIntent(e.target.value)} rows={3}
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-xs text-marble-100 font-mono" />
      </label>
      <label className="text-xs text-ink-400 sm:col-span-2">
        Conditions (JSON)
        <textarea value={conds} onChange={(e) => setConds(e.target.value)} rows={3}
          className="mt-1 w-full bg-ink-950 border border-ink-800 rounded px-2 py-1.5 text-xs text-marble-100 font-mono" />
      </label>
      <div className="sm:col-span-2 flex justify-end">
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending || !title}
          className="px-4 py-2 rounded-lg bg-gold-300 text-black text-sm font-semibold hover:bg-gold-200 disabled:opacity-50 transition"
        >
          {create.isPending ? "creating…" : "Create mandate"}
        </button>
      </div>
      {create.isError && (
        <div className="sm:col-span-2 text-xs text-rose-400">{(create.error as Error).message}</div>
      )}
    </div>
  );
}
