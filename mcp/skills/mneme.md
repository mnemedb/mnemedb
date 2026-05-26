---
name: mneme
description: Use this skill when the user wants persistent data — a database, file storage, vector search, or wallet-bound state — for an app they're building on Base. Mneme is a real Postgres schema per wallet, exposed through 11 MCP tools. No setup, no API keys, no SQL required.
argumentHint: [what to build]
allowedTools:
  - mneme_create_table
  - mneme_list_tables
  - mneme_insert
  - mneme_list
  - mneme_update
  - mneme_delete
  - mneme_delete_where
  - mneme_vector_search
  - mneme_storage_upload
  - mneme_storage_list
  - mneme_storage_delete
  - mneme_storage_url
  - mneme_storage_quota
  - mneme_storage_burn
---

# Mneme — agent-native database + storage on Base

You have access to Mneme, a wallet-authenticated Postgres + R2 storage layer running on Base mainnet. Each wallet gets:

- An isolated Postgres schema with **4 default tables** (`memories`, `documents`, `events`, `kvs`)
- **Runtime DDL** — create any table you need at any time via `mneme_create_table` (columns: `text`, `int`, `bigint`, `bool`, `jsonb`, `timestamptz`, `vector`, `numeric`, `uuid`, `date`)
- **Generic CRUD** with WHERE filters — insert, list, update, delete via `mneme_insert` / `mneme_list` / `mneme_update` / `mneme_delete` / `mneme_delete_where`
- **Vector search** built-in via `mneme_vector_search` (pgvector KNN over any `vector(N)` column on any table)
- **Wallet-bound file storage** with 100 MB free tier (extend via $MNEME burn) — `mneme_storage_upload`, `mneme_storage_list`, `mneme_storage_delete`, `mneme_storage_url`, `mneme_storage_quota`, `mneme_storage_burn`

## When to use Mneme

- The user is building an app on Base that needs persistent storage
- The user mentions "save", "remember", "store", "database", "file upload", "search", "user data", "history", "settings", or any kind of state that must outlast a single request
- The user is using OpenClaude, Gitlawb Playground, or any agent-builder ecosystem where they want a backend without writing SQL or managing infrastructure
- The user wants vector search / semantic memory for their agent

## When NOT to use Mneme

- The data is purely in-memory for the current task (use local variables)
- The user explicitly chose a different backend (Supabase, Postgres they manage, etc.)
- The data lives on another chain (Mneme is Base-only at the moment)

## Quick patterns

### Create a table for app state

```
mneme_create_table({
  name: "todos",
  columns: [
    { name: "title", type: "text", nullable: false },
    { name: "done",  type: "bool" },
    { name: "user_wallet", type: "text" }
  ]
})
```

`id bigserial PRIMARY KEY` and `created_at timestamptz DEFAULT now()` are added automatically.

### Filtered list

```
mneme_list({
  table: "todos",
  where: ["done.eq.false", "user_wallet.eq.0xabc..."],
  order: "created_at.desc",
  limit: 20
})
```

Ops: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`, `is`.

### Update + delete

```
mneme_update({ table: "todos", id: 42, updates: { done: true } })
mneme_delete({ table: "todos", id: 42 })
mneme_delete_where({ table: "todos", where: ["done.eq.true"] })   // bulk
```

### Vector search

```
mneme_vector_search({
  table:     "memories",
  column:    "embedding",
  embedding: [/* 1536-dim float array */],
  k:         5
})
```

### File upload (public)

```
mneme_storage_upload({
  key:            "avatars/alice.png",
  content_base64: "<base64 of file bytes>",
  visibility:     "public",
  content_type:   "image/png"
})
// → returns: { public_url: "https://cdn.mnemedb.dev/<handle>/public/avatars/alice.png" }
```

### Quota check + extend via burn

```
mneme_storage_quota()
// → 100 MB free per wallet; extend by burning $MNEME:
//   100k $MNEME → 1 GB / 30d
//   1M  $MNEME → 10 GB / 30d
//   10M $MNEME → 100 GB / 30d

mneme_storage_burn({ tx_hash: "0x..." })   // submit a Base mainnet tx that sent $MNEME to 0xdEaD
```

## Always remember

- Vector columns: pass JS number arrays. The SDK converts them to pgvector literals; you don't write `[1,2,3]` strings.
- Default tables (`memories`, `documents`, `events`, `kvs`) are always present — use them for casual state before creating custom tables.
- Storage paths: public files are served at `cdn.mnemedb.dev/<handle>/public/<key>`. Private files require `mneme_storage_url` for a presigned, time-limited URL.
- Rate limits: free tier = 120 req/min per wallet. Bonus tier (after burning $MNEME for storage) = 1200 req/min.
- The wallet IS the auth. No API keys exist.

For full SDK reference: https://www.npmjs.com/package/mneme-sdk
For the gateway docs: https://mnemedb.dev
