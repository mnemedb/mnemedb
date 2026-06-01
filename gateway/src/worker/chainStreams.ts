/**
 * Mneme Live — chain-streams worker.
 *
 * Polls Base via viem's publicClient. Every tick:
 *   1. Get current chain head
 *   2. Read cursor → blocks to scan: (cursor, head]
 *   3. Snapshot active streams (contract, topic0 set)
 *   4. ONE eth_getLogs across all subscribed addresses+topics in the range
 *   5. For each log, find every matching stream and INSERT a row into its
 *      target table. Decoding handled via stored abi_inputs.
 *   6. Advance cursor to `head`
 *
 * Designed to run in-process inside the gateway. Disabled by setting
 * STREAMS_WORKER_ENABLED=false (useful for local dev or when running a
 * separate worker dyno later).
 */
import { sql } from "../db";
import { publicClient } from "../chain";
import { decodeEventLog, type Log, type Hex } from "viem";

const BASE_CHAIN_ID = 8453;
const POLL_INTERVAL_MS  = Number(process.env.STREAMS_POLL_MS  ?? 6_000);
const MAX_BLOCKS_PER_CALL = Number(process.env.STREAMS_BLOCK_CHUNK ?? 500);
const STARTUP_LOOKBACK_BLOCKS = Number(process.env.STREAMS_LOOKBACK ?? 5);

interface StreamRow {
  id:           number;
  project_id:   number;
  schema_name:  string;
  contract:     string;
  topic0:       string;
  event_name:   string;
  abi_inputs:   Array<{ name: string; type: string; indexed: boolean }>;
  target_table: string;
}

let running = false;
let timer:    ReturnType<typeof setTimeout> | undefined;

export function startChainStreamsWorker() {
  if (process.env.STREAMS_WORKER_ENABLED === "false") {
    console.log("[streams] worker disabled via STREAMS_WORKER_ENABLED=false");
    return;
  }
  if (running) return;
  running = true;
  console.log(`[streams] worker starting · poll every ${POLL_INTERVAL_MS}ms · chunk ${MAX_BLOCKS_PER_CALL} blocks`);
  void loop();
}

export function stopChainStreamsWorker() {
  running = false;
  if (timer) clearTimeout(timer);
}

async function loop() {
  while (running) {
    try {
      await tick();
    } catch (e) {
      console.error("[streams] tick failed:", (e as Error).message);
    }
    await new Promise<void>((r) => {
      timer = setTimeout(r, POLL_INTERVAL_MS);
    });
  }
}

async function tick(): Promise<void> {
  // Snapshot of active streams joined to their project's schema
  const streams = await sql<StreamRow[]>`
    SELECT s.id, s.project_id, p.schema_name,
           s.contract, s.topic0, s.event_name, s.abi_inputs, s.target_table
    FROM _mneme_streams s
    JOIN _mneme_projects p ON p.id = s.project_id
    WHERE s.active = true
  `;
  if (streams.length === 0) return;

  // Read cursor
  const cursorRows = await sql<Array<{ last_block: string }>>`
    SELECT last_block::text FROM _mneme_chain_cursor WHERE chain_id = ${BASE_CHAIN_ID}
  `;
  const cursor = cursorRows[0] ? BigInt(cursorRows[0].last_block) : 0n;

  const head = await publicClient.getBlockNumber();
  if (head <= cursor && cursor !== 0n) return;

  // First-run safety: start near head, don't scan all of Base history
  const startBlock = cursor === 0n
    ? (head > BigInt(STARTUP_LOOKBACK_BLOCKS) ? head - BigInt(STARTUP_LOOKBACK_BLOCKS) : 0n)
    : cursor + 1n;

  // Clamp range
  const endBlock = (head - startBlock + 1n) > BigInt(MAX_BLOCKS_PER_CALL)
    ? startBlock + BigInt(MAX_BLOCKS_PER_CALL) - 1n
    : head;

  // Dedup contracts + topics for ONE eth_getLogs across all streams
  const addresses = [...new Set(streams.map((s) => s.contract))] as `0x${string}`[];
  const topics    = [...new Set(streams.map((s) => s.topic0))]   as `0x${string}`[];

  let logs: Log[];
  try {
    logs = await publicClient.getLogs({
      address:   addresses,
      events:    undefined,     // we filter on topics manually
      fromBlock: startBlock,
      toBlock:   endBlock,
    });
  } catch (e) {
    console.error(`[streams] getLogs ${startBlock}-${endBlock} failed:`, (e as Error).message);
    return;
  }

  // Pre-bucket streams by (contract, topic0) for O(1) match per log
  const buckets = new Map<string, StreamRow[]>();
  for (const s of streams) {
    const k = `${s.contract}:${s.topic0}`;
    const arr = buckets.get(k) ?? [];
    arr.push(s);
    buckets.set(k, arr);
  }

  // Group matching log → stream pairs
  let inserted = 0;
  for (const log of logs) {
    const addr = log.address?.toLowerCase();
    const t0   = log.topics?.[0]?.toLowerCase();
    if (!addr || !t0) continue;
    const matches = buckets.get(`${addr}:${t0}`);
    if (!matches || matches.length === 0) continue;

    for (const s of matches) {
      try {
        // Decode using stored ABI
        const decoded = decodeEventLog({
          abi: [{
            type:      "event",
            name:      s.event_name,
            inputs:    s.abi_inputs,
            anonymous: false,
          }],
          data:   log.data as Hex,
          topics: log.topics as [Hex, ...Hex[]],
        }) as { eventName: string; args: Record<string, unknown> | unknown[] };

        // Normalize args to plain JSON-safe object (BigInts → strings)
        const argsObj = jsonifyArgs(decoded.args, s.abi_inputs);

        // Look up block timestamp (one RPC per unique block — cheap enough at our volume)
        const blockTs = await getBlockTimestamp(log.blockNumber!);

        await sql.unsafe(
          `INSERT INTO "${s.schema_name}"."${s.target_table}"
            (tx_hash, block_number, log_index, contract, event_name, args, block_ts)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
           ON CONFLICT (tx_hash, log_index) DO NOTHING`,
          [
            log.transactionHash!,
            log.blockNumber!.toString(),
            log.logIndex!,
            addr,
            s.event_name,
            JSON.stringify(argsObj),
            blockTs.toISOString(),
          ],
        );
        inserted++;
      } catch (e) {
        console.error(`[streams] decode/insert stream=${s.id}:`, (e as Error).message);
      }
    }
  }

  // Advance cursor
  await sql`
    INSERT INTO _mneme_chain_cursor (chain_id, last_block, updated_at)
    VALUES (${BASE_CHAIN_ID}, ${endBlock.toString()}::bigint, now())
    ON CONFLICT (chain_id) DO UPDATE
    SET last_block = EXCLUDED.last_block,
        updated_at = now()
  `;

  if (inserted > 0 || logs.length > 0) {
    console.log(`[streams] blocks ${startBlock}-${endBlock} · ${logs.length} logs · ${inserted} inserts`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const blockTsCache = new Map<string, Date>();
async function getBlockTimestamp(blockNumber: bigint): Promise<Date> {
  const key = blockNumber.toString();
  const cached = blockTsCache.get(key);
  if (cached) return cached;
  const block = await publicClient.getBlock({ blockNumber });
  const ts = new Date(Number(block.timestamp) * 1000);
  // Bound the cache so it doesn't grow forever
  if (blockTsCache.size > 1000) blockTsCache.clear();
  blockTsCache.set(key, ts);
  return ts;
}

/**
 * decodeEventLog returns either:
 *   - an object keyed by named args, OR
 *   - an array if the event signature had no arg names.
 * Either way: convert BigInts to strings for JSONB, normalize to object.
 */
function jsonifyArgs(
  raw:    Record<string, unknown> | unknown[],
  inputs: Array<{ name: string; type: string }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const k = inputs[i]?.name || `arg${i}`;
      out[k]  = normalizeVal(raw[i]);
    }
  } else {
    for (const [k, v] of Object.entries(raw)) out[k] = normalizeVal(v);
  }
  return out;
}

function normalizeVal(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v))      return v.map(normalizeVal);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, vv] of Object.entries(v as Record<string, unknown>)) out[k] = normalizeVal(vv);
    return out;
  }
  return v;
}
