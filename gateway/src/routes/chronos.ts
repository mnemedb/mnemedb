/**
 * Mneme Chronos — time-travel + provable memory.
 *
 *   GET  /v1/chronos/rewind?table=memories&at=<ISO>   table state AS OF a timestamp
 *   GET  /v1/chronos/diff?table=&from=&to=            what changed in a window
 *   GET  /v1/chronos/journal?table=&limit=            raw journal entries (newest first)
 *   POST /v1/chronos/anchor                           Merkle-anchor everything unanchored
 *   GET  /v1/chronos/anchors                          list anchors (+ tx hashes if onchain)
 *   GET  /v1/chronos/proof/:journal_id                Merkle proof for one journal entry
 */
import { Hono } from "hono";
import { sql, ensureChronos, CHRONOS_TABLES } from "../db";
import { createAnchor, getProof } from "../chronos";

const route = new Hono();

const isChronosTable = (t: string): boolean =>
  (CHRONOS_TABLES as readonly string[]).includes(t);

function parseAt(raw: string | undefined): Date | null {
  if (!raw) return new Date();
  // Relative shorthand: 24h, 7d, 30m
  const m = raw.match(/^(\d+)([mhd])$/);
  if (m) {
    const n = Number(m[1]);
    const mult = m[2] === "m" ? 60_000 : m[2] === "h" ? 3_600_000 : 86_400_000;
    return new Date(Date.now() - n * mult);
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t) : null;
}

// ─── GET /rewind ─────────────────────────────────────────────────────────
route.get("/rewind", async (c) => {
  const project = c.get("project");
  await ensureChronos(project.schema_name);

  const table = c.req.query("table") ?? "memories";
  if (!isChronosTable(table)) {
    return c.json({ error: `table must be one of ${CHRONOS_TABLES.join(", ")}` }, 400);
  }
  const at = parseAt(c.req.query("at"));
  if (!at) return c.json({ error: "invalid 'at' — use ISO timestamp or shorthand like 24h / 7d" }, 400);
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);

  // State reconstruction: latest journal entry per row_id at or before `at`,
  // excluding rows whose latest op is DELETE.
  const rows = await sql.unsafe(
    `SELECT row_id, op, row_data, at
     FROM (
       SELECT DISTINCT ON (row_id) row_id, op, row_data, at
       FROM "${project.schema_name}"._journal
       WHERE tbl = $1 AND at <= $2
       ORDER BY row_id, at DESC, id DESC
     ) latest
     WHERE op <> 'DELETE'
     ORDER BY (row_data->>'created_at') DESC NULLS LAST
     LIMIT ${limit}`,
    [table, at.toISOString()],
  ) as unknown as Array<{ row_id: string; op: string; row_data: Record<string, unknown>; at: Date }>;

  return c.json({
    table,
    as_of: at.toISOString(),
    row_count: rows.length,
    rows: rows.map((r) => ({ ...r.row_data, _journal_op: r.op, _journal_at: r.at })),
  });
});

// ─── GET /diff ───────────────────────────────────────────────────────────
route.get("/diff", async (c) => {
  const project = c.get("project");
  await ensureChronos(project.schema_name);

  const table = c.req.query("table") ?? "memories";
  if (!isChronosTable(table)) {
    return c.json({ error: `table must be one of ${CHRONOS_TABLES.join(", ")}` }, 400);
  }
  const from = parseAt(c.req.query("from") ?? "7d");
  const to   = parseAt(c.req.query("to"));
  if (!from || !to) return c.json({ error: "invalid from/to" }, 400);

  const rows = await sql.unsafe(
    `SELECT op, COUNT(*)::int AS n
     FROM "${project.schema_name}"._journal
     WHERE tbl = $1 AND at > $2 AND at <= $3 AND op <> 'SEED'
     GROUP BY op`,
    [table, from.toISOString(), to.toISOString()],
  ) as unknown as Array<{ op: string; n: number }>;

  const recent = await sql.unsafe(
    `SELECT id::text, op, row_id, row_data, at
     FROM "${project.schema_name}"._journal
     WHERE tbl = $1 AND at > $2 AND at <= $3 AND op <> 'SEED'
     ORDER BY id DESC LIMIT 25`,
    [table, from.toISOString(), to.toISOString()],
  ) as unknown as Array<{ id: string; op: string; row_id: string; row_data: Record<string, unknown>; at: Date }>;

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.op] = r.n;

  return c.json({
    table,
    from: from.toISOString(),
    to:   to.toISOString(),
    inserted: counts.INSERT ?? 0,
    updated:  counts.UPDATE ?? 0,
    deleted:  counts.DELETE ?? 0,
    recent,
  });
});

// ─── GET /journal ────────────────────────────────────────────────────────
route.get("/journal", async (c) => {
  const project = c.get("project");
  await ensureChronos(project.schema_name);

  const table = c.req.query("table");
  if (table && !isChronosTable(table)) {
    return c.json({ error: `table must be one of ${CHRONOS_TABLES.join(", ")}` }, 400);
  }
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 500);

  const rows = table
    ? await sql.unsafe(
        `SELECT id::text, tbl, op, row_id, at FROM "${project.schema_name}"._journal
         WHERE tbl = $1 ORDER BY id DESC LIMIT ${limit}`,
        [table],
      )
    : await sql.unsafe(
        `SELECT id::text, tbl, op, row_id, at FROM "${project.schema_name}"._journal
         ORDER BY id DESC LIMIT ${limit}`,
      );
  return c.json({ count: (rows as unknown[]).length, entries: rows });
});

// ─── POST /anchor ────────────────────────────────────────────────────────
route.post("/anchor", async (c) => {
  const project = c.get("project");
  await ensureChronos(project.schema_name);

  const anchor = await createAnchor(project.schema_name);
  if (!anchor) return c.json({ ok: false, reason: "nothing new to anchor" });
  return c.json({
    ok: true,
    anchor: {
      id:          anchor.id,
      range:       [anchor.from_id, anchor.to_id],
      leaf_count:  anchor.leaf_count,
      merkle_root: anchor.merkle_root,
      tx_hash:     anchor.tx_hash,
      onchain:     anchor.tx_hash != null,
      anchored_at: anchor.anchored_at,
    },
  });
});

// ─── GET /anchors ────────────────────────────────────────────────────────
route.get("/anchors", async (c) => {
  const project = c.get("project");
  const rows = await sql`
    SELECT id, from_id::text, to_id::text, leaf_count, merkle_root, tx_hash, anchored_at
    FROM _mneme_chronos_anchors
    WHERE schema_name = ${project.schema_name}
    ORDER BY id DESC LIMIT 50
  `;
  return c.json({ count: rows.length, anchors: rows });
});

// ─── GET /proof/:journal_id ──────────────────────────────────────────────
route.get("/proof/:journal_id", async (c) => {
  const project = c.get("project");
  await ensureChronos(project.schema_name);

  const idRaw = c.req.param("journal_id");
  if (!/^\d+$/.test(idRaw)) return c.json({ error: "invalid journal_id" }, 400);

  const proof = await getProof(project.schema_name, BigInt(idRaw));
  if ("error" in proof) return c.json(proof, 404);
  return c.json(proof);
});

export { route as chronosRoute };
