/**
 * Per-wallet rate limiter. In-memory token bucket; resets per minute.
 *
 * Free tier:  120 req/min (= ~2/sec average, enough for casual UI + dev work)
 * Bonus tier: 1200 req/min (= ~20/sec, for Playground apps + busy projects)
 *
 * "Bonus" eligibility is anyone with active storage bonus capacity (i.e. they've
 * burned $MNEME and have time remaining). This piggybacks the storage burn
 * mechanism — burning gets you more storage AND more API throughput.
 *
 * Sends standard rate-limit headers (RFC 6585 / draft-ietf-httpapi-ratelimit).
 * Returns 429 with Retry-After when exceeded.
 */
import type { MiddlewareHandler } from "hono";
import { sql } from "./db";

const FREE_RPM    = 120;
const BONUS_RPM   = 1200;
const WINDOW_MS   = 60_000;

interface Bucket { count: number; resetAt: number; limit: number }

const buckets = new Map<string, Bucket>();
const bonusCache = new Map<string, { until: number; bonusActive: boolean }>();
const BONUS_TTL_MS = 30_000;

async function isBonusActive(wallet: string): Promise<boolean> {
  const w = wallet.toLowerCase();
  const cached = bonusCache.get(w);
  if (cached && cached.until > Date.now()) return cached.bonusActive;
  let active = false;
  try {
    const rows = await sql<Array<{ bonus_expires_at: Date | null; bonus_bytes: string }>>`
      SELECT bonus_expires_at, bonus_bytes
      FROM _mneme_storage_quotas WHERE wallet = ${w}
    `;
    if (rows.length > 0) {
      const r = rows[0]!;
      active = !!r.bonus_expires_at && r.bonus_expires_at > new Date() && Number(r.bonus_bytes) > 0;
    }
  } catch {
    // table may not exist on a fresh install — be permissive, default free tier
  }
  bonusCache.set(w, { until: Date.now() + BONUS_TTL_MS, bonusActive: active });
  return active;
}

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  // Only rate-limit authenticated routes (auth middleware sets c.var.wallet)
  const wallet = c.get("wallet") as string | undefined;
  if (!wallet) return next();

  const w = wallet.toLowerCase();
  const now = Date.now();
  let bucket = buckets.get(w);

  if (!bucket || bucket.resetAt <= now) {
    const bonus = await isBonusActive(w);
    bucket = {
      count:   0,
      resetAt: now + WINDOW_MS,
      limit:   bonus ? BONUS_RPM : FREE_RPM,
    };
    buckets.set(w, bucket);
  }

  bucket.count++;

  const remaining = Math.max(0, bucket.limit - bucket.count);
  const resetSec  = Math.ceil((bucket.resetAt - now) / 1000);

  c.header("X-RateLimit-Limit",     String(bucket.limit));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset",     String(resetSec));

  if (bucket.count > bucket.limit) {
    c.header("Retry-After", String(resetSec));
    return c.json({
      error: "rate limit exceeded",
      limit: bucket.limit,
      reset_seconds: resetSec,
      hint:  bucket.limit === FREE_RPM
        ? "burn $MNEME for storage to unlock the bonus tier (1200 req/min)"
        : "wait until the window resets",
    }, 429);
  }

  return next();
};
