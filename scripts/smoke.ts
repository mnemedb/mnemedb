/**
 * Mneme end-to-end smoke test.
 *
 * Generates a fresh EOA, signs CreateProject, then uses the SDK in per-request
 * sig mode (no session) to exercise the whole stack:
 *
 *   - default tables: memories.insert, events.insert, kvs.insert
 *   - listTables    : both defaults and the custom one show up
 *   - createTable   : custom "agents" table with text + vector(1536) columns
 *   - generic CRUD  : insert into custom + list back
 *   - vector search : KNN over the custom table's embedding column
 *   - stats         : per-table counts + custom_tables = 1
 *
 *   bun scripts/smoke.ts
 *   MNEME_GATEWAY=https://... bun scripts/smoke.ts
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Mneme } from "@mneme/sdk";

const GATEWAY = process.env.MNEME_GATEWAY ?? "http://localhost:8787";
const HANDLE  = "smoke_" + Math.random().toString(36).slice(2, 10);

const pk      = generatePrivateKey();
const account = privateKeyToAccount(pk);

console.log("─ smoke test ─────────────────────────");
console.log("gateway:", GATEWAY);
console.log("wallet :", account.address);
console.log("handle :", HANDLE);
console.log("");

// ─── 1. Create the project (CreateProject typed-data sig) ─────────────────
const ts = Math.floor(Date.now() / 1000);
const signature = await account.signTypedData({
  domain: { name: "Mneme", version: "1", chainId: 8453 },
  types: {
    CreateProject: [
      { name: "handle",    type: "string"  },
      { name: "timestamp", type: "uint256" },
    ],
  },
  primaryType: "CreateProject",
  message: { handle: HANDLE, timestamp: BigInt(ts) },
});

const createRes = await fetch(`${GATEWAY}/projects`, {
  method:  "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    wallet:    account.address,
    signature,
    handle:    HANDLE,
    timestamp: ts,
  }),
});
const created = await createRes.json() as { ok?: boolean; project?: { handle: string }; error?: unknown };
if (!createRes.ok || !created.ok) {
  console.error("✗ create project failed:", createRes.status, created);
  process.exit(1);
}
console.log("✓ created project:", created.project?.handle);

// ─── 2. SDK in per-request sig mode (agents path) ─────────────────────────
const m = new Mneme({ account, gatewayUrl: GATEWAY });

const randomVec = () => Array.from({ length: 1536 }, () => Math.random() * 2 - 1);

// 2a. Exercise the default tables.
const ins = await m.memories.insert({
  text:      "the first memory of " + HANDLE,
  embedding: randomVec(),
  metadata:  { source: "smoke-test" },
});
console.log("✓ inserted", ins.inserted, "row into memories");

await m.events.insert({ kind: "smoke.test.ran", payload: { ts } });
console.log("✓ inserted 1 event");

await m.kvs.insert({ key: "last_smoke", value: { at: ts, handle: HANDLE } });
console.log("✓ upserted 1 kv");

// 2b. CREATE a custom table — this is the agent-native database part.
await m.createTable({
  name: "agents",
  columns: [
    { name: "wallet",     type: "text",   unique: true, nullable: false },
    { name: "twitter",    type: "text" },
    { name: "embedding",  type: "vector", dim: 1536 },
    { name: "metadata",   type: "jsonb" },
  ],
});
console.log("✓ created custom table: agents (wallet text unique, twitter text, embedding vector(1536), metadata jsonb)");

// 2c. Generic CRUD against the custom table.
await m.from("agents").insert({
  wallet:    "0xabcdef0000000000000000000000000000000001",
  twitter:   "alice_agent",
  embedding: randomVec(),
  metadata:  { test: true },
});
console.log("✓ inserted 1 row into agents");

const agentRows = await m.from("agents").list({ limit: 5 });
console.log("✓ listed", agentRows.rows.length, "row(s) from agents");

// 2d. Vector search on the CUSTOM table's embedding column.
const customMatches = await m.vectorSearch({
  table:     "agents",
  column:    "embedding",
  embedding: randomVec(),
  k:         3,
});
console.log("✓ vector search over agents.embedding returned", customMatches.matches.length, "match(es)");

// 2e. Vector search on a default table too (memories.embedding).
const memMatches = await m.vectorSearch({
  table:     "memories",
  column:    "embedding",
  embedding: randomVec(),
  k:         3,
});
console.log("✓ vector search over memories.embedding returned", memMatches.matches.length, "match(es)");

// 2f. listTables shows defaults + custom.
const tables = await m.listTables();
const tableSummary = tables.tables.map((t) =>
  `${t.name}(${t.rowCount}${t.isDefault ? "" : ", custom"})`,
).join(", ");
console.log("✓ listTables:", tableSummary);

// 2g. stats.
const stats = await m.stats();
console.log("✓ stats:", {
  rows:          stats.totals.rows,
  default:       stats.totals.default_tables,
  custom:        stats.totals.custom_tables,
});

console.log("");
console.log("─ PASSED ────────────────────────────");
console.log("agent wallet:", account.address);
console.log("private key :", pk, "(throwaway, do not reuse)");
console.log("handle      :", HANDLE);
