/**
 * Mneme Mandate — declarative agent intents.
 *
 * Users write a mandate (intent + conditions + guardrails). Mneme stores
 * it in the project schema's `mandates` table. The status lifecycle:
 *
 *   pending  → user just created it, conditions not yet armed
 *   armed    → conditions are being watched
 *   triggered→ conditions met, wallet adapter notified
 *   executed → on-chain tx confirmed
 *   failed   → execution errored
 *   cancelled→ user cancelled before execution
 *
 *   POST   /v1/mandates           create
 *   GET    /v1/mandates           list (filter by status / kind)
 *   GET    /v1/mandates/:id       fetch one
 *   POST   /v1/mandates/:id/arm   start watching the conditions
 *   POST   /v1/mandates/:id/cancel
 *   POST   /v1/mandates/:id/execute  manually mark as executed (test rigs)
 *   DELETE /v1/mandates/:id       delete (only if not executed)
 */
import { Hono } from "hono";
import { sql, ensureMandatesTable } from "../db";

const route = new Hono();

const VALID_KINDS    = ["swap", "send", "stake", "lp", "perp", "predict", "mint", "vote"] as const;
const VALID_PROVIDER = ["metamask", "coinbase_smart", "privy", "custom"] as const;
const VALID_STATUS   = ["pending", "armed", "triggered", "executed", "failed", "cancelled"] as const;

interface CreateBody {
  kind?:            string;
  title?:           string;
  intent?:          Record<string, unknown>;
  conditions?:      Record<string, unknown>;
  spend_cap_usdc?:  number;
  risk_profile?:    Record<string, unknown>;
  wallet_provider?: string;
  expires_at?:      string;     // ISO
}

route.post("/", async (c) => {
  const project = c.get("project");
  await ensureMandatesTable(project.schema_name);

  let body: CreateBody;
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const kind  = (body.kind  ?? "").trim();
  const title = (body.title ?? "").trim();
  if (!(VALID_KINDS as readonly string[]).includes(kind)) {
    return c.json({ error: `kind must be one of ${VALID_KINDS.join(", ")}` }, 400);
  }
  if (!title || title.length > 200) return c.json({ error: "title required, ≤ 200 chars" }, 400);
  if (!body.intent || typeof body.intent !== "object")
    return c.json({ error: "intent (object) is required — e.g. {from_token, to_token, amount}" }, 400);

  const provider = body.wallet_provider ?? "coinbase_smart";
  if (!(VALID_PROVIDER as readonly string[]).includes(provider))
    return c.json({ error: `wallet_provider must be one of ${VALID_PROVIDER.join(", ")}` }, 400);

  const cap = body.spend_cap_usdc != null ? Number(body.spend_cap_usdc) : null;
  if (cap != null && (!Number.isFinite(cap) || cap < 0))
    return c.json({ error: "spend_cap_usdc must be ≥ 0" }, 400);

  const rows = await sql.unsafe(
    `INSERT INTO "${project.schema_name}".mandates
       (kind, title, intent, conditions, spend_cap_usdc, risk_profile, wallet_provider, expires_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6::jsonb, $7, $8)
     RETURNING id, status, created_at`,
    [
      kind, title,
      JSON.stringify(body.intent),
      JSON.stringify(body.conditions ?? {}),
      cap,
      JSON.stringify(body.risk_profile ?? {}),
      provider,
      body.expires_at ?? null,
    ],
  ) as unknown as Array<{ id: number; status: string; created_at: Date }>;

  const r = rows[0]!;
  return c.json({
    ok:               true,
    id:               r.id,
    kind, title,
    wallet_provider:  provider,
    status:           r.status,
    created_at:       r.created_at,
    next:             "POST /v1/mandates/" + r.id + "/arm to start watching",
  });
});

route.get("/", async (c) => {
  const project = c.get("project");
  await ensureMandatesTable(project.schema_name);

  const status = c.req.query("status");
  const kind   = c.req.query("kind");
  const limit  = Math.min(Number(c.req.query("limit") ?? 50), 200);

  const where: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  if (status && (VALID_STATUS as readonly string[]).includes(status))
    { where.push(`status = $${p++}`);          params.push(status); }
  if (kind   && (VALID_KINDS  as readonly string[]).includes(kind))
    { where.push(`kind = $${p++}`);            params.push(kind); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await sql.unsafe(
    `SELECT id, kind, title, intent, conditions, spend_cap_usdc, risk_profile,
            wallet_provider, status, tx_hash, expires_at, created_at,
            armed_at, triggered_at, executed_at, last_error
     FROM "${project.schema_name}".mandates
     ${whereClause}
     ORDER BY created_at DESC LIMIT ${limit}`,
    params as never[],
  );
  return c.json({ count: rows.length, mandates: rows });
});

route.get("/:id", async (c) => {
  const project = c.get("project");
  await ensureMandatesTable(project.schema_name);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);
  const rows = await sql.unsafe(
    `SELECT * FROM "${project.schema_name}".mandates WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  return c.json(rows[0]);
});

// ─── Lifecycle transitions ──────────────────────────────────────────────
const transition = (from: string[], to: string, fieldStamp: string | null = null) =>
  async (c: Parameters<Parameters<typeof route.post>[1]>[0]) => {
    const project = c.get("project");
    await ensureMandatesTable(project.schema_name);
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);

    const stamp = fieldStamp ? `, ${fieldStamp} = now()` : "";
    const rows = await sql.unsafe(
      `UPDATE "${project.schema_name}".mandates
       SET status = $1${stamp}
       WHERE id = $2 AND status = ANY($3::text[])
       RETURNING id, status`,
      [to, id, from],
    ) as unknown as Array<{ id: number; status: string }>;
    if (rows.length === 0) {
      return c.json({
        error: `mandate not in valid state — expected one of: ${from.join(", ")}`,
      }, 409);
    }
    return c.json({ ok: true, id, status: rows[0]!.status });
  };

route.post("/:id/arm",       transition(["pending"],              "armed",     "armed_at"));
route.post("/:id/cancel",    transition(["pending", "armed", "triggered"], "cancelled"));

// /execute is for test rigs OR for adapters that have already executed on-chain.
// Body: { tx_hash?: string, gas_used?: number }
route.post("/:id/execute", async (c) => {
  const project = c.get("project");
  await ensureMandatesTable(project.schema_name);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);

  let body: { tx_hash?: string; gas_used?: number } = {};
  try { body = JSON.parse(c.get("bodyText") || "{}"); } catch { /* ok */ }
  const tx  = body.tx_hash  ?? null;
  const gas = body.gas_used != null ? Number(body.gas_used) : null;

  const rows = await sql.unsafe(
    `UPDATE "${project.schema_name}".mandates
     SET status = 'executed', tx_hash = $1, gas_used = $2, executed_at = now()
     WHERE id = $3 AND status IN ('armed','triggered')
     RETURNING id, status, tx_hash, executed_at`,
    [tx, gas, id],
  ) as unknown as Array<{ id: number; status: string; tx_hash: string | null; executed_at: Date }>;
  if (rows.length === 0)
    return c.json({ error: "mandate not in armed/triggered state" }, 409);
  return c.json({ ok: true, ...rows[0] });
});

route.delete("/:id", async (c) => {
  const project = c.get("project");
  await ensureMandatesTable(project.schema_name);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);
  const rows = await sql.unsafe(
    `DELETE FROM "${project.schema_name}".mandates
     WHERE id = $1 AND status <> 'executed' RETURNING id`,
    [id],
  ) as unknown as Array<{ id: number }>;
  if (rows.length === 0)
    return c.json({ error: "not found or already executed (cannot delete)" }, 404);
  return c.json({ ok: true, id });
});

export { route as mandatesRoute };
