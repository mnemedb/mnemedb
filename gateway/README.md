# mneme-gateway

Multi-tenant Bun + Hono API in front of **our** Postgres cluster. Every Mneme
project gets a dedicated schema (`agent_<handle>`) with 4 opinionated tables +
vector indexes + search RPCs, all provisioned in one transaction at project
creation. Wallet-signed (EIP-712) requests route to the caller's schema. No
Supabase anywhere — we run the database.

```
agent ─wallet-signed req─▶ mneme-gateway ─lookup project for wallet─▶ direct SQL into agent_<handle>.* ─▶ our Postgres
```

## Operator setup (one time)

1. Provision a Postgres with **pgvector** — Neon free tier is enough for MVP.
2. `cp .env.example .env` and set `DATABASE_URL`.

The control table (`_mneme_projects`) and `vector` extension are auto-created on first boot via `initDb()`.

## Run

```bash
bun install
bun run dev    # http://localhost:8787
```

## End-user onboarding (through the dashboard)

1. Connect wallet.
2. Pick a handle (`alice`).
3. Wallet signs `CreateProject` typed-data → POST `/projects`.
4. Gateway creates schema `agent_alice`, provisions 4 tables + vector indexes + `search_<table>` RPCs in one transaction.
5. SDK + MCP now route to `agent_alice.*`.

## Endpoints

| Method | Path                  | Auth        | What it does                                          |
|--------|-----------------------|-------------|-------------------------------------------------------|
| GET    | `/health`             | —           | Liveness probe                                        |
| POST   | `/projects`           | wallet sig  | Create your project (CreateProject typed-data)        |
| GET    | `/v1/projects/me`     | wallet sig  | Your project info                                     |
| GET    | `/v1/tables`          | wallet sig  | List the 4 built-in tables                            |
| POST   | `/v1/rows/:table`     | wallet sig  | Insert row(s) into your schema                        |
| GET    | `/v1/rows/:table`     | wallet sig  | List rows from your schema                            |
| POST   | `/v1/vector/search`   | wallet sig  | KNN over `memories` / `documents` (your schema)       |
| GET    | `/v1/stats`           | wallet sig  | Per-table row counts (your schema)                    |

## Auth headers (every `/v1/*` request)

| Header                | Example                                          |
|-----------------------|--------------------------------------------------|
| `X-Mneme-Wallet`      | `0xabc…`                                         |
| `X-Mneme-Timestamp`   | unix seconds                                     |
| `X-Mneme-Nonce`       | random string, single-use within window          |
| `Authorization`       | `Mneme 0x<EIP-712 signature>`                    |

Signed payload (`MnemeRequest` typed-data):
```ts
{ method, path, bodyHash: keccak256(utf8(body)), timestamp, nonce }
// domain: { name: "Mneme", version: "1", chainId: 8453 }
```

## Notes

- **We run the Postgres.** Users never connect to it directly — they get a handle, an SDK, an MCP server, and a dashboard.
- **Schema-per-project** gives logical isolation. Good to ~thousands of projects on one Postgres; beyond that, shard or move to per-tenant DBs.
- **No runtime DDL.** Schema is fixed at project creation. Adding tables = SQL migration in `provisionTables()` + `ALLOWED_TABLES` in `src/db.ts`.
- **In-memory caches.** Project cache + nonce cache — swap for Redis when going horizontal.
- **Backups, availability, scale** are now our problem (the price for owning the platform vs reselling Supabase).
