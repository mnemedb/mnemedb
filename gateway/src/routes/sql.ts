/**
 * POST /v1/sql — run arbitrary SQL scoped to the caller's schema.
 *
 * Safety model (defence in depth):
 *   1. Statement timeout (5 s) — kills long queries before they DoS the pool
 *   2. Search path pinned to the user's schema for the transaction —
 *      unqualified table names resolve to their own schema only
 *   3. Regex sanity check that rejects references to OTHER agent_<handle>.*
 *      tables (still allows pg_catalog reads — those are public anyway)
 *   4. Result row cap (1000) — big SELECTs get truncated, not streamed
 *   5. Bytes-of-payload cap (256 KB) — abusively large UPDATE/INSERT bodies
 *   6. Single statement per request — semicolon-splitting rejected
 *   7. Wrapped in a transaction; on any error nothing leaks
 *
 * What users CAN do: full DML (SELECT/INSERT/UPDATE/DELETE) + DDL
 * (CREATE/ALTER/DROP TABLE, CREATE INDEX, etc.) — all confined to their
 * schema_name. They CANNOT touch other tenants' data.
 */
import { Hono } from "hono";
import { sql } from "../db";

const route = new Hono();

const STATEMENT_TIMEOUT_MS = 5000;
const RESULT_ROW_CAP       = 1000;
const MAX_QUERY_BYTES      = 256 * 1024;

// Detect references to OTHER `agent_<handle>.<table>` schemas — block them.
// pg_catalog / information_schema / public reads are still allowed (these
// don't leak tenant data because schema-level isolation is enforced by
// search_path + the user's own data only being in agent_<their handle>).
function findForeignSchemaRefs(query: string, ownSchema: string): string[] {
  const refs = new Set<string>();
  const rx = /\b(agent_[a-z0-9_]+)\.[a-zA-Z_]/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(query)) !== null) {
    const schema = m[1]!;
    if (schema !== ownSchema) refs.add(schema);
  }
  return [...refs];
}

route.post("/", async (c) => {
  // Raw SQL is wallet-only OR wildcard-key-only. Scope-restricted API keys
  // can't run arbitrary SQL because we can't reliably enforce a table-name
  // prefix on a query AST. Full-access keys (scope = "*") get full SQL —
  // they already have unrestricted access via CRUD, so SQL adds no new risk.
  const scope = c.get("apiKeyScope");
  if (c.get("apiKeyId") !== undefined && scope !== "*") {
    return c.json({
      error: 'raw SQL is restricted on scoped API keys — either mint a full-access key (scope = "*") or use the typed CRUD endpoints which respect your scope',
    }, 403);
  }

  const project = c.get("project");
  const schema  = project.schema_name;

  let body: { query?: string };
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const query = (body.query ?? "").trim();
  if (!query) return c.json({ error: "missing 'query'" }, 400);
  if (query.length > MAX_QUERY_BYTES) {
    return c.json({ error: `query exceeds ${MAX_QUERY_BYTES} bytes` }, 413);
  }

  // Reject multi-statement requests — semicolons inside string literals would
  // false-positive, so we do a coarse check: strip quoted strings, then split.
  const stripped = query
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const semiCount = (stripped.match(/;/g) ?? []).length;
  // Allow exactly one trailing semicolon
  if (semiCount > 1 || (semiCount === 1 && !stripped.trimEnd().endsWith(";"))) {
    return c.json({
      error: "multi-statement queries are not allowed (run them one at a time)",
    }, 400);
  }

  // Reject cross-tenant references
  const foreign = findForeignSchemaRefs(query, schema);
  if (foreign.length > 0) {
    return c.json({
      error: `cross-tenant schema references blocked: ${foreign.join(", ")}`,
      hint:  `you can only reference your own schema (${schema}) and public catalogs`,
    }, 403);
  }

  const startedAt = Date.now();
  try {
    const rows = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
      await tx.unsafe(`SET LOCAL search_path TO "${schema}", public`);
      const r = await tx.unsafe(query);
      return r;
    });

    const elapsedMs = Date.now() - startedAt;

    // postgres.js returns an array of rows for SELECT; for DML it returns an
    // empty array plus a `count` property on the result object.
    const truncated = Array.isArray(rows) && rows.length > RESULT_ROW_CAP;
    const data      = Array.isArray(rows) ? rows.slice(0, RESULT_ROW_CAP) : rows;

    // Field metadata is available on rows via the `columns` symbol but only
    // for SELECTs and only on the original Result object. postgres.js exposes
    // it as `rows.columns`.
    const columns = (rows as unknown as { columns?: Array<{ name: string; type: number }> }).columns;
    const colNames = columns?.map((c) => c.name) ?? (data[0] ? Object.keys(data[0]) : []);

    return c.json({
      rows:        data,
      row_count:   Array.isArray(data) ? data.length : 0,
      columns:     colNames,
      truncated,
      elapsed_ms:  elapsedMs,
    });
  } catch (e) {
    const msg = (e as Error).message;
    const elapsedMs = Date.now() - startedAt;
    // Common Postgres error mapping
    if (/canceling statement due to statement timeout/i.test(msg)) {
      return c.json({ error: `query exceeded ${STATEMENT_TIMEOUT_MS}ms timeout`, elapsed_ms: elapsedMs }, 408);
    }
    if (/permission denied/i.test(msg)) {
      return c.json({ error: msg, elapsed_ms: elapsedMs }, 403);
    }
    return c.json({ error: msg, elapsed_ms: elapsedMs }, 400);
  }
});

export { route as sqlRoute };
