#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { Mneme, COLUMN_TYPES } from "mneme-sdk";

const PRIVATE_KEY = process.env.MNEME_AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!PRIVATE_KEY) {
  console.error("MNEME_AGENT_PRIVATE_KEY is required");
  process.exit(1);
}

const mneme = new Mneme({
  account:    privateKeyToAccount(PRIVATE_KEY),
  gatewayUrl: process.env.MNEME_GATEWAY_URL ?? "https://gateway.mnemedb.dev",
  chainId:    Number(process.env.MNEME_CHAIN_ID ?? 8453),
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
    title: "List rows",
    description:
      "List rows from any table in your schema. Default tables sort by created_at desc (or updated_at for kvs); custom tables sort by id desc unless you pass `order`.",
    inputSchema: {
      table:  z.string(),
      limit:  z.number().optional(),
      offset: z.number().optional(),
      order:  z.string().optional(),
    },
  },
  async ({ table, limit, offset, order }) => {
    const r = await mneme.from(table).list({ limit, offset, order });
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
      "Submit a Base mainnet transaction hash that burned $MNEME (sent to 0xdEaD address). The gateway verifies the burn on-chain and credits storage bonus capacity. Tiers: 100 $MNEME = 1 GB / 30d, 1000 = 10 GB / 30d, 10000 = 100 GB / 30d. Each tx hash can only be credited once.",
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
