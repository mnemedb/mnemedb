import { useQuery } from "@tanstack/react-query";
import { useMneme } from "../lib/mneme-client";
import type { ProjectInfo } from "../lib/project";
import { McpSetupCard } from "./McpSetupCard";

interface Props {
  project: ProjectInfo;
}

export function ProjectHome({ project }: Props) {
  const mneme = useMneme();

  const { data: stats } = useQuery({
    queryKey:        ["stats"],
    enabled:         !!mneme,
    refetchInterval: 10_000,
    queryFn:         () => mneme!.stats(),
  });

  const { data: quota } = useQuery({
    queryKey:        ["storage", "quota"],
    enabled:         !!mneme,
    refetchInterval: 15_000,
    queryFn:         () => mneme!.storage.quota(),
  });

  const counts = stats?.tables ?? {};
  const totals = stats?.totals;
  const totalRows = totals?.rows ?? 0;
  const isEmpty   = totalRows === 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* ─── Welcome header ───────────────────────────────────── */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-ink-500 text-xs uppercase tracking-wider">your project</div>
          <h1 className="text-4xl font-semibold mt-1 tracking-tight">
            <span className="font-mono">{project.handle}</span><span className="text-ink-600">.mneme</span>
          </h1>
          <div className="text-xs text-ink-500 font-mono mt-2">
            schema · <span className="text-ink-300">{project.schema_name}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-ink-500 text-xs uppercase tracking-wider">network</div>
          <div className="flex items-center gap-2 mt-1 justify-end">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></span>
            <span className="text-sm">Base · mainnet</span>
          </div>
        </div>
      </div>

      {/* ─── Stat cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="memories"  value={counts.memories  ?? 0} icon="◆" />
        <StatCard label="documents" value={counts.documents ?? 0} icon="◇" />
        <StatCard label="events"    value={counts.events    ?? 0} icon="◈" />
        <StatCard label="kvs"       value={counts.kvs       ?? 0} icon="◉" />
      </div>

      {totals && (
        <div className="text-xs text-ink-500 mb-8 px-1">
          <span className="text-ink-300">{totalRows.toLocaleString()}</span> total rows
          {" · "}
          <span className="text-ink-300">{totals.custom_tables}</span> custom {totals.custom_tables === 1 ? "table" : "tables"}
          {" · "}
          create more with{" "}
          <code className="font-mono text-gold-300/80">mneme.createTable(…)</code>
        </div>
      )}

      {/* ─── Storage strip ───────────────────────────────────── */}
      {quota && (
        <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-ink-500 text-xs uppercase tracking-wider">storage</div>
              <div className="font-mono text-xl mt-1">
                {fmtBytes(quota.bytes_used)} <span className="text-ink-500 text-sm">/ {fmtBytes(quota.bytes_limit)}</span>
              </div>
            </div>
            <div className="text-xs text-ink-500 max-w-xs text-right">
              Files served at <code className="font-mono text-gold-300/80">cdn.mnemedb.dev</code>.
              Burn <span className="text-gold-300">$MNEME</span> to extend.
            </div>
          </div>
          <div className="h-1.5 bg-ink-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold-300 to-gold-500 transition-all"
              style={{ width: `${Math.min(100, Math.round((quota.bytes_used / Math.max(1, quota.bytes_limit)) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* ─── Empty-state onboarding (only if no data) ──────── */}
      {isEmpty && <GettingStarted handle={project.handle} />}

      {/* ─── MCP setup card ──────────────────────────────────── */}
      <McpSetupCard />
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon?: string }) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-2xl p-5 group hover:border-gold-300/30 transition">
      <div className="flex items-center justify-between mb-1">
        <div className="text-ink-500 text-xs uppercase tracking-wider">{label}</div>
        {icon && <div className="text-gold-300/40 text-sm">{icon}</div>}
      </div>
      <div className="text-3xl font-semibold font-mono">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function GettingStarted({ handle }: { handle: string }) {
  return (
    <div className="bg-gradient-to-br from-ink-900 to-ink-950 border border-gold-300/20 rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gold-300 text-lg">✦</span>
        <h3 className="text-lg font-semibold">Getting started</h3>
      </div>
      <p className="text-ink-400 text-sm mb-5 leading-relaxed">
        Your project is live. Pick any of the four paths below to put your first
        row in <code className="font-mono text-gold-300/80">agent_{handle}</code>.
      </p>

      <div className="grid md:grid-cols-2 gap-3">
        <StartStep
          num="1"
          title="From the SQL Editor"
          desc="Hit the SQL tab on the left → run the Insert example → see your row appear in Tables."
        />
        <StartStep
          num="2"
          title="From your TypeScript app"
          desc={
            <>Install <code className="font-mono text-gold-300/80">mneme-sdk</code>, paste your wallet's
            private key, then <code className="font-mono text-gold-300/80">m.memories.insert(...)</code>.</>
          }
        />
        <StartStep
          num="3"
          title="From Claude or Cursor"
          desc={<>Configure MCP with <code className="font-mono text-gold-300/80">npx mneme-mcp</code> — your
          agent gets 15 tools. See Setup card below.</>}
        />
        <StartStep
          num="4"
          title="For your end-users (B2B2C)"
          desc={<>Mint a scoped API key from the <strong>API keys</strong> tab → distribute to your apps →
          their CRUD calls land in your schema, namespace-isolated.</>}
        />
      </div>
    </div>
  );
}

function StartStep({ num, title, desc }: { num: string; title: string; desc: React.ReactNode }) {
  return (
    <div className="bg-ink-950/60 border border-ink-800 rounded-xl p-4 hover:border-gold-300/30 transition">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-gold-300/10 border border-gold-300/30 text-gold-300 text-xs font-mono flex items-center justify-center shrink-0">
          {num}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm mb-1">{title}</div>
          <div className="text-xs text-ink-400 leading-relaxed">{desc}</div>
        </div>
      </div>
    </div>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024)               return `${bytes} B`;
  if (bytes < 1024 * 1024)        return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
