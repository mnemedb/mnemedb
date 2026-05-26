import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMneme } from "../lib/mneme-client";

interface KeyRow {
  id:           number;
  key_prefix:   string;
  scope:        string;
  label:        string | null;
  rpm_limit:    number;
  revoked:      boolean;
  revoked_at:   string | null;
  last_used_at: string | null;
  created_at:   string;
}

export function ServiceKeysView() {
  const mneme = useMneme();
  const qc    = useQueryClient();
  const [newKey, setNewKey] = useState<{ key: string; scope: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["service-keys"],
    enabled:  !!mneme,
    queryFn:  () => mneme!.serviceKeys.list(),
  });

  const create = useMutation({
    mutationFn: (args: { scope: string; label: string; rpm_limit: number }) =>
      mneme!.serviceKeys.create(args),
    onSuccess: (r) => {
      setNewKey({ key: r.key, scope: r.scope });
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ["service-keys"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: number) => mneme!.serviceKeys.revoke(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["service-keys"] }),
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="text-ink-500 text-xs uppercase tracking-wider">service accounts</div>
          <h1 className="text-3xl font-semibold mt-1">API keys</h1>
          <div className="text-xs text-ink-500 mt-2 max-w-2xl leading-relaxed">
            For B2B2C integrations — give your users access to your Mneme schema without
            distributing your wallet. Each key is scoped to a table-name prefix
            (e.g. <code className="font-mono text-gold-300/80">app_xyz</code> → only tables starting with{" "}
            <code className="font-mono text-gold-300/80">app_xyz_</code>).
          </div>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="shrink-0 px-4 py-2 rounded-lg bg-gold-300 hover:bg-gold-200 text-black font-semibold text-sm transition"
        >
          {showCreate ? "Cancel" : "Create new key"}
        </button>
      </div>

      {/* ─── Show newly minted key ──────────────────────────── */}
      {newKey && (
        <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-5 mb-6">
          <div className="text-xs uppercase tracking-wider text-emerald-400/90 mb-2">key created — save it now</div>
          <div className="font-mono text-sm bg-ink-950 border border-ink-800 rounded-lg p-3 break-all select-all">
            {newKey.key}
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="text-xs text-ink-400">
              Scope: <code className="text-gold-300">{newKey.scope}</code> · This is the only time this value is shown.
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(newKey.key).then(() => alert("Copied."))}
              className="text-xs text-gold-300 hover:text-gold-200 px-2 py-1 rounded border border-gold-300/30"
            >
              Copy
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-xs text-ink-500 hover:text-white mt-3">
            Dismiss
          </button>
        </div>
      )}

      {/* ─── Create form ──────────────────────────── */}
      {showCreate && <CreateForm onCreate={(args) => create.mutate(args)} pending={create.isPending} />}

      {/* ─── Keys list ──────────────────────────── */}
      {isLoading ? (
        <Skeleton />
      ) : !data?.keys?.length ? (
        <Empty />
      ) : (
        <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-950 text-left text-xs text-ink-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium">Prefix</th>
                <th className="px-4 py-3 font-medium">Rate limit</th>
                <th className="px-4 py-3 font-medium">Last used</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.keys.map((k) => (
                <KeyRowCmp key={k.id} k={k} onRevoke={() => confirm(`Revoke key ${k.key_prefix}…?`) && revoke.mutate(k.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateForm({ onCreate, pending }: { onCreate: (args: { scope: string; label: string; rpm_limit: number }) => void; pending: boolean }) {
  const [scope, setScope]   = useState("");
  const [label, setLabel]   = useState("");
  const [rpm, setRpm]       = useState(1200);
  const valid = /^[a-z][a-z0-9_]{0,62}$/.test(scope);

  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-ink-400 mb-1 block">Scope (table-name prefix)</label>
          <input
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="app_xyz"
            className={`w-full bg-ink-950 border rounded-lg px-3 py-2 font-mono text-sm text-white outline-none ${
              scope === "" ? "border-ink-800" : valid ? "border-emerald-500/40" : "border-red-500/40"
            }`}
          />
          <div className="text-[10px] text-ink-500 mt-1">lowercase ident — key can only touch tables starting with this</div>
        </div>
        <div>
          <label className="text-xs text-ink-400 mb-1 block">Label (optional)</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Production · app_xyz"
            className="w-full bg-ink-950 border border-ink-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-gold-300/40"
          />
        </div>
        <div>
          <label className="text-xs text-ink-400 mb-1 block">Rate limit (req/min)</label>
          <input
            type="number"
            value={rpm}
            min={60} max={10000}
            onChange={(e) => setRpm(Number(e.target.value))}
            className="w-full bg-ink-950 border border-ink-800 rounded-lg px-3 py-2 font-mono text-sm text-white outline-none focus:border-gold-300/40"
          />
        </div>
      </div>
      <div className="flex items-center justify-end mt-4">
        <button
          onClick={() => onCreate({ scope, label, rpm_limit: rpm })}
          disabled={!valid || pending}
          className="px-4 py-2 rounded-lg bg-gold-300 hover:bg-gold-200 text-black font-semibold text-sm transition disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create key"}
        </button>
      </div>
    </div>
  );
}

function KeyRowCmp({ k, onRevoke }: { k: KeyRow; onRevoke: () => void }) {
  const fmt = (d: string | null) => d ? new Date(d).toLocaleString() : "—";
  return (
    <tr className={`border-t border-ink-900/60 ${k.revoked ? "opacity-40" : ""}`}>
      <td className="px-4 py-3 text-ink-200">{k.label ?? <span className="text-ink-500 italic">—</span>}</td>
      <td className="px-4 py-3 font-mono text-gold-300/90">{k.scope}</td>
      <td className="px-4 py-3 font-mono text-xs text-ink-400">{k.key_prefix}…</td>
      <td className="px-4 py-3 font-mono text-xs text-ink-300">{k.rpm_limit}/min</td>
      <td className="px-4 py-3 text-xs text-ink-400">{fmt(k.last_used_at)}</td>
      <td className="px-4 py-3 text-xs text-ink-400">{fmt(k.created_at)}</td>
      <td className="px-4 py-3 text-right">
        {k.revoked ? (
          <span className="text-xs text-red-400/60">revoked</span>
        ) : (
          <button
            onClick={onRevoke}
            className="text-xs text-red-400/70 hover:text-red-400 px-2 py-1 rounded"
          >
            Revoke
          </button>
        )}
      </td>
    </tr>
  );
}

function Empty() {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-12 text-center">
      <div className="text-ink-400 text-sm mb-2">No API keys yet.</div>
      <div className="text-xs text-ink-500 max-w-md mx-auto leading-relaxed">
        Use service keys to give your end-users (or your apps) scoped access to your
        Mneme schema without distributing your wallet. Each key is restricted to a
        table-name prefix you define.
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[1,2,3].map((i) => <div key={i} className="h-12 rounded bg-ink-900 animate-pulse" />)}
    </div>
  );
}
