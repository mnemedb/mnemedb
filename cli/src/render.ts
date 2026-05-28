import { gold, goldSoft, ink, inkDim, marble, dim } from "./theme";

const MAX_CELL_WIDTH    = 48;
const MAX_VISIBLE_ROWS  = 50;

/**
 * Pretty box-drawn table that auto-sizes columns.
 *   ┌────────┬──────────┐
 *   │ col1   │ col2     │
 *   ├────────┼──────────┤
 *   │ val    │ val      │
 *   └────────┴──────────┘
 */
export function renderTable(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) {
    return inkDim("  (no rows)");
  }
  const cols = columns ?? Object.keys(rows[0]!);
  const display = rows.slice(0, MAX_VISIBLE_ROWS);

  // Compute widths
  const widths: Record<string, number> = {};
  for (const c of cols) {
    widths[c] = Math.min(MAX_CELL_WIDTH, Math.max(c.length, ...display.map((r) => fmtCell(r[c]).length)));
  }

  const top  = "┌" + cols.map((c) => "─".repeat(widths[c]! + 2)).join("┬") + "┐";
  const mid  = "├" + cols.map((c) => "─".repeat(widths[c]! + 2)).join("┼") + "┤";
  const bot  = "└" + cols.map((c) => "─".repeat(widths[c]! + 2)).join("┴") + "┘";

  const header = "│" + cols.map((c) => ` ${goldSoft(c.padEnd(widths[c]!))} `).join("│") + "│";

  const body = display.map((row) =>
    "│" + cols.map((c) => {
      const v = fmtCell(row[c]);
      const truncated = v.length > MAX_CELL_WIDTH;
      const cell = (truncated ? v.slice(0, MAX_CELL_WIDTH - 1) + "…" : v).padEnd(widths[c]!);
      return ` ${marble(cell)} `;
    }).join("│") + "│"
  ).join("\n");

  const truncationNote = rows.length > MAX_VISIBLE_ROWS
    ? "\n" + inkDim(`  (showing first ${MAX_VISIBLE_ROWS} of ${rows.length} rows)`)
    : "";

  return `${ink(top)}\n${header}\n${ink(mid)}\n${body}\n${ink(bot)}${truncationNote}`;
}

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return s.length > MAX_CELL_WIDTH ? s.slice(0, MAX_CELL_WIDTH - 1) + "…" : s;
  }
  return String(v);
}

/** Render generated SQL with subtle syntax coloring of common keywords. */
export function renderSql(sql: string): string {
  const KW = /\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|IS|NULL|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP BY|ORDER BY|LIMIT|OFFSET|DESC|ASC|INSERT INTO|VALUES|RETURNING|UPDATE|SET|DELETE|CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE INDEX|ON|USING|WITH|AS|CASE|WHEN|THEN|ELSE|END|DISTINCT|COUNT|SUM|AVG|MAX|MIN|COALESCE|EXTRACT|CAST)\b/gi;
  return sql.replace(KW, (m) => goldSoft(m));
}

export function renderError(msg: string): string {
  return `${ink("│")} ${msg}`;
}

export function renderHelp(): string {
  const tip = (k: string, v: string) => `  ${gold(k.padEnd(14))} ${ink(v)}`;
  return [
    "",
    `  ${goldSoft("commands")}`,
    tip("/tables",   "list every table in your schema"),
    tip("/schema X", "show columns of table X"),
    tip("/sql Y",    "skip the LLM and run raw SQL Y directly"),
    tip("/quota",    "current storage quota + recent usage"),
    tip("/whoami",   "show your handle, wallet, gateway"),
    tip("/clear",    "clear the terminal"),
    tip("/help",     "this list"),
    tip("/exit",     "quit (also: Ctrl+D)"),
    "",
    `  ${goldSoft("anything else")}`,
    `  ${ink("→ treated as natural language → translated to SQL → executed")}`,
    `  ${ink("  examples:")}`,
    `  ${dim('  "show me my 10 most recent memories"')}`,
    `  ${dim('  "count books grouped by author"')}`,
    `  ${dim('  "create a table called todos with title and done columns"')}`,
    "",
  ].join("\n");
}
