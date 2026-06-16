/**
 * Mneme Mesh — agent-to-agent memory marketplace.
 *
 * A project (seller) publishes a specific table for paid querying. Other
 * agents (buyers) discover listings and pay per query. Free tier:
 * 10 queries per consumer wallet, ever. Paid: USDC credits or $MNEME burn.
 *
 *   GET    /v1/mesh/discover               browse marketplace
 *   POST   /v1/mesh/listings               publish a table (seller, auth)
 *   GET    /v1/mesh/listings               your own listings (seller)
 *   DELETE /v1/mesh/listings/:id           deactivate a listing
 *   POST   /v1/mesh/query/:listing_id      buy + run a query (buyer)
 *   GET    /v1/mesh/credits                your buyer credits
 *   POST   /v1/mesh/credits/topup          submit a USDC-on-Base tx to credit
 *   GET    /v1/mesh/sales                  your sales dashboard (seller)
 *
 * Public discovery is open (no auth). Everything else needs wallet auth or API key.
 */
import { Hono } from "hono";
import { sql, isValidTableName } from "../db";
import { publicClient } from "../chain";
import { erc20Abi, formatUnits } from "viem";

const route = new Hono();

const VALID_KINDS = ["memories", "documents", "events", "entities", "relations", "dreams"] as const;

// Treasury wallet that receives USDC topups. Set via env.
const MESH_TREASURY = (process.env.MESH_TREASURY_ADDRESS ?? "").toLowerCase();
// USDC on Base
const USDC_ADDRESS  = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const USDC_DECIMALS = 6;
// $MNEME burn → credit ratio. 1000 MNEME = 1 USDC of credit (configurable).
const MNEME_PER_USDC_CREDIT = Number(process.env.MNEME_PER_USDC_CREDIT ?? 1000);

// ─── GET /discover — public marketplace browse ───────────────────────────
route.get("/discover", async (c) => {
  const kind  = c.req.query("kind");
  const q     = c.req.query("q");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);

  const where: string[] = ["l.active = true", "p.mesh_enabled = true"];
  const params: unknown[] = [];
  let p = 1;
  if (kind)  { where.push(`l.kind = $${p++}`);                            params.push(kind); }
  if (q)     { where.push(`(l.title ILIKE $${p++} OR p.handle ILIKE $${p++})`); params.push(`%${q}%`, `%${q}%`); p++; }

  const rows = await sql.unsafe(
    `SELECT l.id, l.kind, l.title, l.description, l.price_usdc, l.price_mneme,
            l.query_count, l.created_at,
            p.handle  AS seller_handle,
            p.mesh_bio AS seller_bio
     FROM _mneme_mesh_listings l
     JOIN _mneme_projects p ON p.id = l.project_id
     WHERE ${where.join(" AND ")}
     ORDER BY l.query_count DESC, l.created_at DESC
     LIMIT ${limit}`,
    params as never[],
  );
  return c.json({ count: rows.length, listings: rows });
});

// ─── POST /listings — publish (seller) ───────────────────────────────────
interface NewListing {
  table_name?:  string;
  kind?:        string;
  title?:       string;
  description?: string;
  price_usdc?:  number;
  price_mneme?: number;
  bio?:         string;
}

route.post("/listings", async (c) => {
  const project = c.get("project");
  let body: NewListing;
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const table = (body.table_name ?? "").trim();
  const kind  = (body.kind       ?? "").trim();
  const title = (body.title      ?? "").trim();
  if (!isValidTableName(table))            return c.json({ error: "invalid table_name" }, 400);
  if (!(VALID_KINDS as readonly string[]).includes(kind))
                                            return c.json({ error: `kind must be one of ${VALID_KINDS.join(", ")}` }, 400);
  if (!title || title.length > 200)         return c.json({ error: "title is required, ≤ 200 chars" }, 400);
  const price = Number(body.price_usdc ?? 0);
  if (!Number.isFinite(price) || price < 0 || price > 10_000)
                                            return c.json({ error: "price_usdc must be 0..10000" }, 400);
  const priceMneme = body.price_mneme != null ? Number(body.price_mneme) : null;
  if (priceMneme != null && (!Number.isFinite(priceMneme) || priceMneme < 0))
                                            return c.json({ error: "price_mneme must be ≥ 0" }, 400);

  // Verify the table actually exists in seller's schema
  const exists = await sql<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = ${project.schema_name} AND table_name = ${table}
    ) AS exists
  `;
  if (!exists[0]?.exists) return c.json({ error: `table "${table}" not found in your schema` }, 404);

  // Flip mesh_enabled on the project if first listing
  if (body.bio !== undefined) {
    await sql`UPDATE _mneme_projects SET mesh_bio = ${body.bio} WHERE id = ${project.id}`;
  }
  await sql`UPDATE _mneme_projects SET mesh_enabled = true WHERE id = ${project.id}`;

  try {
    const rows = await sql<Array<{ id: number; created_at: Date }>>`
      INSERT INTO _mneme_mesh_listings
        (project_id, table_name, kind, title, description, price_usdc, price_mneme)
      VALUES
        (${project.id}, ${table}, ${kind}, ${title}, ${body.description ?? null},
         ${price}, ${priceMneme})
      RETURNING id, created_at
    `;
    return c.json({
      ok: true, id: rows[0]!.id, table_name: table, kind, title,
      price_usdc: price, price_mneme: priceMneme,
      url: `https://mnemedb.dev/mesh/${rows[0]!.id}`,
      created_at: rows[0]!.created_at,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("duplicate") || msg.includes("unique"))
      return c.json({ error: "you already have a listing for this table" }, 409);
    return c.json({ error: msg }, 500);
  }
});

// ─── GET /listings — your own listings ───────────────────────────────────
route.get("/listings", async (c) => {
  const project = c.get("project");
  const rows = await sql`
    SELECT id, table_name, kind, title, description, price_usdc, price_mneme,
           query_count, revenue_usdc, active, created_at
    FROM _mneme_mesh_listings
    WHERE project_id = ${project.id}
    ORDER BY active DESC, created_at DESC
  `;
  return c.json({ count: rows.length, listings: rows });
});

// ─── DELETE /listings/:id ────────────────────────────────────────────────
route.delete("/listings/:id", async (c) => {
  const project = c.get("project");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);
  const rows = await sql`
    UPDATE _mneme_mesh_listings
    SET active = false
    WHERE id = ${id} AND project_id = ${project.id}
    RETURNING id
  `;
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true, id });
});

// ─── POST /query/:listing_id — the actual sale ───────────────────────────
interface QueryBody { prompt?: string; limit?: number; pay_with?: "credits" | "free" }

route.post("/query/:listing_id", async (c) => {
  const buyerWallet = c.get("wallet") as string | undefined;
  if (!buyerWallet) return c.json({ error: "auth required" }, 401);
  const w = buyerWallet.toLowerCase();

  const id = Number(c.req.param("listing_id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid listing_id" }, 400);

  let body: QueryBody = {};
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }
  const promptStr = (body.prompt ?? "").trim();
  const cap       = Math.min(Math.max(Number(body.limit ?? 10), 1), 50);

  // Load listing + seller schema
  const lrows = await sql<Array<{
    id: number; project_id: number; table_name: string; kind: string;
    price_usdc: string; schema_name: string;
  }>>`
    SELECT l.id, l.project_id, l.table_name, l.kind, l.price_usdc::text, p.schema_name
    FROM _mneme_mesh_listings l
    JOIN _mneme_projects p ON p.id = l.project_id
    WHERE l.id = ${id} AND l.active = true
    LIMIT 1
  `;
  if (lrows.length === 0) return c.json({ error: "listing not found or inactive" }, 404);
  const listing = lrows[0]!;
  const price   = Number(listing.price_usdc);

  // Charge — try free tier first, then credits
  const creditRows = await sql<Array<{ credits_usdc: string; free_remaining: number }>>`
    INSERT INTO _mneme_mesh_credits (wallet) VALUES (${w})
    ON CONFLICT (wallet) DO UPDATE SET wallet = EXCLUDED.wallet
    RETURNING credits_usdc::text, free_remaining
  `;
  const credits = Number(creditRows[0]!.credits_usdc);
  const free    = creditRows[0]!.free_remaining;

  let paidVia: "free" | "credits" = "free";
  if (price === 0 || (body.pay_with === "free" && free > 0)) {
    if (free <= 0 && price > 0) {
      return c.json({
        error: "no free queries left and pay_with=free requested",
        free_remaining: 0,
        credits_usdc: credits,
        topup_url: "https://mnemedb.dev/mesh#topup",
      }, 402);
    }
    if (free > 0) {
      await sql`UPDATE _mneme_mesh_credits SET free_remaining = free_remaining - 1, updated_at = now() WHERE wallet = ${w}`;
      paidVia = "free";
    }
  } else {
    if (credits < price) {
      return c.json({
        error: "insufficient credits",
        required_usdc: price,
        credits_usdc: credits,
        free_remaining: free,
        topup_url: "https://mnemedb.dev/mesh#topup",
      }, 402);
    }
    await sql`
      UPDATE _mneme_mesh_credits
      SET credits_usdc = credits_usdc - ${price}, updated_at = now()
      WHERE wallet = ${w}
    `;
    paidVia = "credits";
  }

  // Execute the actual query
  let rows: unknown[] = [];
  try {
    if (listing.kind === "memories" || listing.kind === "documents" || listing.kind === "dreams") {
      const col = listing.kind === "memories" ? "text" : listing.kind === "dreams" ? "body" : "body";
      rows = promptStr
        ? await sql.unsafe(
            `SELECT id, ${col}, created_at FROM "${listing.schema_name}"."${listing.table_name}"
             WHERE ${col} ILIKE $1 ORDER BY created_at DESC LIMIT $2`,
            [`%${promptStr}%`, cap],
          ) as unknown[]
        : await sql.unsafe(
            `SELECT id, ${col}, created_at FROM "${listing.schema_name}"."${listing.table_name}"
             ORDER BY created_at DESC LIMIT $1`,
            [cap],
          ) as unknown[];
    } else if (listing.kind === "entities") {
      rows = promptStr
        ? await sql.unsafe(
            `SELECT id, kind, name, properties FROM "${listing.schema_name}"."${listing.table_name}"
             WHERE name ILIKE $1 OR kind ILIKE $1 LIMIT $2`,
            [`%${promptStr}%`, cap],
          ) as unknown[]
        : await sql.unsafe(
            `SELECT id, kind, name, properties FROM "${listing.schema_name}"."${listing.table_name}" LIMIT $1`,
            [cap],
          ) as unknown[];
    } else if (listing.kind === "relations") {
      rows = await sql.unsafe(
        `SELECT id, src_id, dst_id, kind FROM "${listing.schema_name}"."${listing.table_name}" LIMIT $1`,
        [cap],
      ) as unknown[];
    } else if (listing.kind === "events") {
      rows = await sql.unsafe(
        `SELECT id, kind, payload, created_at FROM "${listing.schema_name}"."${listing.table_name}"
         ORDER BY created_at DESC LIMIT $1`,
        [cap],
      ) as unknown[];
    }
  } catch (e) {
    // refund — query crashed
    if (paidVia === "credits") {
      await sql`UPDATE _mneme_mesh_credits SET credits_usdc = credits_usdc + ${price} WHERE wallet = ${w}`;
    } else if (paidVia === "free") {
      await sql`UPDATE _mneme_mesh_credits SET free_remaining = free_remaining + 1 WHERE wallet = ${w}`;
    }
    return c.json({ error: `query failed: ${(e as Error).message}` }, 500);
  }

  // Record + credit seller revenue
  await sql`
    INSERT INTO _mneme_mesh_queries
      (consumer_wallet, listing_id, prompt, rows_returned, cost_usdc, paid_via)
    VALUES
      (${w}, ${listing.id}, ${promptStr || null}, ${rows.length}, ${price}, ${paidVia})
  `;
  await sql`
    UPDATE _mneme_mesh_listings
    SET query_count = query_count + 1,
        revenue_usdc = revenue_usdc + ${paidVia === "free" ? 0 : price}
    WHERE id = ${listing.id}
  `;

  return c.json({
    ok:       true,
    listing_id: listing.id,
    rows,
    rows_returned: rows.length,
    cost_usdc: paidVia === "free" ? 0 : price,
    paid_via: paidVia,
  });
});

// ─── GET /credits ────────────────────────────────────────────────────────
route.get("/credits", async (c) => {
  const w = ((c.get("wallet") as string | undefined) ?? "").toLowerCase();
  if (!w) return c.json({ error: "auth required" }, 401);
  const rows = await sql<Array<{ credits_usdc: string; free_remaining: number; updated_at: Date }>>`
    SELECT credits_usdc::text, free_remaining, updated_at
    FROM _mneme_mesh_credits WHERE wallet = ${w}
  `;
  if (rows.length === 0) {
    return c.json({ wallet: w, credits_usdc: 0, free_remaining: 10, treasury: MESH_TREASURY || null });
  }
  return c.json({
    wallet: w,
    credits_usdc:   Number(rows[0]!.credits_usdc),
    free_remaining: rows[0]!.free_remaining,
    updated_at:     rows[0]!.updated_at,
    treasury:       MESH_TREASURY || null,
  });
});

// ─── POST /credits/topup — verify Base USDC tx → credit balance ──────────
interface TopupBody { tx_hash?: string }

route.post("/credits/topup", async (c) => {
  if (!MESH_TREASURY) return c.json({ error: "topup disabled — MESH_TREASURY_ADDRESS not configured" }, 503);
  const w = ((c.get("wallet") as string | undefined) ?? "").toLowerCase();
  if (!w) return c.json({ error: "auth required" }, 401);

  let body: TopupBody = {};
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }
  const tx = (body.tx_hash ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return c.json({ error: "invalid tx_hash" }, 400);

  // Idempotency — same tx can only credit once
  const seen = await sql<Array<{ tx_hash: string }>>`
    SELECT tx_hash FROM _mneme_mesh_topups WHERE tx_hash = ${tx}
  `;
  if (seen.length > 0) return c.json({ error: "tx already credited", tx_hash: tx }, 409);

  // Fetch receipt + parse Transfer event from USDC contract
  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: tx as `0x${string}` });
  } catch {
    return c.json({ error: "tx not found on Base yet — wait a block and retry" }, 404);
  }
  if (receipt.status !== "success") return c.json({ error: "tx reverted" }, 400);

  // Find the USDC Transfer log to MESH_TREASURY initiated by buyer
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const treasuryPadded = ("0x" + MESH_TREASURY.slice(2).padStart(64, "0")).toLowerCase();
  let amountRaw: bigint | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== USDC_ADDRESS) continue;
    if (log.topics[0] !== transferTopic)            continue;
    if (log.topics[2]?.toLowerCase() !== treasuryPadded) continue;
    // log.data is the value (uint256 hex)
    amountRaw = BigInt(log.data);
    break;
  }
  if (!amountRaw) return c.json({ error: "no USDC transfer to mesh treasury found in this tx" }, 400);

  const usdcAmount = Number(formatUnits(amountRaw, USDC_DECIMALS));

  // Atomically credit
  await sql.begin(async (tx2) => {
    await tx2`
      INSERT INTO _mneme_mesh_topups (tx_hash, wallet, kind, amount_usdc, raw_amount, block_number)
      VALUES (${tx}, ${w}, 'usdc', ${usdcAmount}, ${amountRaw!.toString()}, ${Number(receipt.blockNumber)})
    `;
    await tx2`
      INSERT INTO _mneme_mesh_credits (wallet, credits_usdc)
      VALUES (${w}, ${usdcAmount})
      ON CONFLICT (wallet) DO UPDATE
      SET credits_usdc = _mneme_mesh_credits.credits_usdc + ${usdcAmount}, updated_at = now()
    `;
  });

  return c.json({ ok: true, tx_hash: tx, credited_usdc: usdcAmount });
});

// ─── GET /sales — your seller dashboard ──────────────────────────────────
route.get("/sales", async (c) => {
  const project = c.get("project");
  const summary = await sql<Array<{
    total_queries: string; total_revenue: string; active_listings: string;
  }>>`
    SELECT
      COALESCE(SUM(query_count), 0)::text  AS total_queries,
      COALESCE(SUM(revenue_usdc), 0)::text AS total_revenue,
      COUNT(*) FILTER (WHERE active)::text AS active_listings
    FROM _mneme_mesh_listings WHERE project_id = ${project.id}
  `;
  const recent = await sql`
    SELECT q.id, q.listing_id, q.consumer_wallet, q.prompt, q.rows_returned,
           q.cost_usdc, q.paid_via, q.created_at,
           l.title AS listing_title, l.table_name
    FROM _mneme_mesh_queries q
    JOIN _mneme_mesh_listings l ON l.id = q.listing_id
    WHERE l.project_id = ${project.id}
    ORDER BY q.created_at DESC LIMIT 30
  `;
  return c.json({
    total_queries:   Number(summary[0]!.total_queries),
    total_revenue:   Number(summary[0]!.total_revenue),
    active_listings: Number(summary[0]!.active_listings),
    recent,
  });
});

export { route as meshRoute };
