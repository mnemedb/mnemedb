import { Hono } from "hono";
import {
  storageEnabled,
  isValidStorageKey,
  putObject,
  deleteObject,
  headObject,
  presignGet,
  listObjects,
} from "../storage";
import {
  getStorageQuota,
  adjustBytesUsed,
  creditBurn,
  FREE_TIER_BYTES,
} from "../db";
import { publicClient } from "../chain";
import { decodeEventLog, parseAbi, erc20Abi } from "viem";

const route = new Hono();

const MAX_FILE_BYTES   = 10 * 1024 * 1024;   // 10 MB per upload
const MNEME_TOKEN      = "0x3FcDbEBD5e7BaB79477cFDcA2CDCF6e904C27b07" as const;
const BURN_ADDRESS     = "0x000000000000000000000000000000000000dEaD" as const;
const MNEME_DECIMALS   = 18;

// Burn tiers: amount_raw threshold (in token units, NOT raw) → bytes + days
// Pick the LARGEST tier the burn qualifies for.
const BURN_TIERS: Array<{ minTokens: number; bytes: number; days: number; label: string }> = [
  { minTokens: 10_000, bytes: 100 * 1024 * 1024 * 1024, days: 30, label: "100 GB / 30d" },
  { minTokens: 1_000,  bytes:  10 * 1024 * 1024 * 1024, days: 30, label: "10 GB / 30d" },
  { minTokens: 100,    bytes:       1 * 1024 * 1024 * 1024, days: 30, label: "1 GB / 30d" },
];

function tierFor(amountTokens: number): typeof BURN_TIERS[number] | null {
  for (const t of BURN_TIERS) if (amountTokens >= t.minTokens) return t;
  return null;
}

function notEnabled() {
  return { error: "storage not configured on this gateway (set R2_* env vars)" };
}

// ─── Quota ────────────────────────────────────────────────────────────────
route.get("/quota", async (c) => {
  const wallet = c.get("project").owner_wallet;
  const q = await getStorageQuota(wallet);
  return c.json({
    wallet:           q.wallet,
    bytes_used:       q.bytes_used,
    bytes_limit:      q.bytes_limit,
    bytes_available:  q.bytes_available,
    free_tier_bytes:  FREE_TIER_BYTES,
    bonus_expires_at: q.bonus_expires_at,
  });
});

// ─── Upload ───────────────────────────────────────────────────────────────
// JSON body: { key, visibility, content_type, content_base64 }
// Using base64+JSON instead of multipart so the existing per-request EIP-712
// auth flow signs over a deterministic body. Phase 2 will add presigned R2
// PUT URLs for direct browser uploads (zero gateway bandwidth).
route.post("/upload", async (c) => {
  if (!storageEnabled()) return c.json(notEnabled(), 503);

  const project = c.get("project");
  const wallet  = project.owner_wallet;
  const handle  = project.handle;

  let body: { key?: string; visibility?: string; content_type?: string; content_base64?: string };
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const key = String(body.key ?? "");
  const visibility: "public" | "private" = body.visibility === "public" ? "public" : "private";
  const contentType = body.content_type || "application/octet-stream";

  if (!key || !isValidStorageKey(key)) {
    return c.json({ error: "invalid 'key' (alphanum, dot, dash, slash, underscore; max 512)" }, 400);
  }
  if (!body.content_base64) {
    return c.json({ error: "missing 'content_base64'" }, 400);
  }

  let buf: Buffer;
  try { buf = Buffer.from(body.content_base64, "base64"); }
  catch { return c.json({ error: "invalid base64 content" }, 400); }

  if (buf.byteLength > MAX_FILE_BYTES) return c.json({ error: `file too large (max ${MAX_FILE_BYTES} bytes)` }, 413);
  if (buf.byteLength === 0)            return c.json({ error: "file is empty" }, 400);

  // Quota check (with already-stored object adjustment if overwriting)
  const quota = await getStorageQuota(wallet);
  const existing = await headObject(handle, visibility, key).catch(() => null);
  const delta  = buf.byteLength - (existing?.size ?? 0);
  if (delta > quota.bytes_available) {
    return c.json({
      error:           "quota exceeded",
      bytes_required:  delta,
      bytes_available: quota.bytes_available,
      bytes_limit:     quota.bytes_limit,
      hint:            "burn $MNEME to extend capacity — POST /v1/storage/burn",
    }, 402);
  }

  const result = await putObject({
    handle, key, visibility,
    body:        buf,
    contentType,
  });

  await adjustBytesUsed(wallet, delta);

  return c.json({
    ok:           true,
    key:          result.key,
    visibility,
    size:         result.size,
    content_type: result.contentType,
    public_url:   result.publicUrl,
  });
});

// ─── List ─────────────────────────────────────────────────────────────────
route.get("/list", async (c) => {
  if (!storageEnabled()) return c.json(notEnabled(), 503);
  const handle = c.get("project").handle;
  const visRaw = c.req.query("visibility") ?? "private";
  const visibility: "public" | "private" = visRaw === "public" ? "public" : "private";
  const prefix = c.req.query("prefix") ?? "";

  const objects = await listObjects(handle, visibility, prefix);
  return c.json({
    visibility,
    count:   objects.length,
    objects: objects.map((o) => ({
      key:           o.key,
      size:          o.size,
      last_modified: o.lastModified,
      public_url:    o.publicUrl,
    })),
  });
});

// ─── Delete ───────────────────────────────────────────────────────────────
route.delete("/object", async (c) => {
  if (!storageEnabled()) return c.json(notEnabled(), 503);
  const project = c.get("project");
  const wallet  = project.owner_wallet;
  const handle  = project.handle;

  const key    = c.req.query("key") ?? "";
  const visRaw = c.req.query("visibility") ?? "private";
  const visibility: "public" | "private" = visRaw === "public" ? "public" : "private";
  if (!isValidStorageKey(key)) return c.json({ error: "invalid 'key'" }, 400);

  const meta = await headObject(handle, visibility, key);
  if (!meta) return c.json({ error: "object not found" }, 404);

  await deleteObject(handle, visibility, key);
  await adjustBytesUsed(wallet, -meta.size);

  return c.json({ ok: true, key, freed_bytes: meta.size });
});

// ─── Presigned URL (for private objects) ──────────────────────────────────
route.get("/url", async (c) => {
  if (!storageEnabled()) return c.json(notEnabled(), 503);
  const handle = c.get("project").handle;
  const key    = c.req.query("key") ?? "";
  const visRaw = c.req.query("visibility") ?? "private";
  const visibility: "public" | "private" = visRaw === "public" ? "public" : "private";
  const expiresIn = Math.min(Math.max(Number(c.req.query("expires_in") ?? 900), 60), 86400);

  if (!isValidStorageKey(key)) return c.json({ error: "invalid 'key'" }, 400);

  const url = await presignGet(handle, visibility, key, expiresIn);
  return c.json({ url, expires_in: expiresIn });
});

// ─── Burn $MNEME → extend quota ───────────────────────────────────────────
// Body: { tx_hash: "0x..." }
// Verifies the tx on Base mainnet:
//   - is to the MNEME token contract
//   - emits ERC20 Transfer(from=owner_wallet, to=BURN_ADDRESS, value≥tier minimum)
// Then upserts the burn ledger and credits the wallet's bonus_bytes.
route.post("/burn", async (c) => {
  if (!storageEnabled()) return c.json(notEnabled(), 503);
  const project = c.get("project");
  const wallet  = project.owner_wallet.toLowerCase();

  const body = await c.req.json().catch(() => ({}));
  const txHash = String(body.tx_hash ?? "").toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
    return c.json({ error: "invalid tx_hash" }, 400);
  }

  // Fetch + verify the tx receipt
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch {
    return c.json({ error: "tx not found on Base (still pending?)" }, 404);
  }
  if (receipt.status !== "success") {
    return c.json({ error: "tx reverted" }, 400);
  }

  // Find the Transfer log to BURN_ADDRESS for MNEME from wallet
  let amountRaw: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MNEME_TOKEN.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi:    erc20Abi,
        data:   log.data,
        topics: log.topics,
      });
      if (decoded.eventName !== "Transfer") continue;
      const { from, to, value } = decoded.args as { from: string; to: string; value: bigint };
      if (from.toLowerCase() !== wallet) continue;
      if (to.toLowerCase()   !== BURN_ADDRESS.toLowerCase()) continue;
      amountRaw = value;
      break;
    } catch {
      // not a Transfer event, skip
    }
  }

  if (amountRaw === null) {
    return c.json({ error: `no $MNEME burn from ${wallet} to ${BURN_ADDRESS} found in this tx` }, 400);
  }

  // Convert raw to tokens (with 18 decimals)
  const amountTokens = Number(amountRaw) / 10 ** MNEME_DECIMALS;
  const tier = tierFor(amountTokens);
  if (!tier) {
    return c.json({
      error: `burn amount ${amountTokens} $MNEME below minimum tier (100)`,
      tiers: BURN_TIERS,
    }, 400);
  }

  const result = await creditBurn({
    tx_hash:     txHash,
    wallet,
    amount_raw:  amountRaw.toString(),
    bytes_added: tier.bytes,
    days_added:  tier.days,
  });

  if (!result.credited) {
    return c.json({ error: "tx already credited", new_expires_at: result.new_expires_at }, 409);
  }

  const quota = await getStorageQuota(wallet);
  return c.json({
    ok:               true,
    tx_hash:          txHash,
    burned_tokens:    amountTokens,
    tier:             tier.label,
    bytes_added:      tier.bytes,
    days_added:       tier.days,
    new_expires_at:   result.new_expires_at,
    quota,
  });
});

export { route as storageRoute };
