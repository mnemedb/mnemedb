# Agents: how to use Mneme

You're an AI agent (or you're building one) and want Mneme as your persistent
data layer. This file is the minimum you need.

---

## What Mneme gives you

A dedicated Postgres schema on Base, accessible by your **wallet** instead of
an API key. You can:

- Read/write from four built-in tables (`memories`, `documents`, `events`, `kvs`)
- **Create your own tables** at runtime (`text`, `int`, `bigint`, `bool`, `jsonb`, `timestamptz`, `vector(N)`, `numeric`, `uuid`, `date`)
- Run KNN vector search over any `vector(N)` column on any table
- Do all of this via SDK, MCP server (Claude / Cursor / Cline), or raw HTTP

You don't manage Postgres, you don't see infrastructure, you don't store API
keys. The whole stack is one wallet signature away.

---

## Option A — MCP (recommended for agents inside Claude / Cursor / Cline)

```bash
npm i -g mneme-mcp
```

Add to your MCP config (`~/Library/Application Support/Claude/claude_desktop_config.json` or your client's equivalent):

```json
{
  "mcpServers": {
    "mneme": {
      "command": "mneme-mcp",
      "env": {
        "MNEME_AGENT_PRIVATE_KEY": "0x<agent-eoa-private-key>",
        "MNEME_GATEWAY_URL":        "https://gateway.mnemedb.dev"
      }
    }
  }
}
```

Restart your MCP client. You now have five tools:

| Tool                  | What it does                                                  |
|-----------------------|---------------------------------------------------------------|
| `mneme_list_tables`   | List every table in your schema (defaults + custom)           |
| `mneme_create_table`  | Create a new table — `{ name, columns: [{name, type, …}] }`   |
| `mneme_insert`        | Insert one row or an array into any table                     |
| `mneme_list`          | List rows from any table (id desc by default)                 |
| `mneme_vector_search` | KNN over a `vector(N)` column — `{ table, column, embedding, k }` |

### First-time setup for the agent's wallet

The MCP server signs each request with a **private key** (EOA). You need:

1. An EOA private key (any standard wallet). Generate with `viem`:
   ```ts
   import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
   const pk = generatePrivateKey();
   console.log(pk, privateKeyToAccount(pk).address);
   ```
2. A Mneme project for that wallet — visit https://mnemedb.dev, connect with
   that wallet, pick a handle, sign once. Schema is provisioned in one
   transaction.

> Your dashboard wallet (e.g. a Coinbase Smart Wallet) probably doesn't expose
> a private key. That's why the **agent** needs its own EOA, separate from the
> human owner. Phase 2 ships "agent keys" to link one project to many wallets.

---

## Option B — TypeScript SDK (recommended for agents you write the code for)

```bash
npm i mneme-sdk viem
```

```ts
import { privateKeyToAccount } from "viem/accounts";
import { Mneme } from "mneme-sdk";

const m = new Mneme({
  account:    privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`),
  gatewayUrl: "https://gateway.mnemedb.dev",
});

// ── Defaults available immediately ──────────────────────────────────────
await m.memories.insert({
  text:      "user prefers dark mode",
  embedding: [/* 1536-dim vector */],
  metadata:  { source: "preferences" },
});

const { rows } = await m.memories.list({ limit: 20 });

// ── Create your own table ───────────────────────────────────────────────
await m.createTable({
  name: "tweets",
  columns: [
    { name: "author",    type: "text",  nullable: false },
    { name: "content",   type: "text" },
    { name: "likes",     type: "int" },
    { name: "posted_at", type: "timestamptz" },
    { name: "embedding", type: "vector", dim: 1536 },
  ],
});

await m.from("tweets").insert({
  author:    "alice",
  content:   "gm",
  likes:     42,
  posted_at: new Date().toISOString(),
  embedding: [/* 1536-dim */],
});

// ── Vector search over any vector column on any table ──────────────────
const { matches } = await m.vectorSearch({
  table:     "tweets",
  column:    "embedding",
  embedding: queryVec,
  k:         5,
});
```

---

## Option C — Raw HTTP (any language / framework)

Every request signs an EIP-712 typed-data message. Headers:

```
X-Mneme-Wallet:    0x<your-wallet>
X-Mneme-Timestamp: <unix seconds>
X-Mneme-Nonce:     <16 random bytes hex>
Authorization:     Mneme 0x<signature>
```

Signed payload (`MnemeRequest`):
```ts
{
  method:    "POST",
  path:      "/v1/rows/tweets",     // include query string for GETs
  bodyHash:  keccak256(utf8(body)),
  timestamp: <unix seconds>,
  nonce:     <same as header>,
}
// domain: { name: "Mneme", version: "1", chainId: 8453 }
```

Endpoints:

| Method | Path                  | Body                                          |
|--------|-----------------------|-----------------------------------------------|
| POST   | `/projects`           | `{ wallet, signature, handle, timestamp }` — public, creates project |
| POST   | `/sessions`           | `MnemeSession`-signed body → returns JWT for 24h |
| GET    | `/v1/projects/me`     | —                                             |
| GET    | `/v1/tables`          | —                                             |
| POST   | `/v1/tables`          | `{ name, columns }`                           |
| POST   | `/v1/rows/:table`     | row object or array                           |
| GET    | `/v1/rows/:table`     | `?limit=&offset=&order=`                      |
| POST   | `/v1/vector/search`   | `{ table, column, embedding, k }`             |
| GET    | `/v1/stats`           | —                                             |

Sessions: instead of per-request sig, POST `/sessions` once → get a Bearer
JWT valid 24h → use `Authorization: Bearer <jwt>` on subsequent calls.
Recommended for dashboards / long-lived apps, not for one-shot agents.

---

## Column types supported by `createTable`

| Type           | Use for                                  |
|----------------|------------------------------------------|
| `text`         | Strings, large or small                  |
| `int`          | 32-bit integer                           |
| `bigint`       | 64-bit integer                           |
| `bool`         | true / false                             |
| `jsonb`        | Arbitrary structured data                |
| `timestamptz`  | Timestamps with timezone                 |
| `vector`       | pgvector embedding — requires `dim` (1–4096) |
| `numeric`      | Arbitrary-precision decimal              |
| `uuid`         | UUIDs                                    |
| `date`         | Date without time                        |

Column flags: `nullable` (default true), `unique`, `primaryKey` (at most one).
Auto-added: `id bigserial PRIMARY KEY` (unless user marks a column primaryKey),
and `created_at timestamptz DEFAULT now()` (unless user defined `created_at`).
Max **64 columns per table**.

---

## What's NOT yet (Phase 2)

- DROP TABLE / ALTER TABLE — schema changes after create
- Foreign keys + JOIN-style queries
- Custom indexes beyond auto-created ones
- Agent-key delegation (one project → many agent wallets)
- $MNEME token metering (currently free; Day-1 launch with public MVP)

---

## Status

Live MVP — gateway at `https://gateway.mnemedb.dev`, dashboard at
`https://mnemedb.dev`. Smoke test (`scripts/smoke.ts`) passes end-to-end against
production. See [`README.md`](./README.md) for the platform-level overview and
[`DEPLOY.md`](./DEPLOY.md) for self-host instructions.

Questions, ideas, integration requests: open an issue at
https://github.com/mnemedb/mnemedb/issues.
