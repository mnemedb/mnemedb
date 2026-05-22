# Mneme

[![mneme-sdk](https://img.shields.io/npm/v/mneme-sdk?label=mneme-sdk&color=d4af37&style=flat-square)](https://www.npmjs.com/package/mneme-sdk)
[![mneme-mcp](https://img.shields.io/npm/v/mneme-mcp?label=mneme-mcp&color=d4af37&style=flat-square)](https://www.npmjs.com/package/mneme-mcp)
[![gateway](https://img.shields.io/website?url=https%3A%2F%2Fgateway.mnemedb.dev%2Fhealth&label=gateway&up_message=live&up_color=22c55e&down_message=down&down_color=ef4444&style=flat-square)](https://gateway.mnemedb.dev/health)
[![license](https://img.shields.io/badge/license-MIT-3b82f6?style=flat-square)](LICENSE)
[![built on Base](https://img.shields.io/badge/built%20on-Base-0052ff?style=flat-square)](https://base.org)

> **The agent-native database platform on Base.**
> Real Postgres. Real schemas. Wallet-auth. MCP-native. Memory in gold.

🟢 Live MVP — try it at **[mnemedb.dev](https://mnemedb.dev)** or smoke-test the
gateway: [`gateway.mnemedb.dev/health`](https://gateway.mnemedb.dev/health).

Mneme is a managed multi-tenant Postgres platform built for AI agents. Each
agent gets a dedicated schema with four memory tables ready to go, then can
create as many custom tables as it needs at runtime — text, int, jsonb,
vector, uuid, anything Postgres + pgvector supports. No API keys, no DB
credentials, no infrastructure: agents authenticate with their wallet, and
everything is one SDK call (or one MCP tool call) away.

```
agent ─wallet-signed req─▶ mneme-gateway ─lookup project─▶ agent_<handle>.* on OUR Postgres
```

## Why "database" and not "memory service"

Mem0 / Pinecone / Letta give you a fixed memory store. Mneme gives you a
**Postgres schema you control**: create tables, drop tables, run vector
searches over any column, all over the same wallet identity. The four
default tables are a head start, not a ceiling.

| Feature | Mneme | Mem0 / Pinecone |
|---|---|---|
| Custom tables at runtime | ✅ via `mneme.createTable(…)` | ❌ |
| Vector search on any column | ✅ | partial |
| jsonb / text / int / uuid / date | ✅ | ❌ |
| Per-wallet schema isolation | ✅ | per-API-key |
| Wallet auth (no API keys) | ✅ | ❌ |
| MCP server for agents | ✅ | growing |
| Onchain identity (Phase 2) | ✅ | ❌ |

## What we built

- **Our Postgres cluster** (Neon for MVP). Every Mneme project = one schema, fully isolated.
- **Wallet auth.** EIP-712 typed-data on every request (or 24-hour session JWT). Smart wallets (Coinbase Smart Wallet, Safe) via ERC-1271/6492.
- **Default tables.** `memories`, `documents`, `events`, `kvs` provisioned at project create.
- **Runtime DDL.** `POST /v1/tables` to create any table; columns: text/int/bigint/bool/jsonb/timestamptz/vector/numeric/uuid/date.
- **Generic vector search.** KNN over any `vector(N)` column on any table.
- **MCP server.** Five tools — `mneme_create_table`, `mneme_list_tables`, `mneme_insert`, `mneme_list`, `mneme_vector_search` — for Claude / Cursor / Cline.
- **Dashboard.** Connect wallet, pick handle, see your schema + tables + stats + MCP config.

## Monorepo

| Workspace | Description |
|---|---|
| `contracts/` | Foundry — `AgentRegistry` (Phase 2 onchain handle layer) |
| `gateway/`   | Bun + Hono — direct Postgres, schema-per-project, runtime DDL, wallet auth |
| `sdk/`       | `mneme-sdk` — `m.createTable`, `m.from(table).insert / list`, `m.vectorSearch`, … |
| `mcp/`       | `mneme-mcp` — Claude/Cursor MCP tools |
| `dashboard/` | Vite + React + TS + Tailwind + wagmi — pick handle, see tables, MCP config |
| `scripts/smoke.ts` | End-to-end smoke test (create project, custom table, insert, list, vector search) |

## Quickstart (agent code)

```ts
import { privateKeyToAccount } from "viem/accounts";
import { Mneme } from "mneme-sdk";

const m = new Mneme({
  account:    privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`),
  gatewayUrl: "https://gateway.mnemedb.dev",
});

// Use the defaults
await m.memories.insert({ text: "hello", embedding: vec });

// Or create your own tables
await m.createTable({
  name: "users",
  columns: [
    { name: "wallet",    type: "text", unique: true, nullable: false },
    { name: "twitter",   type: "text" },
    { name: "embedding", type: "vector", dim: 1536 },
  ],
});
await m.from("users").insert({ wallet: "0xabc…", twitter: "alice", embedding: vec });

// Vector search across any vector column
const { matches } = await m.vectorSearch({
  table: "users", column: "embedding", embedding: query, k: 5,
});
```

## User flow

1. Visit dashboard → connect wallet (Coinbase Smart Wallet, MetaMask, …).
2. Pick a handle (`alice`).
3. Wallet signs `CreateProject` → schema `agent_alice` + 4 default tables provisioned in one transaction.
4. SDK / MCP / dashboard all work against `agent_alice` immediately.
5. Agents call `mneme.createTable(…)` as they need new shapes.

## Operator setup (one time)

1. Postgres with pgvector — Neon free tier works for MVP.
2. `gateway/.env`: `DATABASE_URL`, `GATEWAY_JWT_SECRET` (32-byte hex).
3. Deploy gateway (Fly / Railway / Render). Deploy dashboard (Vercel).

## Token

**$MNEME** — Day-1 launch with public MVP, Clanker / Flaunch on Base.
Utility: gateway query metering + stake-for-discount + (Phase 2) onchain
permissions registry stake.

## Status

Pre-MVP. Stealth. Smoke test passes end-to-end (project create → custom
table → insert → list → vector search → stats).
