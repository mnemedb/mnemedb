import { useEffect, useRef, useState } from "react";
import { useMneme } from "../lib/mneme-client";

const QUERY_HISTORY_KEY  = "mneme.sql.history";
const QUERY_DRAFT_KEY    = "mneme.sql.draft";
const MAX_HISTORY        = 30;

const EXAMPLES: Array<{ label: string; query: string }> = [
  { label: "Count rows per table", query:
`SELECT
  table_name,
  (SELECT count(*) FROM information_schema.tables t2 WHERE t2.table_name = t.table_name) AS exists
FROM information_schema.tables t
WHERE table_schema = current_schema()
ORDER BY table_name` },
  { label: "Recent memories",       query: `SELECT id, text, created_at\nFROM memories\nORDER BY created_at DESC\nLIMIT 20` },
  { label: "All your tables",       query: `SELECT table_name, (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM '||quote_ident(table_schema)||'.'||quote_ident(table_name), true, true, '')))[1]::text::int AS row_count\nFROM information_schema.tables\nWHERE table_schema = current_schema()\nORDER BY table_name` },
  { label: "Create a table",        query: `CREATE TABLE IF NOT EXISTS books (\n  id     bigserial PRIMARY KEY,\n  title  text NOT NULL,\n  author text,\n  rating int,\n  created_at timestamptz DEFAULT now()\n)` },
  { label: "Insert a row",          query: `INSERT INTO books (title, author, rating)\nVALUES ('Dune', 'Frank Herbert', 5)\nRETURNING *` },
  { label: "Update row by filter",  query: `UPDATE books\nSET rating = rating + 1\nWHERE title ILIKE 'dune%'\nRETURNING *` },
  { label: "Group by + aggregate",  query: `SELECT author, count(*) AS book_count, avg(rating) AS avg_rating\nFROM books\nGROUP BY author\nORDER BY book_count DESC` },
  { label: "Vector KNN (custom SQL)", query: `-- replace the 1536-dim array with your real query vector\nSELECT id, text, embedding <-> '[0.1, 0.2, ...]'::vector AS distance\nFROM memories\nORDER BY distance\nLIMIT 5` },
];

interface HistoryEntry { query: string; ok: boolean; rows: number; ms: number; at: number }

interface SqlResult {
  rows:       Record<string, unknown>[];
  row_count:  number;
  columns:    string[];
  truncated:  boolean;
  elapsed_ms: number;
}

export function SqlEditor() {
  const mneme = useMneme();
  const [query, setQuery]       = useState(() => localStorage.getItem(QUERY_DRAFT_KEY) ?? "SELECT 1");
  const [result, setResult]     = useState<SqlResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [running, setRunning]   = useState(false);
  const [history, setHistory]   = useState<HistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(QUERY_HISTORY_KEY) ?? "[]"); }
    catch { return []; }
  });
  const ta = useRef<HTMLTextAreaElement>(null);

  // Draft persistence
  useEffect(() => { localStorage.setItem(QUERY_DRAFT_KEY, query); }, [query]);

  const run = async () => {
    if (!mneme || !query.trim() || running) return;
    setRunning(true);
    setError(null);
    const t0 = performance.now();
    try {
      const r = await mneme.sql(query);
      setResult(r);
      const entry: HistoryEntry = { query, ok: true, rows: r.row_count, ms: r.elapsed_ms, at: Date.now() };
      const next = [entry, ...history].slice(0, MAX_HISTORY);
      setHistory(next);
      localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(next));
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setResult(null);
      const entry: HistoryEntry = { query, ok: false, rows: 0, ms: Math.round(performance.now() - t0), at: Date.now() };
      const next = [entry, ...history].slice(0, MAX_HISTORY);
      setHistory(next);
      localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(next));
    } finally {
      setRunning(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter → run
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void run();
    }
    // Tab → indent (don't lose focus)
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const t = e.currentTarget;
      const start = t.selectionStart;
      const end   = t.selectionEnd;
      setQuery((q) => q.slice(0, start) + "  " + q.slice(end));
      setTimeout(() => { t.selectionStart = t.selectionEnd = start + 2; }, 0);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="text-ink-500 text-xs uppercase tracking-wider">sql</div>
        <h1 className="text-3xl font-semibold mt-1">SQL editor</h1>
        <div className="text-xs text-ink-500 mt-2 max-w-2xl leading-relaxed">
          Run any SQL against your schema. <kbd className="font-mono text-gold-300/80">⌘/Ctrl + Enter</kbd> to run.
          Statement timeout 5s · 1000-row result cap · single statement only ·
          cross-tenant references blocked.
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* ─── Left: examples + history ──────────────────────────── */}
        <div className="col-span-3 space-y-4">
          <Panel title="Examples">
            <div className="space-y-1">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  onClick={() => { setQuery(ex.query); ta.current?.focus(); }}
                  className="block w-full text-left text-xs text-ink-300 hover:text-white px-2 py-1.5 rounded hover:bg-ink-800 transition truncate"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="History">
            {history.length === 0 ? (
              <div className="text-xs text-ink-500 italic">No queries yet.</div>
            ) : (
              <div className="space-y-1 max-h-96 overflow-auto">
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => { setQuery(h.query); ta.current?.focus(); }}
                    className="block w-full text-left text-[11px] px-2 py-1.5 rounded hover:bg-ink-800 transition border-l-2 border-transparent hover:border-gold-300/40 group"
                    title={h.query}
                  >
                    <div className="font-mono truncate text-ink-300 group-hover:text-white">
                      {h.query.split("\n")[0]?.slice(0, 40)}{h.query.length > 40 ? "…" : ""}
                    </div>
                    <div className="flex items-center justify-between mt-0.5 text-ink-600">
                      <span className={h.ok ? "text-emerald-400/70" : "text-red-400/70"}>{h.ok ? `${h.rows} rows` : "error"}</span>
                      <span>{h.ms}ms</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ─── Right: editor + results ──────────────────────────── */}
        <div className="col-span-9 space-y-4">
          <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-ink-800 flex items-center justify-between">
              <span className="text-xs text-ink-500 font-mono">query.sql</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuery("")}
                  className="text-xs text-ink-500 hover:text-white px-2 py-1"
                >
                  Clear
                </button>
                <button
                  onClick={() => void run()}
                  disabled={running || !mneme}
                  className="px-4 py-1.5 bg-gold-300 text-black text-sm font-semibold rounded hover:bg-gold-200 disabled:opacity-50 transition"
                >
                  {running ? "Running…" : "Run ⌘↵"}
                </button>
              </div>
            </div>
            <textarea
              ref={ta}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              className="w-full h-72 bg-ink-950 text-ink-100 px-5 py-4 font-mono text-sm resize-none outline-none placeholder:text-ink-600 leading-relaxed"
              placeholder="-- write SQL here, then ⌘↵"
            />
          </div>

          {/* ─── Result panel ──────────────────────────── */}
          {error && (
            <div className="bg-red-500/5 border border-red-500/30 rounded-xl p-4">
              <div className="text-xs uppercase tracking-wider text-red-400/80 mb-1">error</div>
              <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap">{error}</pre>
            </div>
          )}

          {result && (
            <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-ink-800 flex items-center justify-between text-xs text-ink-500">
                <span>
                  <span className="text-gold-300">{result.row_count}</span> rows
                  {result.truncated && <span className="text-amber-400/80 ml-2">(truncated to 1000)</span>}
                </span>
                <span className="font-mono">{result.elapsed_ms} ms</span>
              </div>
              {result.rows.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-ink-500 italic">
                  Query OK · no rows returned (likely DDL or DELETE/UPDATE without RETURNING).
                </div>
              ) : (
                <div className="overflow-auto max-h-[28rem]">
                  <table className="w-full text-xs font-mono">
                    <thead className="bg-ink-950 sticky top-0">
                      <tr className="text-ink-400 text-left">
                        {result.columns.map((c) => (
                          <th key={c} className="px-4 py-2 font-normal border-b border-ink-800 whitespace-nowrap">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="border-b border-ink-900/60 hover:bg-ink-950/50">
                          {result.columns.map((c) => (
                            <td key={c} className="px-4 py-2 align-top max-w-md truncate text-ink-200" title={renderCell(row[c])}>
                              {renderCell(row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-ink-900 border border-ink-800 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider text-ink-500 px-1 mb-2">{title}</div>
      {children}
    </div>
  );
}

function renderCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object")          return JSON.stringify(v);
  if (typeof v === "string" && v.length > 200) return v.slice(0, 200) + "…";
  return String(v);
}
