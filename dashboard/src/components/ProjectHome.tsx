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
