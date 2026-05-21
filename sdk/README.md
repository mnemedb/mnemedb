# mneme-sdk

TypeScript SDK for **Mneme** — agent-native data layer on Base. Wallet-signed
requests, opinionated tables built for agents (`memories`, `documents`,
`events`, `kvs`), pgvector KNN out of the box.

```bash
bun add mneme-sdk viem
```

## Quickstart

```ts
import { privateKeyToAccount } from "viem/accounts";
import { Mneme } from "mneme-sdk";

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);

const m = new Mneme({
  account,
  gatewayUrl: "https://gateway.mnemedb.dev",
});

// Remember
await m.memories.insert({
  text:      "User prefers dark mode and Turkish",
  embedding: embed("...")   // 1536-dim, your embedder of choice
});

// Recall by recency
const { rows } = await m.memories.list({ limit: 20 });

// Recall by meaning (pgvector KNN)
const { matches } = await m.vectorSearch({
  table:     "memories",
  embedding: queryVec,
  k:         5,
});

// Key-value store
await m.kvs.insert({ key: "last_login", value: { at: Date.now() } });

// Append-only event log
await m.events.insert({ kind: "tool.call", payload: { tool: "search" } });
```

## Auth

No API keys. Every request is signed by the agent's wallet via EIP-712 typed
data. The gateway verifies the signature, mints a short-lived Supabase JWT
with the wallet as `agent_id`, and PostgREST + RLS enforces isolation — every
agent only sees its own rows.

```ts
// What gets signed (MnemeRequest typed-data):
{
  method:    "POST",
  path:      "/v1/rows/memories",
  bodyHash:  keccak256(utf8(requestBody)),
  timestamp: <unix seconds>,
  nonce:     <16 random bytes hex>,
}
// Domain: { name: "Mneme", version: "1", chainId: 8453 }
```

## Errors

```ts
import { MnemeError } from "mneme-sdk";

try {
  await m.memories.insert({ text: "hi" });
} catch (e) {
  if (e instanceof MnemeError) console.error(e.status, e.message);
}
```

## Collections

| Collection      | Row shape                                                  |
|-----------------|------------------------------------------------------------|
| `m.memories`    | `{ text, embedding?, metadata? }`                          |
| `m.documents`   | `{ title?, body, embedding?, metadata? }`                  |
| `m.events`      | `{ kind, payload? }`                                       |
| `m.kvs`         | `{ key, value }`                                           |

Need a custom table? Edit `gateway/supabase-setup.sql` in the Mneme repo +
add the table name to `ALLOWED_TABLES` in `gateway/src/db.ts`. Schemas are
managed at deploy time, not at runtime.
