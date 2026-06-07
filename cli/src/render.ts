import { gold, goldSoft, ink, inkDim, marble, dim, ok, err } from "./theme";

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
      const raw = row[c];
      const v = fmtCell(raw);
      const truncated = v.length > MAX_CELL_WIDTH;
      const padded = (truncated ? v.slice(0, MAX_CELL_WIDTH - 1) + "…" : v).padEnd(widths[c]!);
      return ` ${colorizeCell(c, raw, padded)} `;
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
  if (typeof v === "number") {
    // Format percent-ish columns nicely
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v);
}

/** Color percent-change columns red/gold/green based on the raw value. */
function colorizeCell(col: string, raw: unknown, padded: string): string {
  if (typeof raw === "number" && /change|24h|delta|pct|%/i.test(col)) {
    return raw > 0 ? ok(padded) : raw < 0 ? err(padded) : marble(padded);
  }
  return marble(padded);
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
  const tip = (k: string, v: string) => `  ${gold(k.padEnd(18))} ${ink(v)}`;
  return [
    "",
    `  ${goldSoft("database")}`,
    tip("/tables",       "list every table in your schema"),
    tip("/schema X",     "show columns of table X"),
    tip("/sql Y",        "skip the LLM and run raw SQL Y directly"),
    tip("/quota",        "current storage quota + recent usage"),
    "",
    `  ${goldSoft("chat")}`,
    tip("/chat <msg>",   "ask Mneme anything — schema-aware Claude"),
    tip("/reset",        "clear chat history"),
    "",
    `  ${goldSoft("base ecosystem")}`,
    tip("/price <tok>",  "token price + 24h + mcap + liquidity (dexscreener)"),
    tip("/gas",          "current Base gas price + cost estimates"),
    tip("/trending",     "top boosted Base tokens"),
    tip("/new",          "newest Base token launches (last 24h)"),
    tip("/tvl",          "Base chain TVL + top protocols (defillama)"),
    tip("/wallet <addr>","ETH balance + EOA/contract status"),
    tip("/scan <addr>",  "on-chain summary (wallet or token)"),
    "",
    `  ${goldSoft("mneme live · chain streams")}  ${dim("(beta — onchain → your schema)")}`,
    tip("/watch ...",    "subscribe to a Base event → auto-INSERT into a table"),
    tip("/streams",      "list your active subscriptions"),
    tip("/unwatch <id>", "pause a stream"),
    "",
    `  ${goldSoft("mneme graph · entities + relations")}  ${dim("(hybrid vector+graph memory)")}`,
    tip("/entity add",   `add an entity: ${dim('/entity add person "vitalik" {"wallet":"0xd8…"}')}`),
    tip("/entity list",  "list entities (optionally filter by kind / name)"),
    tip("/relate",       `add an edge: ${dim('/relate person:vitalik holds token:MNEME')}`),
    tip("/neighbors id", "k-hop neighbors of an entity (default 1 hop)"),
    tip("/path a b",     "shortest path between two entities"),
    "",
    `  ${goldSoft("mneme dreams · async LLM reflection")}  ${dim("(your DB thinks for you)")}`,
    tip("/dream",        "generate dreams right now (3 by default)"),
    tip("/dream \"hint\"",  "generate with a focus hint"),
    tip("/dreams [N]",   "list last N dreams (default 10)"),
    "",
    `  ${goldSoft("session")}`,
    tip("/whoami",       "show your handle, wallet, gateway"),
    tip("/clear",        "clear the terminal"),
    tip("/help",         "this list"),
    tip("/exit",         "quit (also: Ctrl+D)"),
    "",
    `  ${goldSoft("plain english (no slash)")}`,
    `  ${ink("→ translated to SQL and executed against your schema")}`,
    `  ${dim('  "show me my 10 most recent memories"')}`,
    `  ${dim('  "count books grouped by author"')}`,
    `  ${dim('  "create a table todos with title and done"')}`,
    "",
  ].join("\n");
}
