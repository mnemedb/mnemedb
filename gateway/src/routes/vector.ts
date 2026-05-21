import { Hono } from "hono";
import { z } from "zod";
import { sql, isValidTableName, isValidColumnName } from "../db";
import type { StatusCode } from "hono/utils/http-status";

const IDENT = /^[a-z_][a-z0-9_]*$/;

const SearchBody = z.object({
  table:     z.string().regex(IDENT).max(63),
  column:    z.string().regex(IDENT).max(63),
  embedding: z.array(z.number()).min(1).max(4096),
  k:         z.number().int().positive().max(100).optional().default(10),
});

const route = new Hono();

// POST /v1/vector/search — KNN over any vector column on any table the
// caller owns. No per-table RPCs; we build the query inline at request time.
route.post("/search", async (c) => {
  let parsedJson: unknown;
  try { parsedJson = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const parsed = SearchBody.safeParse(parsedJson);
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);

  const { table, column, embedding, k } = parsed.data;
  if (!isValidTableName(table))  return c.json({ error: "invalid table name" }, 400);
  if (!isValidColumnName(column)) return c.json({ error: "invalid column name" }, 400);

  const schema = c.get("project").schema_name;
  const vecLit = `[${embedding.join(",")}]`;

  // schema/table/column are regex-validated; k is a typed number; embedding via $1.
  try {
    const matches = await sql.unsafe(
      `SELECT *, ("${column}" <-> $1::vector) AS distance
       FROM "${schema}"."${table}"
       ORDER BY "${column}" <-> $1::vector
       LIMIT $2`,
      [vecLit, k],
    );
    return c.json({ matches });
  } catch (e) {
    const msg = (e as Error).message;
    if (/relation .* does not exist|undefined_table/i.test(msg)) {
      return c.json({ error: `table "${table}" not found` }, 404);
    }
    if (/column .* does not exist/i.test(msg)) {
      return c.json({ error: `column "${column}" not found on "${table}"` }, 404);
    }
    if (/different vector dimensions|type vector/i.test(msg)) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 500 as StatusCode);
  }
});

export { route as vectorRoute };
