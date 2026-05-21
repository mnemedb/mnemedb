import { Hono } from "hono";
import { z } from "zod";
import {
  createUserTable,
  introspectTables,
  VALID_COLUMN_TYPES,
  type ColumnDef,
} from "../db";
import type { StatusCode } from "hono/utils/http-status";

const route = new Hono();

const IDENT = /^[a-z_][a-z0-9_]*$/;

const ColumnSchema = z.object({
  name:       z.string().regex(IDENT).max(63),
  type:       z.enum(VALID_COLUMN_TYPES),
  dim:        z.number().int().positive().max(4096).optional(),
  nullable:   z.boolean().optional(),
  unique:     z.boolean().optional(),
  primaryKey: z.boolean().optional(),
});

const CreateTableBody = z.object({
  name:    z.string().regex(IDENT).max(63),
  columns: z.array(ColumnSchema).min(1).max(64),
});

// GET /v1/tables — introspect all tables in the agent's schema.
route.get("/", async (c) => {
  const schema = c.get("project").schema_name;
  const tables = await introspectTables(schema);
  return c.json({ tables });
});

// POST /v1/tables — create a new table in the agent's schema.
// Defaults: an `id bigserial PRIMARY KEY` is added unless the user marks a
// column primaryKey, and `created_at timestamptz DEFAULT now()` is appended
// unless the user already defined it.
route.post("/", async (c) => {
  let body: unknown;
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const parsed = CreateTableBody.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.format() }, 400);

  const schema = c.get("project").schema_name;
  const { name, columns } = parsed.data;

  try {
    await createUserTable(schema, name, columns as ColumnDef[]);
    return c.json({ ok: true, table: name });
  } catch (e) {
    const msg = (e as Error).message;
    const conflict = /already exists|duplicate/i.test(msg);
    return c.json({ error: msg }, (conflict ? 409 : 400) as StatusCode);
  }
});

export { route as tablesRoute };
