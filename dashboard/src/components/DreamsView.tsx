import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMneme } from "../lib/mneme-client";

interface Dream {
  id:         number;
  kind:       string;
  title:      string;
  body:       string;
  sources:    string[];
  model:      string | null;
  created_at: string;
}

/**
 * Mneme Dreams — async LLM reflections on this project's data.
 *
 * The gateway runs a background worker (~daily) that reads recent
 * memories/entities/relations/streams and generates non-obvious
 * observations (patterns / questions / gaps / synthesis). Users can also
 * trigger a fresh dream pass right now via the "Dream now" button.
 */
export function DreamsView() {
  const mneme = useMneme();
  const qc    = useQueryClient();
  const [hint, setHint] = useState("");
  const [filter, setFilter] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["dreams", filter],
    enabled:  !!mneme,
    queryFn:  () => mneme!.dreams.list({ limit: 50, kind: filter || undefined }),
  });

  const generate = useMutation({
    mutationFn: () => mneme!.dreams.generate({ hint: hint || undefined, max_dreams: 3 }),
    onSuccess:  () => {
      setHint("");
      qc.invalidateQueries({ queryKey: ["dreams"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => mneme!.dreams.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["dreams"] }),
  });

  const dreams = data?.dreams ?? [];

  return (
    <div className="p-8 max-w-5xl mx-auto">

      {/* ────── header ─────────────────────────────────────────── */}
      <div className="flex items-end justify-between mb-2 flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gold-300/80 mb-1">mneme dreams</div>
          <h1 className="text-3xl font-semibold tracking-tight">What your database thinks</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300 px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"></span>
          worker live
        </span>
      </div>
      <p className="text-ink-400 text-sm leading-relaxed max-w-2xl mb-8">
        Every day Mneme reads your recent memories, entities, relations and
        streams and surfaces non-obvious patterns, open questions, and missing
        data. Trigger a fresh pass any time — the worker also runs on its own.
      </p>

      {/* ────── generate panel ────────────────────────────────── */}
      <div className="bg-ink-900/60 border border-ink-800 rounded-xl p-5 mb-8">
        <label className="text-xs text-ink-400 mb-2 block">
          Focus hint <span className="text-ink-600">(optional — biases the LLM toward a topic)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder='e.g. "focus on edges leading to MNEME" or "anything missing from my graph"'
            className="flex-1 bg-ink-950 border border-ink-800 rounded-lg px-3 py-2 text-sm text-marble-100 placeholder:text-ink-600 focus:outline-none focus:border-gold-300/50"
            disabled={generate.isPending}
            onKeyDown={(e) => { if (e.key === "Enter" && !generate.isPending) generate.mutate(); }}
          />
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="px-5 py-2 rounded-lg bg-gold-300 text-black font-medium hover:bg-gold-200 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm whitespace-nowrap"
          >
            {generate.isPending ? "dreaming…" : "Dream now"}
          </button>
        </div>
        {generate.isError && (
          <div className="mt-3 text-xs text-rose-400">
            {(generate.error as Error).message}
          </div>
        )}
        {generate.data && !generate.data.ok && (
          <div className="mt-3 text-xs text-ink-400">{generate.data.reason}</div>
        )}
        {generate.data && generate.data.ok && (
          <div className="mt-3 text-xs text-emerald-300">
            ✓ {generate.data.count} new dream{generate.data.count !== 1 ? "s" : ""} · {generate.data.records_considered} records read · {generate.data.elapsed_ms}ms
          </div>
        )}
      </div>

      {/* ────── filter chips ──────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <KindChip label="all"       active={filter === ""}          onClick={() => setFilter("")} />
        <KindChip label="pattern"   active={filter === "pattern"}   onClick={() => setFilter("pattern")} />
        <KindChip label="question"  active={filter === "question"}  onClick={() => setFilter("question")} />
        <KindChip label="gap"       active={filter === "gap"}       onClick={() => setFilter("gap")} />
        <KindChip label="synthesis" active={filter === "synthesis"} onClick={() => setFilter("synthesis")} />
      </div>

      {/* ────── dream list ────────────────────────────────────── */}
      {isLoading && <div className="text-ink-500 text-sm py-12 text-center">Loading dreams…</div>}
      {!isLoading && dreams.length === 0 && (
        <div className="text-center py-16 border border-dashed border-ink-800 rounded-xl">
          <div className="text-ink-500 mb-2">no dreams yet</div>
          <div className="text-ink-600 text-xs">add some memories or entities then hit "Dream now"</div>
        </div>
      )}
      <div className="space-y-4">
        {dreams.map((d: Dream) => (
          <DreamCard key={d.id} dream={d} onDelete={() => remove.mutate(d.id)} />
        ))}
      </div>
    </div>
  );
}

// ─── DreamCard ────────────────────────────────────────────────────────

function DreamCard({ dream, onDelete }: { dream: Dream; onDelete: () => void }) {
  return (
    <div className="bg-ink-900/40 border border-ink-800 hover:border-ink-700 rounded-xl p-5 transition group">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          <KindBadge kind={dream.kind} />
          <h3 className="text-marble-100 font-medium leading-tight truncate">{dream.title}</h3>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-ink-600">{relativeTime(dream.created_at)}</span>
          <button
            onClick={onDelete}
            className="text-ink-700 hover:text-rose-400 transition opacity-0 group-hover:opacity-100 text-xs"
            title="Delete dream"
          >
            ×
          </button>
        </div>
      </div>
      <p className="text-ink-300 text-sm leading-relaxed whitespace-pre-wrap">{dream.body}</p>
      {dream.sources && dream.sources.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {dream.sources.map((s, i) => (
            <span key={i} className="text-[10px] font-mono text-ink-500 bg-ink-950 border border-ink-800 px-1.5 py-0.5 rounded">
              {s}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-[10px] text-ink-700">
        <span>#{dream.id}</span>
        {dream.model && <span>{dream.model.split("/").pop()}</span>}
      </div>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const cfg: Record<string, { bg: string; fg: string; border: string }> = {
    pattern:   { bg: "bg-gold-300/15",   fg: "text-gold-300",    border: "border-gold-300/40"   },
    question:  { bg: "bg-amber-300/15",  fg: "text-amber-300",   border: "border-amber-300/40"  },
    gap:       { bg: "bg-rose-400/10",   fg: "text-rose-300",    border: "border-rose-400/40"   },
    synthesis: { bg: "bg-marble-100/10", fg: "text-marble-100",  border: "border-marble-100/30" },
  };
  const c = cfg[kind.toLowerCase()] ?? { bg: "bg-ink-800", fg: "text-ink-300", border: "border-ink-700" };
  return (
    <span className={`text-[10px] uppercase tracking-[0.15em] font-medium px-2 py-0.5 rounded-full border ${c.bg} ${c.fg} ${c.border} shrink-0`}>
      {kind}
    </span>
  );
}

function KindChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1)    return "just now";
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
