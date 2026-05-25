/**
 * End-to-end storage smoke test against prod gateway.
 *
 *   $env:SMOKE_KEY = "0x<private-key-of-an-already-onboarded-wallet>"
 *   bun run scripts/smoke-storage.ts
 *
 * Exercises:
 *   1. quota endpoint (free tier visible)
 *   2. upload (public) — verifies R2 PUT + Postgres quota debit
 *   3. list — confirms object appears
 *   4. public URL fetch — confirms cdn.mnemedb.dev custom domain works
 *      (skipped if cdn.mnemedb.dev DNS not yet propagated)
 *   5. presigned URL (private) — second upload, signed-GET roundtrip
 *   6. delete (both objects) — confirms quota credit back
 *   7. final quota — should equal starting quota
 */
import { privateKeyToAccount } from "viem/accounts";
import { Mneme } from "mneme-sdk";

const PK      = process.env.SMOKE_KEY as `0x${string}` | undefined;
const GATEWAY = process.env.MNEME_GATEWAY ?? "https://gateway.mnemedb.dev";
if (!PK) { console.error("SMOKE_KEY env required"); process.exit(1); }

const account = privateKeyToAccount(PK);
const m = new Mneme({ account, gatewayUrl: GATEWAY });

console.log("─ storage smoke ──────────────────────");
console.log("gateway :", GATEWAY);
console.log("wallet  :", account.address);
console.log("");

// ─── 1. Starting quota ─────────────────────────────────────────────────
const q0 = await m.storage.quota();
console.log("1. quota (start)");
console.log("   used      :", q0.bytes_used, "B");
console.log("   limit     :", q0.bytes_limit, "B");
console.log("   available :", q0.bytes_available, "B");
console.log("");

// ─── 2. Upload — public text ──────────────────────────────────────────
const PUBLIC_KEY  = `smoke/${Date.now()}-public.txt`;
const PUBLIC_BODY = "hello from mneme storage smoke @ " + new Date().toISOString();
console.log("2. upload (public):", PUBLIC_KEY);
const up1 = await m.storage.upload({
  key:        PUBLIC_KEY,
  file:       PUBLIC_BODY,
  visibility: "public",
  contentType: "text/plain",
});
console.log("   ok     :", up1.ok);
console.log("   size   :", up1.size, "B");
console.log("   public :", up1.public_url);
console.log("");

// ─── 3. List public objects ───────────────────────────────────────────
const list1 = await m.storage.list({ visibility: "public", prefix: "smoke/" });
console.log("3. list (public, prefix=smoke/) →", list1.count, "object(s)");
for (const o of list1.objects.slice(0, 5)) {
  console.log("   -", o.key, "·", o.size, "B");
}
console.log("");

// ─── 4. Public URL fetch (custom domain) ──────────────────────────────
if (up1.public_url) {
  console.log("4. GET", up1.public_url);
  try {
    const res = await fetch(up1.public_url);
    if (res.ok) {
      const body = await res.text();
      const match = body === PUBLIC_BODY;
      console.log("   status :", res.status);
      console.log("   match  :", match ? "✓" : "✗ (body mismatch)");
      if (!match) console.log("   got    :", body);
    } else {
      console.log("   status :", res.status, "— cdn.mnemedb.dev not yet propagated?");
    }
  } catch (e) {
    console.log("   error  :", (e as Error).message, "— check cdn.mnemedb.dev DNS");
  }
}
console.log("");

// ─── 5. Private upload + presigned URL roundtrip ──────────────────────
const PRIVATE_KEY = `smoke/${Date.now()}-private.txt`;
const PRIVATE_BODY = "private content, presigned only";
console.log("5a. upload (private):", PRIVATE_KEY);
const up2 = await m.storage.upload({
  key:        PRIVATE_KEY,
  file:       PRIVATE_BODY,
  visibility: "private",
  contentType: "text/plain",
});
console.log("    size :", up2.size, "B");

console.log("5b. presign GET (expires=120s)");
const signed = await m.storage.url({ key: PRIVATE_KEY, visibility: "private", expiresIn: 120 });
console.log("    url    :", signed.url.slice(0, 80) + "…");
console.log("    expires:", signed.expires_in, "s");

const res2 = await fetch(signed.url);
const body2 = await res2.text();
console.log("    fetch  :", res2.status, body2 === PRIVATE_BODY ? "✓ match" : "✗ mismatch");
console.log("");

// ─── 6. Delete both ───────────────────────────────────────────────────
console.log("6. delete both");
const d1 = await m.storage.delete({ key: PUBLIC_KEY,  visibility: "public"  });
const d2 = await m.storage.delete({ key: PRIVATE_KEY, visibility: "private" });
console.log("   public  freed:", d1.freed_bytes, "B");
console.log("   private freed:", d2.freed_bytes, "B");
console.log("");

// ─── 7. Final quota ────────────────────────────────────────────────────
const q1 = await m.storage.quota();
console.log("7. quota (end)");
console.log("   used      :", q1.bytes_used, "B");
console.log("   delta     :", q1.bytes_used - q0.bytes_used, "B  (should be 0)");
console.log("");

const allGood =
  up1.ok && up2.ok &&
  list1.count >= 1 &&
  body2 === PRIVATE_BODY &&
  q1.bytes_used === q0.bytes_used;

console.log(allGood ? "✓ storage e2e OK" : "✗ something off — inspect output above");
process.exit(allGood ? 0 : 1);
