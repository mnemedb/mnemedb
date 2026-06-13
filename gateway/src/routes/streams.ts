/**
 * Mneme Live — chain stream subscriptions.
 *
 * POST   /v1/streams          create a subscription
 * GET    /v1/streams          list subscriptions
 * DELETE /v1/streams/:id      revoke a subscription (sets active=false)
 *
 * On create, we auto-create the target table in the user's schema if it
 * doesn't exist, with a standard chain-event row shape.
 */
import { Hono } from "hono";
import { sql, isValidTableName, attachBeamTriggers } from "../db";
import { parseEventSignature, type AbiInput } from "../chain";

const route = new Hono();

interface CreateBody {
  contract?:     string;          // 0x... (20-byte address)
  event?:        string;          // template alias OR raw signature
  target_table?: string;          // table in your schema
  label?:        string | null;
}

route.post("/", async (c) => {
  const project = c.get("project");

  let body: CreateBody;
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const contract = (body.contract ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(contract)) {
    return c.json({ error: "invalid contract address (must be 0x + 40 hex)" }, 400);
  }

  const eventStr = (body.event ?? "").trim();
  if (!eventStr) return c.json({ error: "missing 'event' (template name or signature)" }, 400);

  let parsed: ReturnType<typeof parseEventSignature>;
  try { parsed = parseEventSignature(eventStr); }
  catch (e) { return c.json({ error: (e as Error).message }, 400); }

  const target = (body.target_table ?? "").trim();
  if (!isValidTableName(target)) {
    return c.json({ error: "invalid target_table (must be lowercase snake_case ≤ 63 chars)" }, 400);
  }
  if (target.startsWith("_mneme_")) {
    return c.json({ error: "target_table cannot start with '_mneme_'" }, 400);
  }

  // Auto-create the target table in the user's schema if it doesn't exist.
  // Standard shape: enough for any decoded event, joinable on tx_hash.
  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${project.schema_name}"."${target}" (
        id            bigserial PRIMARY KEY,
        tx_hash       text NOT NULL,
        block_number  bigint NOT NULL,
        log_index     int NOT NULL,
        contract      text NOT NULL,
        event_name    text NOT NULL,
        args          jsonb NOT NULL,
        block_ts      timestamptz NOT NULL,
        inserted_at   timestamptz DEFAULT now(),
        UNIQUE (tx_hash, log_index)
      );
      CREATE INDEX IF NOT EXISTS "${target}_block_ts_idx"   ON "${project.schema_name}"."${target}" (block_ts DESC);
      CREATE INDEX IF NOT EXISTS "${target}_event_name_idx" ON "${project.schema_name}"."${target}" (event_name);
      CREATE INDEX IF NOT EXISTS "${target}_args_gin_idx"   ON "${project.schema_name}"."${target}" USING gin (args);
    `);
    // Pipe this stream's inserts into Mneme Beam too.
    await attachBeamTriggers(sql, project.schema_name, [target]);
  } catch (e) {
    return c.json({
      error: `could not create target table: ${(e as Error).message}`,
    }, 500);
  }

  // Insert subscription
  try {
    const abiInputsJson = JSON.stringify(parsed.inputs);
    const rows = await sql<Array<{
      id: number; contract: string; event_name: string; target_table: string;
      created_at: Date;
    }>>`
      INSERT INTO _mneme_streams (
        project_id, contract, topic0, event_signature, event_name,
        abi_inputs, target_table, label
      )
      VALUES (
        ${project.id}, ${contract}, ${parsed.topic0}, ${parsed.signature}, ${parsed.name},
        ${abiInputsJson}::jsonb, ${target}, ${body.label ?? null}
      )
      RETURNING id, contract, event_name, target_table, created_at
    `;
    const r = rows[0]!;
    return c.json({
      ok:              true,
      id:              r.id,
      contract:        r.contract,
      event_signature: parsed.signature,
      event_name:      r.event_name,
      topic0:          parsed.topic0,
      target_table:    r.target_table,
      created_at:      r.created_at,
      note: "subscription active — matching events will appear in your table within ~30s",
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return c.json({ error: "you already have a stream for this (contract, event, table) combo" }, 409);
    }
    return c.json({ error: `failed to create stream: ${msg}` }, 500);
  }
});

route.get("/", async (c) => {
  const project = c.get("project");
  const rows = await sql<Array<{
    id: number; contract: string; event_signature: string; event_name: string;
    target_table: string; active: boolean; label: string | null;
    last_block: string; created_at: Date;
  }>>`
    SELECT id, contract, event_signature, event_name, target_table,
           active, label, last_block::text, created_at
    FROM _mneme_streams
    WHERE project_id = ${project.id}
    ORDER BY active DESC, created_at DESC
  `;
  return c.json({
    streams: rows.map((r) => ({
      ...r,
      last_block: Number(r.last_block),
    })),
  });
});

route.delete("/:id", async (c) => {
  const project = c.get("project");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const rows = await sql<Array<{ id: number }>>`
    UPDATE _mneme_streams
    SET active = false
    WHERE id = ${id} AND project_id = ${project.id} AND active = true
    RETURNING id
  `;
  if (rows.length === 0) {
    return c.json({ error: "stream not found or already inactive" }, 404);
  }
  return c.json({ ok: true, id, note: "stream paused — target table is kept" });
});

export { route as streamsRoute };
