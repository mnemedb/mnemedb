import { Hono } from "hono";
import { sql, isValidTableName, defaultOrderColumn, DEFAULT_TABLES } from "../db";
import { enforceApiKeyScope } from "../auth";
import type { StatusCode } from "hono/utils/http-status";

const route = new Hono();

function checkScope(c: { get: (k: "apiKeyScope") => string | undefined }, table: string) {
  return enforceApiKeyScope(c.get("apiKeyScope"), table);
}

/**
 * pgvector wants its literal as `'[a,b,c]'`, not as a JS array (postgres.js
 * would serialize JS arrays as Postgres ARRAY `{a,b,c}` which vector_in rejects).
 * Convert any field whose value is a number array into pgvector literal form.
 */
function coerceVectorFields<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (Array.isArray(v) && v.every((x) => typeof x === "number")) {
      out[k] = `[${(v as number[]).join(",")}]`;
    }
  }
  return out as T;
}

function tableNotFound(table: string) {
  return { error: `table "${table}" not found in your project (create it with POST /v1/tables)` };
}

// ─── WHERE filter parser (PostgREST-ish) ─────────────────────────────────
// Accepts repeated ?where= clauses, each in form `column.op.value`.
// Supported ops: eq, neq, gt, gte, lt, lte, like, ilike, in, is.
// Identifiers are validated; values are bound via postgres.js parameters.
const COL_RX = /^[a-z_][a-z0-9_]*$/i;
const OP_MAP: Record<string, string> = {
  eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=",
  like: "LIKE", ilike: "ILIKE", is: "IS",
};

interface ParsedFilter { col: string; op: string; raw: string; values: unknown[]; isInList: boolean; }

function parseWhereClauses(rawClauses: string[]): ParsedFilter[] | { error: string } {
  const out: ParsedFilter[] = [];
  for (const clause of rawClauses) {
    const firstDot = clause.indexOf(".");
    if (firstDot < 0) return { error: `invalid where clause "${clause}" — expected col.op.value` };
    const col = clause.slice(0, firstDot);
    const rest = clause.slice(firstDot + 1);
    const secondDot = rest.indexOf(".");
    if (secondDot < 0) return { error: `invalid where clause "${clause}" — expected col.op.value` };
    const op  = rest.slice(0, secondDot);
    const val = rest.slice(secondDot + 1);
    if (!COL_RX.test(col)) return { error: `invalid column "${col}"` };
    if (op === "in") {
      const items = val.split(",").map((s) => s.trim()).filter(Boolean);
      if (items.length === 0) return { error: `empty 'in' list for "${col}"` };
      out.push({ col, op: "IN", raw: clause, values: items, isInList: true });
      continue;
    }
    if (!(op in OP_MAP)) return { error: `unsupported op "${op}" (use eq/neq/gt/gte/lt/lte/like/ilike/in/is)` };
    // is null support: ?where=col.is.null
    if (op === "is") {
      if (val !== "null" && val !== "notnull") return { error: `is op only supports null/notnull` };
      out.push({ col, op: val === "null" ? "IS NULL" : "IS NOT NULL", raw: clause, values: [], isInList: false });
      continue;
    }
    out.push({ col, op: OP_MAP[op]!, raw: clause, values: [val], isInList: false });
  }
  return out;
}

// ─── POST /:table — insert one row or an array of rows ──────────────────
route.post("/:table", async (c) => {
  const table = c.req.param("table");
  if (!isValidTableName(table)) return c.json({ error: "invalid table name" }, 400);
  const scopeErr = checkScope(c, table);
  if (scopeErr) return c.json(scopeErr, 403);

  const schema = c.get("project").schema_name;

  let body: unknown;
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const rows = Array.isArray(body) ? body : [body];
  if (rows.length === 0) return c.json({ inserted: 0, rows: [] });

  for (const r of rows) {
    if (!r || typeof r !== "object") {
      return c.json({ error: "rows must be objects" }, 400);
    }
  }

  const prepared = (rows as Record<string, unknown>[]).map((r) => coerceVectorFields(r));

  try {
    const inserted = await sql`
      INSERT INTO ${sql(schema)}.${sql(table)} ${sql(prepared)}
      RETURNING *
    `;
    return c.json({ inserted: inserted.length, rows: inserted });
  } catch (e) {
    const msg = (e as Error).message;
    if (/relation .* does not exist|undefined_table/i.test(msg)) {
      return c.json(tableNotFound(table), 404);
    }
    return c.json({ error: msg }, 400);
  }
});

// ─── GET /:table — list rows, optionally filtered with WHERE clauses ────
// Supports ?where=col.op.value (repeated), ?order=col (.desc or .asc), ?limit, ?offset
route.get("/:table", async (c) => {
  const table = c.req.param("table");
  if (!isValidTableName(table)) return c.json({ error: "invalid table name" }, 400);
  const scopeErr = checkScope(c, table);
  if (scopeErr) return c.json(scopeErr, 403);

  const schema = c.get("project").schema_name;
  const limit  = Math.min(Math.max(Number(c.req.query("limit")  ?? 100), 1), 1000);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  // Order: ?order=col or ?order=col.desc / col.asc
  let orderCol: string;
  let orderDir: "ASC" | "DESC" = "DESC";
  const rawOrder = c.req.query("order");
  if (rawOrder) {
    const [col, dir] = rawOrder.split(".");
    if (!col || !COL_RX.test(col)) return c.json({ error: "invalid 'order' column" }, 400);
    orderCol = col;
    if (dir === "asc") orderDir = "ASC";
    else if (dir === "desc") orderDir = "DESC";
    else if (dir !== undefined) return c.json({ error: "order direction must be 'asc' or 'desc'" }, 400);
  } else if ((DEFAULT_TABLES as readonly string[]).includes(table)) {
    orderCol = defaultOrderColumn(table);
  } else {
    orderCol = "id";
  }

  // WHERE clauses (repeated ?where=)
  const whereClauses = c.req.queries("where") ?? [];
  const parsed = whereClauses.length ? parseWhereClauses(whereClauses) : [];
  if (!Array.isArray(parsed)) return c.json(parsed, 400);

  try {
    // Build WHERE fragment manually using sql tag fragments
    let q = sql`SELECT * FROM ${sql(schema)}.${sql(table)}`;
    if (parsed.length > 0) {
      q = sql`${q} WHERE ${
        parsed.reduce((acc, f, i) => {
          let frag;
          if (f.op === "IS NULL")     frag = sql`${sql(f.col)} IS NULL`;
          else if (f.op === "IS NOT NULL") frag = sql`${sql(f.col)} IS NOT NULL`;
          else if (f.isInList)        frag = sql`${sql(f.col)} IN ${sql(f.values)}`;
          else                        frag = sql`${sql(f.col)} ${sql.unsafe(f.op)} ${f.values[0]}`;
          return i === 0 ? frag : sql`${acc} AND ${frag}`;
        }, sql``)
      }`;
    }
    const rows = await sql`
      ${q}
      ORDER BY ${sql(orderCol)} ${sql.unsafe(orderDir)}
      LIMIT ${limit} OFFSET ${offset}
    `;
    return c.json({ rows, count: rows.length });
  } catch (e) {
    const msg = (e as Error).message;
    if (/relation .* does not exist|undefined_table/i.test(msg)) {
      return c.json(tableNotFound(table), 404);
    }
    if (/column .* does not exist/i.test(msg)) {
      return c.json({ error: msg + " — check ?where= and ?order= column names" }, 400);
    }
    return c.json({ error: msg }, 500 as StatusCode);
  }
});

// ─── PATCH /:table/:id — update a single row by id ──────────────────────
route.patch("/:table/:id", async (c) => {
  const table = c.req.param("table");
  const id    = c.req.param("id");
  if (!isValidTableName(table)) return c.json({ error: "invalid table name" }, 400);
  if (!/^[a-zA-Z0-9_\-]+$/.test(id)) return c.json({ error: "invalid id" }, 400);
  const scopeErr = checkScope(c, table);
  if (scopeErr) return c.json(scopeErr, 403);

  const schema = c.get("project").schema_name;

  let body: unknown;
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return c.json({ error: "body must be a single object of column → value updates" }, 400);
  }
  const updates = coerceVectorFields(body as Record<string, unknown>);
  const keys = Object.keys(updates);
  if (keys.length === 0) return c.json({ error: "no fields to update" }, 400);
  for (const k of keys) {
    if (!COL_RX.test(k)) return c.json({ error: `invalid column "${k}"` }, 400);
  }

  try {
    const rows = await sql`
      UPDATE ${sql(schema)}.${sql(table)}
      SET ${sql(updates, ...keys)}
      WHERE id = ${id}
      RETURNING *
    `;
    if (rows.length === 0) return c.json({ error: "row not found" }, 404);
    return c.json({ updated: 1, row: rows[0] });
  } catch (e) {
    const msg = (e as Error).message;
    if (/relation .* does not exist|undefined_table/i.test(msg)) {
      return c.json(tableNotFound(table), 404);
    }
    return c.json({ error: msg }, 400);
  }
});

// ─── DELETE /:table/:id — delete a single row by id ─────────────────────
route.delete("/:table/:id", async (c) => {
  const table = c.req.param("table");
  const id    = c.req.param("id");
  if (!isValidTableName(table)) return c.json({ error: "invalid table name" }, 400);
  if (!/^[a-zA-Z0-9_\-]+$/.test(id)) return c.json({ error: "invalid id" }, 400);
  const scopeErr = checkScope(c, table);
  if (scopeErr) return c.json(scopeErr, 403);

  const schema = c.get("project").schema_name;

  try {
    const rows = await sql`
      DELETE FROM ${sql(schema)}.${sql(table)}
      WHERE id = ${id}
      RETURNING id
    `;
    if (rows.length === 0) return c.json({ error: "row not found" }, 404);
    return c.json({ deleted: 1, id: rows[0]!.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (/relation .* does not exist|undefined_table/i.test(msg)) {
      return c.json(tableNotFound(table), 404);
    }
    return c.json({ error: msg }, 400);
  }
});

// ─── DELETE /:table?where=... — bulk delete by filter (must have filter)
route.delete("/:table", async (c) => {
  const table = c.req.param("table");
  if (!isValidTableName(table)) return c.json({ error: "invalid table name" }, 400);
  const scopeErr = checkScope(c, table);
  if (scopeErr) return c.json(scopeErr, 403);
  const schema = c.get("project").schema_name;

  const whereClauses = c.req.queries("where") ?? [];
  if (whereClauses.length === 0) {
    return c.json({ error: "bulk delete requires at least one ?where= clause (refusing to delete entire table)" }, 400);
  }
  const parsed = parseWhereClauses(whereClauses);
  if (!Array.isArray(parsed)) return c.json(parsed, 400);

  try {
    let q = sql`DELETE FROM ${sql(schema)}.${sql(table)} WHERE ${
      parsed.reduce((acc, f, i) => {
        let frag;
        if (f.op === "IS NULL")          frag = sql`${sql(f.col)} IS NULL`;
        else if (f.op === "IS NOT NULL") frag = sql`${sql(f.col)} IS NOT NULL`;
        else if (f.isInList)             frag = sql`${sql(f.col)} IN ${sql(f.values)}`;
        else                             frag = sql`${sql(f.col)} ${sql.unsafe(f.op)} ${f.values[0]}`;
        return i === 0 ? frag : sql`${acc} AND ${frag}`;
      }, sql``)
    } RETURNING id`;
    const rows = await q;
    return c.json({ deleted: rows.length });
  } catch (e) {
    const msg = (e as Error).message;
    if (/relation .* does not exist|undefined_table/i.test(msg)) {
      return c.json(tableNotFound(table), 404);
    }
    return c.json({ error: msg }, 400);
  }
});

export { route as rowsRoute };
