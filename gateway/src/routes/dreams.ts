/**
 * Mneme Dreams — async LLM reflection on a project's data.
 *
 * The dream worker reads the project's recent memories / entities /
 * relations / stream tables, asks claude-sonnet-4.5 to surface
 * patterns / open questions / data gaps / a narrative synthesis,
 * and INSERTs each finding into the "dreams" default table.
 *
 *   POST   /v1/dreams/generate    sync trigger — read context, call LLM, insert N rows
 *   GET    /v1/dreams             list recent dreams (newest first)
 *   GET    /v1/dreams/:id         one dream
 *   DELETE /v1/dreams/:id         drop a dream
 */
import { Hono } from "hono";
import { sql, ensureDreamsTable } from "../db";
import { buildDreamContext, callDreamLlm } from "./dreams.runner";

const route = new Hono();

const FAL_API_KEY = process.env.FAL_API_KEY;
const FAL_MODEL   = process.env.FAL_MODEL ?? "anthropic/claude-sonnet-4.5";

// ─── POST /generate ─────────────────────────────────────────────────────
route.post("/generate", async (c) => {
  if (!FAL_API_KEY) return c.json({ error: "dream LLM not configured on this gateway" }, 503);

  const project = c.get("project");
  await ensureDreamsTable(project.schema_name);

  let body: { hint?: string; max_dreams?: number } = {};
  try { body = JSON.parse(c.get("bodyText") || "{}"); } catch { /* ok */ }
  const maxDreams = Math.min(Math.max(body.max_dreams ?? 3, 1), 5);

  const ctx = await buildDreamContext(project.schema_name);
  if (ctx.totalRecords === 0) {
    return c.json({
      ok:      false,
      reason:  "no data yet — add some memories / entities / streams first",
      dreams:  [],
    });
  }

  const t0 = Date.now();
  let dreams: Awaited<ReturnType<typeof callDreamLlm>>;
  try {
    dreams = await callDreamLlm(ctx.text, body.hint, maxDreams);
  } catch (e) {
    return c.json({ error: `dream LLM failed: ${(e as Error).message}` }, 502);
  }

  // Persist
  const inserted: Array<{ id: number; kind: string; title: string; body: string; created_at: Date }> = [];
  for (const d of dreams) {
    const rows = await sql<Array<{ id: number; kind: string; title: string; body: string; created_at: Date }>>`
      INSERT INTO ${sql(project.schema_name)}.dreams (kind, title, body, sources, model)
      VALUES (${d.kind}, ${d.title}, ${d.body}, ${JSON.stringify(d.sources ?? [])}::jsonb, ${FAL_MODEL})
      RETURNING id, kind, title, body, created_at
    `;
    inserted.push(rows[0]!);
  }

  return c.json({
    ok:         true,
    count:      inserted.length,
    elapsed_ms: Date.now() - t0,
    context_chars: ctx.text.length,
    records_considered: ctx.totalRecords,
    dreams:     inserted,
  });
});

// ─── GET / ──────────────────────────────────────────────────────────────
route.get("/", async (c) => {
  const project = c.get("project");
  await ensureDreamsTable(project.schema_name);
  const limit = Math.min(Number(c.req.query("limit") ?? 30), 200);
  const kind  = c.req.query("kind");
  const rows  = kind
    ? await sql`
        SELECT id, kind, title, body, sources, model, created_at
        FROM ${sql(project.schema_name)}.dreams
        WHERE kind = ${kind}
        ORDER BY created_at DESC LIMIT ${limit}`
    : await sql`
        SELECT id, kind, title, body, sources, model, created_at
        FROM ${sql(project.schema_name)}.dreams
        ORDER BY created_at DESC LIMIT ${limit}`;
  return c.json({ count: rows.length, dreams: rows });
});

route.get("/:id", async (c) => {
  const project = c.get("project");
  await ensureDreamsTable(project.schema_name);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);
  const rows = await sql`
    SELECT id, kind, title, body, sources, model, created_at
    FROM ${sql(project.schema_name)}.dreams WHERE id = ${id} LIMIT 1`;
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  return c.json(rows[0]);
});

route.delete("/:id", async (c) => {
  const project = c.get("project");
  await ensureDreamsTable(project.schema_name);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);
  const rows = await sql`
    DELETE FROM ${sql(project.schema_name)}.dreams WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true, id });
});

export { route as dreamsRoute };
