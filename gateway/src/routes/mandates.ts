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
import { mandateToErc7715, type Address } from "../erc7715";

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

// ─── ERC-7710 / ERC-7715 ─────────────────────────────────────────────────
/**
 * GET /v1/mandates/:id/erc7715
 *
 * Returns a ready-to-send wallet_requestExecutionPermissions JSON-RPC
 * `params` array compiled from the mandate's risk_profile + spend cap +
 * expiry. Pass `?agent=0x…` to set the redeemer; defaults to the project
 * owner wallet.
 *
 * Per ERC-7715 spec — https://eips.ethereum.org/EIPS/eip-7715
 *
 * Response also includes the spec-shaped JSON-RPC envelope so a frontend
 * can pass it straight to `provider.request(...)`.
 */
route.get("/:id/erc7715", async (c) => {
  const project = c.get("project");
  await ensureMandatesTable(project.schema_name);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);

  const rows = await sql.unsafe(
    `SELECT kind, intent, spend_cap_usdc, risk_profile, expires_at
     FROM "${project.schema_name}".mandates WHERE id = $1 LIMIT 1`,
    [id],
  ) as unknown as Array<{
    kind: string; intent: Record<string, unknown>;
    spend_cap_usdc: string | null; risk_profile: Record<string, unknown>;
    expires_at: Date | null;
  }>;
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  const mandate = rows[0]!;

  const agentParam = c.req.query("agent");
  const agent = (agentParam && /^0x[0-9a-fA-F]{40}$/.test(agentParam))
    ? (agentParam.toLowerCase() as Address)
    : (project.owner_wallet.toLowerCase() as Address);
  const chainId = Number(c.req.query("chain_id") ?? 8453);

  const request = mandateToErc7715(mandate, agent, { chainId });

  // Persist the compiled request on the mandate so wallets / workers can re-fetch
  await sql.unsafe(
    `UPDATE "${project.schema_name}".mandates
     SET erc7715_permissions = $1::jsonb
     WHERE id = $2`,
    [JSON.stringify(request), id],
  );

  return c.json({
    mandate_id: id,
    chain_id:   chainId,
    agent,
    spec:       "ERC-7715",
    spec_url:   "https://eips.ethereum.org/EIPS/eip-7715",
    method:     "wallet_requestExecutionPermissions",
    params:     request,
    jsonrpc: {
      jsonrpc: "2.0",
      id:      1,
      method:  "wallet_requestExecutionPermissions",
      params:  request,
    },
  });
});

/**
 * POST /v1/mandates/:id/grant
 *
 * Store the ERC-7715 response (the `context` blob + `delegationManager`)
 * so that ERC-7710 `redeemDelegations` can later be called by the worker.
 */
route.post("/:id/grant", async (c) => {
  const project = c.get("project");
  await ensureMandatesTable(project.schema_name);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);

  let body: { context?: string; delegationManager?: string } = {};
  try { body = JSON.parse(c.get("bodyText") || "{}"); } catch { /* ok */ }
  const ctx = (body.context ?? "").trim();
  const dm  = (body.delegationManager ?? "").trim();
  if (!/^0x[0-9a-fA-F]+$/.test(ctx))                 return c.json({ error: "invalid context (must be 0x hex)" }, 400);
  if (!/^0x[0-9a-fA-F]{40}$/.test(dm))               return c.json({ error: "invalid delegationManager address" }, 400);

  const rows = await sql.unsafe(
    `UPDATE "${project.schema_name}".mandates
     SET permission_context = $1, delegation_manager = $2
     WHERE id = $3 AND status IN ('pending','armed')
     RETURNING id, status`,
    [ctx, dm.toLowerCase(), id],
  ) as unknown as Array<{ id: number; status: string }>;
  if (rows.length === 0)
    return c.json({ error: "not found or not in pending/armed state" }, 404);

  return c.json({
    ok:                 true,
    id,
    status:             rows[0]!.status,
    permission_context: ctx,
    delegation_manager: dm,
    note:               "context stored — ERC-7710 redeemDelegations can be called by the worker at execution time",
  });
});

export { route as mandatesRoute };
