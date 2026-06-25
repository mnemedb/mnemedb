import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";

interface Stats {
  memories: number; documents: number; events: number; kvs: number;
  entities: number; relations: number; dreams: number; mandates: number;
  mesh_listings?: number; mesh_queries?: number; mesh_revenue?: number;
}
interface GraphNode { id: number; kind: string; name: string; weight?: number }
interface GraphLink { source: number | GraphNode; target: number | GraphNode; kind: string }
interface ProfileResp {
  handle: string;
  schema: string;
  wallet: string;
  fork_url: string;
  profile_url: string;
  stats: Stats;
  graph: { nodes: GraphNode[]; links: GraphLink[] };
  recent_entities: Array<{ id: number; kind: string; name: string; created_at: string }>;
  recent_dreams:   Array<{ id: number; kind: string; title: string; created_at: string }>;
}

const GATEWAY = (import.meta as unknown as { env?: { VITE_GATEWAY_URL?: string } }).env?.VITE_GATEWAY_URL
  ?? "https://gateway.mnemedb.dev";

const KIND_COLOR: Record<string, string> = {
  person:   "#d4af37",
  token:    "#e8c574",
  protocol: "#a78bfa",
  contract: "#f6851b",
  wallet:   "#34d399",
  tweet:    "#22d3ee",
  cast:     "#22d3ee",
  repo:     "#f3e3a8",
  topic:    "#71717a",
};
const DEFAULT_NODE_COLOR = "#71717a";
const LINK_COLOR = "rgba(212, 175, 55, 0.35)";

export function MnemeCrystal() {
  const handle = useMemo(() => {
    if (typeof window === "undefined") return "";
    const m = window.location.pathname.match(/^\/m\/([a-z0-9_]+)/i);
    return m ? m[1]!.toLowerCase() : "";
  }, []);

  const [data,    setData]    = useState<ProfileResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    if (!handle) { setErr("invalid handle"); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${GATEWAY}/profile/${handle}`);
        if (!r.ok) throw new Error(r.status === 404 ? "agent not found" : `gateway ${r.status}`);
        const j = await r.json();
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (loading) return <FullScreen msg={`Loading ${handle}.mneme…`} />;
  if (err)     return <FullScreen msg={err} />;
  if (!data)   return <FullScreen msg="No data" />;

  return (
    <div className="min-h-screen bg-ink-950 text-white font-sans antialiased">

      {/* ─── header ─────────────────────────────────────────── */}
      <header className="border-b border-ink-900">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 group">
            <img src="/mnemelogo.png" alt="Mneme" className="h-8 w-auto object-contain" />
            <span className="font-semibold tracking-tight text-lg">Mneme</span>
            <span className="hidden md:inline text-[10px] uppercase tracking-[0.2em] text-gold-300/60 ml-2 pl-2 border-l border-ink-800">on Base</span>
          </a>
          <div className="flex items-center gap-3 text-sm">
            <a href="/" className="hidden sm:inline text-ink-400 hover:text-white transition">Mint your own</a>
            <button
              onClick={copyUrl}
              className="px-3 py-1.5 rounded-lg border border-ink-700 text-marble-100 hover:bg-ink-900 transition text-xs"
            >
              {copied ? "✓ copied" : "share"}
            </button>
          </div>
        </div>
      </header>

      {/* ─── hero — handle + summary ────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 pt-12 pb-6">
        <div className="text-xs uppercase tracking-[0.3em] text-gold-300/80 mb-3">a mneme crystal</div>
        <h1 className="text-5xl md:text-7xl font-semibold tracking-tight">
          <span className="text-gold-300">{data.handle}</span>
          <span className="text-ink-700">.mneme</span>
        </h1>
        <p className="text-ink-400 text-sm mt-3 font-mono">
          wallet · <span className="text-marble-100">{data.wallet.slice(0, 8)}…{data.wallet.slice(-6)}</span>
        </p>
      </section>

      {/* ─── stats strip ────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <Stat label="memories"  value={data.stats.memories} />
          <Stat label="docs"      value={data.stats.documents} />
          <Stat label="entities"  value={data.stats.entities}  accent />
          <Stat label="relations" value={data.stats.relations} accent />
          <Stat label="dreams"    value={data.stats.dreams} />
          <Stat label="mandates"  value={data.stats.mandates} />
          <Stat label="listings"  value={data.stats.mesh_listings ?? 0} />
          <Stat label="$ earned"  value={"$" + (data.stats.mesh_revenue ?? 0).toFixed(2)} />
        </div>
      </section>

      {/* ─── force graph (centerpiece) ──────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 pb-12">
        <div className="bg-ink-900/40 border border-ink-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between border-b border-ink-900">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-gold-300/80">the mind</div>
              <div className="text-sm text-marble-100">entities + relations · top {data.graph.nodes.length} nodes</div>
            </div>
            <div className="text-[10px] text-ink-500 hidden md:flex items-center gap-3">
              {Object.entries(KIND_COLOR).slice(0, 5).map(([k, c]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: c }} /> {k}
                </span>
              ))}
            </div>
          </div>
          <div className="h-[560px] bg-[radial-gradient(ellipse_at_center,_rgba(212,175,55,0.04),_transparent_70%)]">
            {data.graph.nodes.length > 0
              ? <Graph nodes={data.graph.nodes} links={data.graph.links} />
              : <EmptyGraph />}
          </div>
        </div>
      </section>

      {/* ─── recent dreams + entities ───────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 pb-12 grid md:grid-cols-2 gap-4">
        <Panel title="recent dreams" emptyText="no dreams yet">
          {data.recent_dreams.map((d) => (
            <li key={d.id} className="flex items-start gap-3 py-2 border-b border-ink-900 last:border-0">
              <KindPill kind={d.kind} />
              <div className="min-w-0 flex-1">
                <div className="text-marble-100 text-sm truncate">{d.title}</div>
                <div className="text-[10px] text-ink-600">{new Date(d.created_at).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </Panel>
        <Panel title="recent entities" emptyText="no entities yet">
          {data.recent_entities.map((e) => (
            <li key={e.id} className="flex items-start gap-3 py-2 border-b border-ink-900 last:border-0">
              <span className="text-[10px] uppercase tracking-wider text-gold-300/80 mt-1 shrink-0">{e.kind}</span>
              <div className="min-w-0 flex-1">
                <div className="text-marble-100 text-sm truncate">{e.name}</div>
                <div className="text-[10px] text-ink-600">{new Date(e.created_at).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </Panel>
      </section>

      {/* ─── footer CTA ─────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 md:px-10 pb-16 text-center">
        <div className="border-t border-ink-900 pt-12">
          <h2 className="text-2xl md:text-3xl font-semibold mb-2">Mint your own Crystal.</h2>
          <p className="text-ink-400 max-w-2xl mx-auto mb-6">
            Every Mneme schema gets a public profile like this. Pick a handle, give your agent a mind, share the link.
          </p>
          <a href="/" className="inline-block px-6 py-3 rounded-xl bg-gold-300 text-black font-semibold hover:bg-gold-200 transition">
            Start at mnemedb.dev →
          </a>
        </div>
      </section>
    </div>
  );
}

// ─── Force graph ────────────────────────────────────────────────────────
function Graph({ nodes, links }: { nodes: GraphNode[]; links: GraphLink[] }) {
  const ref = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      setSize({
        w: containerRef.current.clientWidth,
        h: containerRef.current.clientHeight,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Center + zoom-to-fit once the graph loads
  useEffect(() => {
    if (!ref.current || nodes.length === 0) return;
    const t = setTimeout(() => ref.current?.zoomToFit(800, 40), 350);
    return () => clearTimeout(t);
  }, [nodes.length]);

  // Memoize graph data — react-force-graph mutates nodes in place,
  // so we want a stable identity per render
  const graphData = useMemo(() => ({
    nodes: nodes.map((n) => ({ ...n })),
    links: links.map((l) => ({ ...l })),
  }), [nodes, links]);

  return (
    <div ref={containerRef} className="w-full h-full">
      {size.w > 0 && (
        <ForceGraph2D
          ref={ref}
          graphData={graphData}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          linkColor={() => LINK_COLOR}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={0.85}
          linkWidth={1}
          nodeRelSize={4}
          nodeCanvasObject={(node, ctx, scale) => {
            const r = 3 + Math.sqrt(node.weight ?? 1) * 2;
            const color = KIND_COLOR[node.kind] ?? DEFAULT_NODE_COLOR;
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.lineWidth = 1.2 / scale;
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.stroke();
            if (scale > 1.6) {
              ctx.font = `${10 / scale}px ui-sans-serif, system-ui`;
              ctx.fillStyle = "#f8f4ec";
              ctx.textAlign = "center";
              ctx.fillText(node.name, node.x!, node.y! + r + 8 / scale);
            }
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, 8, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          cooldownTicks={120}
        />
      )}
    </div>
  );
}

// ─── small helpers ──────────────────────────────────────────────────────
function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="bg-ink-900/40 border border-ink-800 rounded-xl px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 mb-0.5">{label}</div>
      <div className={`text-lg font-semibold ${accent ? "text-gold-300" : "text-marble-100"}`}>{value}</div>
    </div>
  );
}

function Panel({ title, emptyText, children }: { title: string; emptyText: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className="bg-ink-900/40 border border-ink-800 rounded-2xl p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-gold-300/80 mb-3">{title}</div>
      {items.length > 0 ? (
        <ul className="space-y-0">{children}</ul>
      ) : (
        <div className="text-xs text-ink-600">{emptyText}</div>
      )}
    </div>
  );
}

function KindPill({ kind }: { kind: string }) {
  const cfg: Record<string, string> = {
    pattern:   "bg-gold-300/15 text-gold-300 border-gold-300/40",
    question:  "bg-amber-300/15 text-amber-300 border-amber-300/40",
    gap:       "bg-rose-400/10 text-rose-300 border-rose-400/40",
    synthesis: "bg-marble-100/10 text-marble-100 border-marble-100/30",
  };
  const c = cfg[kind.toLowerCase()] ?? "bg-ink-800 text-ink-300 border-ink-700";
  return (
    <span className={`text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-full border ${c} shrink-0 mt-1`}>
      {kind}
    </span>
  );
}

function EmptyGraph() {
  return (
    <div className="h-full flex items-center justify-center text-center px-6">
      <div>
        <div className="text-ink-400 text-sm mb-1">this agent's mind is empty</div>
        <div className="text-ink-600 text-xs">no entities + relations yet</div>
      </div>
    </div>
  );
}

function FullScreen({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 text-ink-400 text-sm">
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <img src="/mnemelogo.png" alt="Mneme" className="h-9 w-auto opacity-80" />
        <div className="max-w-sm">{msg}</div>
        <a href="/" className="mt-3 text-gold-300 hover:text-gold-200 text-xs">← back to mnemedb.dev</a>
      </div>
    </div>
  );
}
