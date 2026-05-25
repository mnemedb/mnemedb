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

  const counts = stats?.tables ?? {};
  const totals = stats?.totals;

  const { data: quota } = useQuery({
    queryKey:        ["storage", "quota"],
    enabled:         !!mneme,
    refetchInterval: 15_000,
    queryFn:         () => mneme!.storage.quota(),
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="text-ink-500 text-xs uppercase tracking-wider">your project</div>
        <h1 className="text-3xl font-semibold font-mono mt-1">{project.handle}.mneme</h1>
        <div className="text-xs text-ink-500 font-mono mt-2">schema: {project.schema_name}</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard label="memories"  value={counts.memories  ?? 0} />
        <StatCard label="documents" value={counts.documents ?? 0} />
        <StatCard label="events"    value={counts.events    ?? 0} />
        <StatCard label="kvs"       value={counts.kvs       ?? 0} />
      </div>

      {totals && (
        <div className="text-xs text-ink-500 mb-8">
          {totals.rows.toLocaleString()} total rows
          {" · "}
          {totals.custom_tables} custom {totals.custom_tables === 1 ? "table" : "tables"}
          {" · "}
          create more with{" "}
          <code className="font-mono text-gold-300/80">mneme.createTable(…)</code>
        </div>
      )}

      {/* ─── Storage strip ─────────────────────────────────────────── */}
      {quota && (
        <div className="bg-ink-900 border border-ink-800 rounded-xl p-5 mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <div className="text-ink-500 text-xs uppercase tracking-wider">storage</div>
              <div className="font-mono text-xl mt-1">
                {fmtBytes(quota.bytes_used)} <span className="text-ink-500 text-sm">/ {fmtBytes(quota.bytes_limit)}</span>
              </div>
            </div>
            <div className="text-xs text-ink-500 max-w-xs text-right">
              Files served from <code className="font-mono text-gold-300/80">cdn.mnemedb.dev</code>.
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

      <McpSetupCard />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-5">
      <div className="text-ink-500 text-xs uppercase tracking-wider">{label}</div>
      <div className="text-3xl font-semibold font-mono mt-1">
        {value.toLocaleString()}
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
