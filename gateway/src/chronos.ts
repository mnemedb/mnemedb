/**
 * Mneme Chronos — Merkle anchoring core.
 *
 * The journal (per-schema _journal table) is an append-only log of every
 * write. Chronos periodically builds a Merkle tree over a journal range
 * and stores the root in _mneme_chronos_anchors. If CHRONOS_ANCHOR_KEY
 * is set, the root is also posted to Base as tx calldata — making the
 * agent's memory state provable against public chain data.
 *
 * Leaf hash (deterministic — jsonb::text from Postgres is stable):
 *   sha256(`${id}|${tbl}|${op}|${row_id}|${epoch_ms}|${row_data_text}`)
 *
 * Tree: pairwise sha256(left + right), odd node promoted unchanged.
 * Proof: sibling path from leaf to root — verifiable by anyone holding
 * the journal row and the anchored root.
 */
import { createHash } from "node:crypto";
import { sql, isValidSchemaName } from "./db";

export function sha256hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

interface JournalLeafRow {
  id:       string;      // bigint comes back as string
  tbl:      string;
  op:       string;
  row_id:   string;
  at:       Date;
  row_text: string | null;
}

export function leafHash(r: JournalLeafRow): string {
  const ms = r.at instanceof Date ? r.at.getTime() : new Date(r.at).getTime();
  return sha256hex(`${r.id}|${r.tbl}|${r.op}|${r.row_id}|${ms}|${r.row_text ?? "null"}`);
}

/** Build all layers bottom-up. layers[0] = leaves, last layer = [root]. */
export function buildMerkle(leaves: string[]): { root: string; layers: string[][] } {
  if (leaves.length === 0) return { root: sha256hex("mneme-empty"), layers: [[]] };
  const layers: string[][] = [leaves];
  let cur = leaves;
  while (cur.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      next.push(i + 1 < cur.length ? sha256hex(cur[i]! + cur[i + 1]!) : cur[i]!);
    }
    layers.push(next);
    cur = next;
  }
  return { root: cur[0]!, layers };
}

/** Sibling path for the leaf at `index`. Each step: {hash, side} where side is where the SIBLING sits. */
export function merklePath(layers: string[][], index: number): Array<{ hash: string; side: "left" | "right" }> {
  const path: Array<{ hash: string; side: "left" | "right" }> = [];
  let idx = index;
  for (let l = 0; l < layers.length - 1; l++) {
    const layer = layers[l]!;
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    if (siblingIdx < layer.length) {
      path.push({ hash: layer[siblingIdx]!, side: isRight ? "left" : "right" });
    }
    idx = Math.floor(idx / 2);
  }
  return path;
}

async function fetchLeafRows(schema: string, fromId: bigint, toId: bigint): Promise<JournalLeafRow[]> {
  return await sql.unsafe(
    `SELECT id::text, tbl, op, row_id, at, row_data::text AS row_text
     FROM "${schema}"._journal
     WHERE id >= $1 AND id <= $2
     ORDER BY id ASC`,
    [fromId.toString(), toId.toString()],
  ) as unknown as JournalLeafRow[];
}

export interface AnchorRow {
  id:          number;
  schema_name: string;
  from_id:     string;
  to_id:       string;
  leaf_count:  number;
  merkle_root: string;
  tx_hash:     string | null;
  anchored_at: Date;
}

/**
 * Create a new anchor covering all journal entries since the last one.
 * Returns null if there is nothing new to anchor.
 */
export async function createAnchor(schema: string): Promise<AnchorRow | null> {
  if (!isValidSchemaName(schema)) throw new Error("invalid schema");

  const last = await sql<Array<{ to_id: string }>>`
    SELECT to_id::text FROM _mneme_chronos_anchors
    WHERE schema_name = ${schema}
    ORDER BY to_id DESC LIMIT 1
  `;
  const fromId = last.length ? BigInt(last[0]!.to_id) + 1n : 1n;

  const maxRow = await sql.unsafe(
    `SELECT COALESCE(MAX(id), 0)::text AS max FROM "${schema}"._journal`,
  ) as unknown as Array<{ max: string }>;
  const toId = BigInt(maxRow[0]?.max ?? "0");
  if (toId < fromId) return null;   // nothing new

  const rows = await fetchLeafRows(schema, fromId, toId);
  if (rows.length === 0) return null;
  const { root } = buildMerkle(rows.map(leafHash));

  // Optional: post the root to Base as calldata on a self-tx.
  let txHash: string | null = null;
  const key = process.env.CHRONOS_ANCHOR_KEY;
  if (key && /^0x[0-9a-fA-F]{64}$/.test(key)) {
    try {
      const { createWalletClient, http } = await import("viem");
      const { privateKeyToAccount }       = await import("viem/accounts");
      const { base }                      = await import("viem/chains");
      const account = privateKeyToAccount(key as `0x${string}`);
      const wallet  = createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org") });
      txHash = await wallet.sendTransaction({
        to:    account.address,
        value: 0n,
        data:  (`0x${root}`) as `0x${string}`,
      });
    } catch (e) {
      console.error(`[chronos] onchain anchor failed for ${schema}:`, (e as Error).message);
    }
  }

  const inserted = await sql<AnchorRow[]>`
    INSERT INTO _mneme_chronos_anchors (schema_name, from_id, to_id, leaf_count, merkle_root, tx_hash)
    VALUES (${schema}, ${fromId.toString()}, ${toId.toString()}, ${rows.length}, ${root}, ${txHash})
    RETURNING id, schema_name, from_id::text, to_id::text, leaf_count, merkle_root, tx_hash, anchored_at
  `;
  return inserted[0]!;
}

export interface ChronosProof {
  journal_id:  string;
  leaf:        string;
  path:        Array<{ hash: string; side: "left" | "right" }>;
  merkle_root: string;
  anchor_id:   number;
  tx_hash:     string | null;
  anchored_at: Date;
  leaf_count:  number;
  verified:    boolean;
}

/** Build a Merkle proof for one journal entry against its covering anchor. */
export async function getProof(schema: string, journalId: bigint): Promise<ChronosProof | { error: string }> {
  if (!isValidSchemaName(schema)) throw new Error("invalid schema");

  const anchors = await sql<AnchorRow[]>`
    SELECT id, schema_name, from_id::text, to_id::text, leaf_count, merkle_root, tx_hash, anchored_at
    FROM _mneme_chronos_anchors
    WHERE schema_name = ${schema}
      AND from_id <= ${journalId.toString()}::bigint
      AND to_id   >= ${journalId.toString()}::bigint
    ORDER BY id DESC LIMIT 1
  `;
  if (anchors.length === 0) {
    return { error: "journal entry not covered by an anchor yet — POST /v1/chronos/anchor first" };
  }
  const anchor = anchors[0]!;

  const rows = await fetchLeafRows(schema, BigInt(anchor.from_id), BigInt(anchor.to_id));
  const leaves = rows.map(leafHash);
  const idx = rows.findIndex((r) => r.id === journalId.toString());
  if (idx === -1) return { error: "journal entry not found in anchored range" };

  const { root, layers } = buildMerkle(leaves);
  const path = merklePath(layers, idx);

  // Self-verify: fold the path back up and compare with the stored root.
  let acc = leaves[idx]!;
  for (const step of path) {
    acc = step.side === "left" ? sha256hex(step.hash + acc) : sha256hex(acc + step.hash);
  }

  return {
    journal_id:  journalId.toString(),
    leaf:        leaves[idx]!,
    path,
    merkle_root: anchor.merkle_root,
    anchor_id:   anchor.id,
    tx_hash:     anchor.tx_hash,
    anchored_at: anchor.anchored_at,
    leaf_count:  anchor.leaf_count,
    verified:    acc === root && root === anchor.merkle_root,
  };
}
