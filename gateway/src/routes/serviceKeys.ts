/**
 * Service account API keys — the integration path for B2B2C platforms like
 * Gitlawb that want to give their end-users (who don't have wallets) access
 * to a wallet-bound Mneme account.
 *
 * The master tenant (wallet-authed) creates scoped keys via POST /v1/service/keys.
 * Each key is restricted to a sub-namespace (table-name prefix) inside the
 * tenant's schema. Keys are revocable and rate-limited per-key.
 *
 * The raw key value (mneme_sk_...) is returned EXACTLY ONCE on creation.
 * We store SHA-256 hashes only. If lost, the user must create a new key.
 */
import { Hono } from "hono";
import { sql, hashApiKey, isValidScope } from "../db";

const route = new Hono();

const KEY_PREFIX = "mneme_sk_";
const RANDOM_BYTES = 32;

function generateKey(): string {
  const bytes = new Uint8Array(RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  // base64url, no padding
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return KEY_PREFIX + b64;
}

// ─── POST /v1/service/keys — mint a new key ──────────────────────────────
// Body: { scope: string (table-name prefix), label?: string, rpm_limit?: number }
// Auth: WALLET only — cannot mint keys with an API key (no key escalation)
route.post("/", async (c) => {
  // Refuse if request came in with an api-key (we don't let keys mint more keys)
  if (c.get("apiKeyId") !== undefined) {
    return c.json({ error: "service keys can only be minted by wallet-authed requests" }, 403);
  }

  const wallet = c.get("wallet").toLowerCase();

  let body: { scope?: string; label?: string; rpm_limit?: number };
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const scope = (body.scope ?? "").trim();
  if (!scope || !isValidScope(scope)) {
    return c.json({
      error: "invalid 'scope' — must be lowercase ident matching ^[a-z][a-z0-9_]{0,62}$ (this is the table-name prefix the key may touch)",
    }, 400);
  }
  const label    = typeof body.label === "string" ? body.label.slice(0, 100) : null;
  const rpmLimit = Math.min(Math.max(Number(body.rpm_limit ?? 1200), 60), 10000);

  const rawKey = generateKey();
  const hash   = await hashApiKey(rawKey);
  const prefix = rawKey.slice(0, 16);  // "mneme_sk_" + 7 chars

  const inserted = await sql<Array<{ id: number; created_at: Date }>>`
    INSERT INTO _mneme_api_keys (key_hash, key_prefix, owner_wallet, scope, label, rpm_limit)
    VALUES (${hash}, ${prefix}, ${wallet}, ${scope}, ${label}, ${rpmLimit})
    RETURNING id, created_at
  `;

  return c.json({
    ok:         true,
    id:         inserted[0]!.id,
    key:        rawKey,         // ← ONLY shown here, never again
    key_prefix: prefix,
    scope,
    label,
    rpm_limit:  rpmLimit,
    created_at: inserted[0]!.created_at,
    warning:    "Save this key now. It will not be shown again. If lost, revoke it and create a new one.",
  });
});

// ─── GET /v1/service/keys — list all keys for the caller wallet ─────────
route.get("/", async (c) => {
  const wallet = c.get("wallet").toLowerCase();

  const rows = await sql<Array<{
    id: number;
    key_prefix: string;
    scope: string;
    label: string | null;
    rpm_limit: number;
    revoked_at: Date | null;
    last_used_at: Date | null;
    created_at: Date;
  }>>`
    SELECT id, key_prefix, scope, label, rpm_limit, revoked_at, last_used_at, created_at
    FROM _mneme_api_keys
    WHERE owner_wallet = ${wallet}
    ORDER BY created_at DESC
  `;

  return c.json({
    keys: rows.map((r) => ({
      ...r,
      revoked: !!r.revoked_at,
    })),
  });
});

// ─── DELETE /v1/service/keys/:id — revoke a key ─────────────────────────
route.delete("/:id", async (c) => {
  if (c.get("apiKeyId") !== undefined) {
    return c.json({ error: "keys can only be revoked by wallet-authed requests" }, 403);
  }

  const wallet = c.get("wallet").toLowerCase();
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "invalid id" }, 400);

  const rows = await sql<Array<{ id: number }>>`
    UPDATE _mneme_api_keys
    SET revoked_at = now()
    WHERE id = ${id} AND owner_wallet = ${wallet} AND revoked_at IS NULL
    RETURNING id
  `;
  if (rows.length === 0) return c.json({ error: "key not found or already revoked" }, 404);

  return c.json({ ok: true, id: rows[0]!.id });
});

export { route as serviceKeysRoute };
