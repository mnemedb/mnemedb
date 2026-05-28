#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { Mneme, COLUMN_TYPES } from "mneme-sdk";

// Two auth modes — pick whichever the user provides:
//   MNEME_API_KEY            — service-account key (mneme_sk_…) from the dashboard
//   MNEME_AGENT_PRIVATE_KEY  — raw wallet private key (legacy / power-user)
//
// API key path is preferred — easier to get (just paste from dashboard),
// easier to revoke, safer (no wallet exposure in your shell history).
const API_KEY     = process.env.MNEME_API_KEY;
const PRIVATE_KEY = process.env.MNEME_AGENT_PRIVATE_KEY as `0x${string}` | undefined;

if (!API_KEY && !PRIVATE_KEY) {
  console.error("Either MNEME_API_KEY (preferred) or MNEME_AGENT_PRIVATE_KEY is required");
  console.error("Get an API key at https://mnemedb.dev → API keys → Create with scope '*'");
  process.exit(1);
}

const gatewayUrl = process.env.MNEME_GATEWAY_URL ?? "https://gateway.mnemedb.dev";

const mneme = API_KEY
  ? new Mneme({ apiKey: API_KEY, gatewayUrl })
  : new Mneme({
      account: privateKeyToAccount(PRIVATE_KEY!),
      gatewayUrl,
      chainId: Number(process.env.MNEME_CHAIN_ID ?? 8453),
    });

const ColumnSchema = z.object({
  name:       z.string(),
  type:       z.enum(COLUMN_TYPES),
  dim:        z.number().optional(),
  nullable:   z.boolean().optional(),
  unique:     z.boolean().optional(),
  primaryKey: z.boolean().optional(),
});

const server = new McpServer({ name: "mneme", version: "0.1.0" });

// ─── DDL ───────────────────────────────────────────────────────────────────
server.registerTool(
  "mneme_create_table",
  {
    title: "Create table",
    description:
      "Create a new table in your agent's Postgres schema. Use type 'vector' with 'dim' for embedding columns. An 'id bigserial PRIMARY KEY' and 'created_at timestamptz DEFAULT now()' are added automatically unless you define your own.",
    inputSchema: {
      name:    z.string(),
      columns: z.array(ColumnSchema),
    },
  },
  async ({ name, columns }) => {
    const r = await mneme.createTable({ name, columns });
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.registerTool(
  "mneme_list_tables",
  {
    title: "List tables",
    description:
      "List every table in your agent's schema, with column info and row counts. Returns both default tables (memories/documents/events/kvs) and any tables you've created.",
    inputSchema: {},
  },
  async () => {
    const r = await mneme.listTables();
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

// ─── CRUD ──────────────────────────────────────────────────────────────────
server.registerTool(
  "mneme_insert",
  {
    title: "Insert rows",
    description:
      "Insert one row or an array of rows into any table in your schema. Vector columns accept JS number arrays (auto-coerced to pgvector literal).",
    inputSchema: {
      table: z.string(),
      rows:  z.union([z.record(z.unknown()), z.array(z.record(z.unknown()))]),
    },
  },
  async ({ table, rows }) => {
    const r = await mneme.from(table).insert(rows as Record<string, unknown> | Record<string, unknown>[]);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.registerTool(
  "mneme_list",
  {
    title: "List rows (with WHERE filter)",
    description:
      "List rows from any table. Supports PostgREST-style filters: pass `where` as an array of `col.op.value` strings. Ops: eq, neq, gt, gte, lt, lte, like, ilike, in, is. " +
      "Example: where=[\"done.eq.false\", \"score.gt.10\"]. Order syntax: \"created_at.desc\". " +
      "Default tables sort by created_at desc (updated_at for kvs); custom tables sort by id desc unless `order` is passed.",
    inputSchema: {
      table:  z.string(),
      limit:  z.number().optional(),
      offset: z.number().optional(),
      order:  z.string().optional(),
      where:  z.array(z.string()).optional(),
    },
  },
  async ({ table, limit, offset, order, where }) => {
    const r = await mneme.from(table).list({ limit, offset, order, where });
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.registerTool(
  "mneme_update",
  {
    title: "Update a row by id",
    description:
      "Update a single row by its id. Pass `table`, `id`, and `updates` (an object mapping column names to new values). Vector columns accept JS number arrays.",
    inputSchema: {
      table:   z.string(),
      id:      z.union([z.string(), z.number()]),
      updates: z.record(z.unknown()),
    },
  },
  async ({ table, id, updates }) => {
    const r = await mneme.from(table).update(id, updates as Record<string, unknown>);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.registerTool(
  "mneme_delete",
  {
    title: "Delete a row by id",
    description:
      "Delete a single row by its id. Pass `table` and `id`. Returns confirmation with the deleted id.",
    inputSchema: {
      table: z.string(),
      id:    z.union([z.string(), z.number()]),
    },
  },
  async ({ table, id }) => {
    const r = await mneme.from(table).delete(id);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.registerTool(
  "mneme_delete_where",
  {
    title: "Bulk delete rows by filter",
    description:
      "Bulk delete rows matching a filter. REQUIRED: pass `where` as an array of `col.op.value` strings (refuses to delete an entire table without filter). Ops: eq, neq, gt, gte, lt, lte, like, ilike, in, is.",
    inputSchema: {
      table: z.string(),
      where: z.array(z.string()),
    },
  },
  async ({ table, where }) => {
    const r = await mneme.from(table).deleteWhere(where);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

// ─── Raw SQL (power-user escape hatch) ────────────────────────────────────
server.registerTool(
  "mneme_sql",
  {
    title: "Run raw SQL against your project schema",
    description:
      "Execute arbitrary SQL (SELECT / INSERT / UPDATE / DELETE / DDL) against your project's Postgres schema. Single statement only. Server enforces: 5s statement timeout, search_path pinned to your schema (so unqualified table refs resolve to YOUR schema only), cross-tenant references blocked, 1000-row result cap. Use this when the typed CRUD tools (mneme_insert/list/update/delete) aren't expressive enough — JOINs, aggregates, GROUP BY, complex WHERE, CTEs, etc.",
    inputSchema: {
      query: z.string(),
    },
  },
  async ({ query }) => {
    const r = await mneme.sql(query);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

// ─── Vector ────────────────────────────────────────────────────────────────
server.registerTool(
  "mneme_vector_search",
  {
    title: "Vector similarity search",
    description:
      "KNN search via pgvector over any vector column on any table. Provide table, the vector column name, your query embedding, and k (default 10).",
    inputSchema: {
      table:     z.string(),
      column:    z.string(),
      embedding: z.array(z.number()),
      k:         z.number().optional(),
    },
  },
  async (args) => {
    const r = await mneme.vectorSearch(args);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

// ─── Storage (R2 + $MNEME burn) ───────────────────────────────────────────
server.registerTool(
  "mneme_storage_upload",
  {
    title: "Upload a file to wallet-bound storage",
    description:
      "Upload a file to Mneme storage (Cloudflare R2 backend). Pass content as a base64 string. Visibility 'public' makes the file readable at cdn.mnemedb.dev/<handle>/public/<key>; 'private' requires a presigned URL via mneme_storage_url. 100 MB free tier per wallet; burn $MNEME to extend.",
    inputSchema: {
      key:            z.string(),
      content_base64: z.string(),
      visibility:     z.enum(["public", "private"]).optional(),
      content_type:   z.string().optional(),
    },
  },
  async ({ key, content_base64, visibility, content_type }) => {
    const bytes = Buffer.from(content_base64, "base64");
    const r = await mneme.storage.upload({
      key,
      file:        bytes,
      visibility,
      contentType: content_type,
    });
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.registerTool(
  "mneme_storage_list",
  {
    title: "List files in wallet-bound storage",
    description: "List storage objects for this wallet. Default visibility = private. Pass prefix to filter.",
    inputSchema: {
      visibility: z.enum(["public", "private"]).optional(),
      prefix:     z.string().optional(),
    },
  },
  async (args) => {
    const r = await mneme.storage.list(args);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.registerTool(
  "mneme_storage_delete",
  {
    title: "Delete a file from wallet-bound storage",
    description: "Delete a storage object. Visibility defaults to private. Returns freed bytes.",
    inputSchema: {
      key:        z.string(),
      visibility: z.enum(["public", "private"]).optional(),
    },
  },
  async (args) => {
    const r = await mneme.storage.delete(args);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.registerTool(
  "mneme_storage_url",
  {
    title: "Get a presigned URL for a stored file",
    description:
      "Returns a time-limited HTTPS URL for a stored file. Required for 'private' visibility. For 'public' visibility, prefer the direct cdn.mnemedb.dev URL returned from upload.",
    inputSchema: {
      key:        z.string(),
      visibility: z.enum(["public", "private"]).optional(),
      expiresIn:  z.number().optional(),
    },
  },
  async (args) => {
    const r = await mneme.storage.url(args);
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.registerTool(
  "mneme_storage_quota",
  {
    title: "Get current storage quota",
    description:
      "Returns bytes_used, bytes_limit, bytes_available, and the bonus_expires_at if a $MNEME burn is currently active. Free tier is 100 MB per wallet, forever. Bonus capacity is unlocked by burning $MNEME (see mneme_storage_burn).",
    inputSchema: {},
  },
  async () => {
    const r = await mneme.storage.quota();
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

server.registerTool(
  "mneme_storage_burn",
  {
    title: "Credit a $MNEME burn transaction to extend storage quota",
    description:
      "Submit a Base mainnet transaction hash that burned $MNEME (sent to 0xdEaD address). The gateway verifies the burn on-chain and credits storage bonus capacity. Tiers: 100,000 $MNEME = 1 GB / 30d, 1,000,000 = 10 GB / 30d, 10,000,000 = 100 GB / 30d. Each tx hash can only be credited once.",
    inputSchema: {
      tx_hash: z.string(),
    },
  },
  async ({ tx_hash }) => {
    const r = await mneme.storage.burn({ tx_hash });
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
