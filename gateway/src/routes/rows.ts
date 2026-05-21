import { Hono } from "hono";
import { sql, isValidTableName, defaultOrderColumn, DEFAULT_TABLES } from "../db";
import type { StatusCode } from "hono/utils/http-status";

const route = new Hono();

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

route.post("/:table", async (c) => {
  const table = c.req.param("table");
  if (!isValidTableName(table)) return c.json({ error: "invalid table name" }, 400);

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

route.get("/:table", async (c) => {
  const table = c.req.param("table");
  if (!isValidTableName(table)) return c.json({ error: "invalid table name" }, 400);

  const schema = c.get("project").schema_name;
  const limit  = Math.min(Math.max(Number(c.req.query("limit")  ?? 100), 1), 1000);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  // ORDER BY: known default tables get a sensible column; for custom tables
  // we sort by id DESC (always present unless the user gave their own PK).
  const orderCol = (DEFAULT_TABLES as readonly string[]).includes(table)
    ? defaultOrderColumn(table)
    : "id";

  try {
    const rows = await sql`
      SELECT * FROM ${sql(schema)}.${sql(table)}
      ORDER BY ${sql(orderCol)} DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return c.json({ rows });
  } catch (e) {
    const msg = (e as Error).message;
    if (/relation .* does not exist|undefined_table/i.test(msg)) {
      return c.json(tableNotFound(table), 404);
    }
    if (/column .* does not exist/i.test(msg)) {
      // user table has no `id` column and isn't a default — they need to pass ?order=col
      const customOrder = c.req.query("order");
      if (customOrder && /^[a-z_][a-z0-9_]*$/.test(customOrder)) {
        const rows = await sql`
          SELECT * FROM ${sql(schema)}.${sql(table)}
          ORDER BY ${sql(customOrder)} DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
        return c.json({ rows });
      }
      return c.json({ error: "table has no 'id' column — pass ?order=<column>" }, 400);
    }
    return c.json({ error: msg }, 500 as StatusCode);
  }
});

export { route as rowsRoute };
