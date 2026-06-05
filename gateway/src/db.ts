import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

export const sql = postgres(DATABASE_URL, {
  max:          10,
  idle_timeout: 30,
});

// ─── Default tables auto-provisioned at project create ───────────────────────
// Sane defaults so a zero-config user immediately has somewhere to write
// memories / documents / events / kv pairs. Agents are free to create as many
// additional tables as they want via POST /v1/tables.
export const DEFAULT_TABLES = ["memories", "documents", "events", "kvs", "entities", "relations"] as const;
export type DefaultTable = (typeof DEFAULT_TABLES)[number];

const HANDLE_RX = /^[a-z0-9_]{3,32}$/;
const SCHEMA_RX = /^agent_[a-z0-9_]{3,32}$/;
const IDENT_RX  = /^[a-z_][a-z0-9_]*$/;

export const VALID_COLUMN_TYPES = [
  "text", "int", "bigint", "bool", "jsonb", "timestamptz",
  "vector", "numeric", "uuid", "date",
] as const;
export type ColumnType = (typeof VALID_COLUMN_TYPES)[number];

const VALID_TYPE_SET: ReadonlySet<string> = new Set(VALID_COLUMN_TYPES);

export interface ColumnDef {
  name:        string;
  type:        ColumnType;
  /** Required when `type === "vector"`. 1–4096. */
  dim?:        number;
  nullable?:   boolean;   // default true
  unique?:     boolean;   // default false
  primaryKey?: boolean;   // at most one across the table
}

export interface ColumnInfo {
  name:     string;
  type:     string;       // pg udt name: 'text', 'jsonb', 'vector', ...
  nullable: boolean;
}

export interface TableInfo {
  name:       string;
  isDefault:  boolean;
  rowCount:   number;
  columns:    ColumnInfo[];
}

export function isValidTableName(t: string): boolean {
  return IDENT_RX.test(t) && t.length <= 63;
}
export function isValidColumnName(c: string): boolean {
  return IDENT_RX.test(c) && c.length <= 63;
}
export function isValidSchemaName(s: string): boolean {
  return SCHEMA_RX.test(s);
}

/** Default ORDER BY column for default tables (kvs has no `created_at`). */
export function defaultOrderColumn(table: string): string {
  return table === "kvs" ? "updated_at" : "created_at";
}

export interface Project {
  id:           number;
  owner_wallet: string;
  handle:       string;
  schema_name:  string;
}

const cacheByWallet = new Map<string, Project>();
const cacheByHandle = new Map<string, Project>();

// ─── Boot-time bootstrap: extension + control table. Idempotent. ─────────────
export async function initDb() {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
    CREATE TABLE IF NOT EXISTS _mneme_projects (
      id            bigserial primary key,
      owner_wallet  text unique not null,
      handle        text unique not null,
      schema_name   text unique not null,
      created_at    timestamptz default now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS _mneme_projects_handle_idx ON _mneme_projects (handle)`;

  // ─── Storage quotas ─────────────────────────────────────────────────────
  // One row per wallet. `bytes_used` is maintained by storage routes on
  // upload/delete (best-effort — periodic reconcile can true it up).
  // `bonus_bytes` and `bonus_expires_at` come from $MNEME burns.
  await sql`
    CREATE TABLE IF NOT EXISTS _mneme_storage_quotas (
      wallet            text primary key,
      bytes_used        bigint not null default 0,
      bonus_bytes       bigint not null default 0,
      bonus_expires_at  timestamptz,
      updated_at        timestamptz default now()
    )
  `;
  // Idempotent ledger of every burn we've credited (don't double-credit
  // the same tx hash). Stores the user-submitted tx_hash for audit.
  await sql`
    CREATE TABLE IF NOT EXISTS _mneme_storage_burns (
      tx_hash       text primary key,
      wallet        text not null,
      amount_raw    text not null,
      bytes_added   bigint not null,
      days_added    int not null,
      created_at    timestamptz default now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS _mneme_storage_burns_wallet_idx ON _mneme_storage_burns (wallet)`;

  // ─── Service-account API keys (Option C for Gitlawb-style integrators) ──
  // The "owner" wallet (the master tenant — e.g. Gitlawb) mints keys to
  // distribute to apps. Each key is scoped to a sub-namespace (table-name
  // prefix) inside the owner's schema. Apps authenticate with the key
  // header instead of a wallet signature.
  //
  // We store SHA-256 hashes, never the raw key. Keys are revocable.
  await sql`
    CREATE TABLE IF NOT EXISTS _mneme_api_keys (
      id            bigserial primary key,
      key_hash      text unique not null,
      key_prefix    text not null,             -- first 12 chars (display only)
      owner_wallet  text not null,             -- master tenant wallet
      scope         text not null,             -- table-name prefix this key may touch (e.g. "app_xyz123")
      label         text,                      -- human-friendly description
      rpm_limit     int not null default 1200, -- per-key rate limit
      revoked_at    timestamptz,
      last_used_at  timestamptz,
      created_at    timestamptz default now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS _mneme_api_keys_owner_idx ON _mneme_api_keys (owner_wallet) WHERE revoked_at IS NULL`;
  await sql`CREATE INDEX IF NOT EXISTS _mneme_api_keys_hash_idx  ON _mneme_api_keys (key_hash) WHERE revoked_at IS NULL`;

  // ─── Chain streams (Mneme Live) ─────────────────────────────────────────
  // Live Base events → user schemas. Each row is a subscription: when the
  // worker sees a matching event onchain it INSERTs a row into the
  // project's <target_table>. Lets agents query the chain like a local DB.
  await sql`
    CREATE TABLE IF NOT EXISTS _mneme_streams (
      id              bigserial PRIMARY KEY,
      project_id      bigint NOT NULL REFERENCES _mneme_projects(id) ON DELETE CASCADE,
      contract        text   NOT NULL,            -- lowercased 0x...
      topic0          text   NOT NULL,            -- keccak256 of event signature
      event_signature text   NOT NULL,            -- "Transfer(address,address,uint256)"
      event_name      text   NOT NULL,            -- "Transfer"
      abi_inputs      jsonb  NOT NULL,            -- [{name,type,indexed}]
      target_table    text   NOT NULL,            -- user-schema table name
      last_block      bigint NOT NULL DEFAULT 0,
      active          boolean NOT NULL DEFAULT true,
      label           text,
      created_at      timestamptz DEFAULT now(),
      UNIQUE (project_id, contract, topic0, target_table)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS _mneme_streams_active_idx ON _mneme_streams (active, contract) WHERE active = true`;

  // Single-row cursor per chain — the highest block the poller has scanned.
  await sql`
    CREATE TABLE IF NOT EXISTS _mneme_chain_cursor (
      chain_id    bigint PRIMARY KEY,
      last_block  bigint NOT NULL DEFAULT 0,
      updated_at  timestamptz DEFAULT now()
    )
  `;
}

// ─── API key helpers ────────────────────────────────────────────────────
const SCOPE_RX = /^[a-z][a-z0-9_]{0,62}$/;

export function isValidScope(s: string): boolean {
  return SCOPE_RX.test(s);
}

/** SHA-256 hex (web crypto, works in Bun + Node 20+). */
export async function hashApiKey(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const buf   = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface ApiKeyRecord {
  id:            number;
  key_prefix:    string;
  owner_wallet:  string;
  scope:         string;
  label:         string | null;
  rpm_limit:     number;
  revoked_at:    Date | null;
  last_used_at:  Date | null;
  created_at:    Date;
}

export async function lookupApiKey(rawKey: string): Promise<ApiKeyRecord | null> {
  const hash = await hashApiKey(rawKey);
  const rows = await sql<ApiKeyRecord[]>`
    SELECT id, key_prefix, owner_wallet, scope, label, rpm_limit,
           revoked_at, last_used_at, created_at
    FROM _mneme_api_keys
    WHERE key_hash = ${hash} AND revoked_at IS NULL
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Best-effort last_used_at bump — debounced via a Map to avoid write storms. */
const lastUsedDirty = new Map<number, number>();
let lastFlushAt = Date.now();

export function bumpKeyLastUsed(keyId: number) {
  lastUsedDirty.set(keyId, Date.now());
  if (Date.now() - lastFlushAt > 30_000 && lastUsedDirty.size > 0) {
    void flushKeyLastUsed();
  }
}
async function flushKeyLastUsed() {
  lastFlushAt = Date.now();
  const ids = [...lastUsedDirty.keys()];
  lastUsedDirty.clear();
  if (ids.length === 0) return;
  try {
    await sql`
      UPDATE _mneme_api_keys
      SET last_used_at = now()
      WHERE id = ANY(${ids}::bigint[])
    `;
  } catch {
    // best-effort, ignore
  }
}

// ─── Storage quota helpers ──────────────────────────────────────────────
export const FREE_TIER_BYTES = 100 * 1024 * 1024;  // 100 MB per wallet, forever

export interface StorageQuota {
  wallet:           string;
  bytes_used:       number;
  bytes_limit:      number;       // free + non-expired bonus
  bytes_available:  number;
  bonus_expires_at: Date | null;
}

export async function getStorageQuota(wallet: string): Promise<StorageQuota> {
  const w = wallet.toLowerCase();
  const rows = await sql<Array<{
    bytes_used:       string;
    bonus_bytes:      string;
    bonus_expires_at: Date | null;
  }>>`
    SELECT bytes_used, bonus_bytes, bonus_expires_at
    FROM _mneme_storage_quotas WHERE wallet = ${w}
  `;
  if (rows.length === 0) {
    return {
      wallet:           w,
      bytes_used:       0,
      bytes_limit:      FREE_TIER_BYTES,
      bytes_available:  FREE_TIER_BYTES,
      bonus_expires_at: null,
    };
  }
  const r = rows[0];
  const bonusActive = r.bonus_expires_at && r.bonus_expires_at > new Date();
  const bonus       = bonusActive ? Number(r.bonus_bytes) : 0;
  const used        = Number(r.bytes_used);
  const limit       = FREE_TIER_BYTES + bonus;
  return {
    wallet:           w,
    bytes_used:       used,
    bytes_limit:      limit,
    bytes_available:  Math.max(0, limit - used),
    bonus_expires_at: bonusActive ? r.bonus_expires_at : null,
  };
}

export async function adjustBytesUsed(wallet: string, delta: number): Promise<void> {
  const w = wallet.toLowerCase();
  await sql`
    INSERT INTO _mneme_storage_quotas (wallet, bytes_used, updated_at)
    VALUES (${w}, GREATEST(0, ${delta}::bigint), now())
    ON CONFLICT (wallet) DO UPDATE
    SET bytes_used = GREATEST(0, _mneme_storage_quotas.bytes_used + ${delta}::bigint),
        updated_at = now()
  `;
}

export async function creditBurn(args: {
  tx_hash:     string;
  wallet:      string;
  amount_raw:  string;        // decimal string, raw token units (18 decimals)
  bytes_added: number;
  days_added:  number;
}): Promise<{ credited: boolean; new_expires_at: Date }> {
  const w = args.wallet.toLowerCase();
  // INSERT ... ON CONFLICT DO NOTHING — atomic single-credit guarantee.
  const inserted = await sql<Array<{ tx_hash: string }>>`
    INSERT INTO _mneme_storage_burns (tx_hash, wallet, amount_raw, bytes_added, days_added)
    VALUES (${args.tx_hash.toLowerCase()}, ${w}, ${args.amount_raw}, ${args.bytes_added}, ${args.days_added})
    ON CONFLICT (tx_hash) DO NOTHING
    RETURNING tx_hash
  `;
  if (inserted.length === 0) {
    // Already credited — return current expiry without mutating.
    const cur = await sql<Array<{ bonus_expires_at: Date | null }>>`
      SELECT bonus_expires_at FROM _mneme_storage_quotas WHERE wallet = ${w}
    `;
    return { credited: false, new_expires_at: cur[0]?.bonus_expires_at ?? new Date() };
  }
  // Extend bonus. If existing bonus is still active, extend from its expiry;
  // otherwise start from now.
  const result = await sql<Array<{ bonus_expires_at: Date }>>`
    INSERT INTO _mneme_storage_quotas (wallet, bonus_bytes, bonus_expires_at, updated_at)
    VALUES (
      ${w},
      ${args.bytes_added}::bigint,
      now() + (${args.days_added} || ' days')::interval,
      now()
    )
    ON CONFLICT (wallet) DO UPDATE SET
      bonus_bytes      = _mneme_storage_quotas.bonus_bytes + ${args.bytes_added}::bigint,
      bonus_expires_at = GREATEST(
        COALESCE(_mneme_storage_quotas.bonus_expires_at, now()),
        now()
      ) + (${args.days_added} || ' days')::interval,
      updated_at = now()
    RETURNING bonus_expires_at
  `;
  return { credited: true, new_expires_at: result[0].bonus_expires_at };
}

// ─── Project lookups (cached) ────────────────────────────────────────────────
export async function getProjectForWallet(wallet: string): Promise<Project | null> {
  const key = wallet.toLowerCase();
  if (cacheByWallet.has(key)) return cacheByWallet.get(key)!;
  const rows = await sql<Project[]>`
    SELECT id, owner_wallet, handle, schema_name
    FROM _mneme_projects WHERE owner_wallet = ${key}
  `;
  if (rows.length === 0) return null;
  cacheByWallet.set(key, rows[0]);
  cacheByHandle.set(rows[0].handle, rows[0]);
  return rows[0];
}

export async function getProjectByHandle(handle: string): Promise<Project | null> {
  if (cacheByHandle.has(handle)) return cacheByHandle.get(handle)!;
  const rows = await sql<Project[]>`
    SELECT id, owner_wallet, handle, schema_name
    FROM _mneme_projects WHERE handle = ${handle}
  `;
  if (rows.length === 0) return null;
  cacheByHandle.set(handle, rows[0]);
  cacheByWallet.set(rows[0].owner_wallet, rows[0]);
  return rows[0];
}

// ─── Create a project: insert row, create schema, provision 4 defaults ──────
export async function createProject(args: {
  owner_wallet: string;
  handle:       string;
}): Promise<Project> {
  const wallet = args.owner_wallet.toLowerCase();
  const handle = args.handle;
  if (!HANDLE_RX.test(handle)) throw new Error("invalid handle");
  const schema_name = `agent_${handle}`;
  if (!SCHEMA_RX.test(schema_name)) throw new Error("invalid schema name");

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO _mneme_projects (owner_wallet, handle, schema_name)
      VALUES (${wallet}, ${handle}, ${schema_name})
    `;
    await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS "${schema_name}"`);
    await provisionDefaultTables(tx, schema_name);
  });

  const rows = await sql<Project[]>`
    SELECT id, owner_wallet, handle, schema_name
    FROM _mneme_projects WHERE handle = ${handle}
  `;
  const fresh = rows[0]!;
  cacheByWallet.set(wallet, fresh);
  cacheByHandle.set(handle, fresh);
  return fresh;
}

// ─── Provision the 4 default tables (always-on memory stack) ─────────────────
async function provisionDefaultTables(tx: postgres.TransactionSql, schema: string) {
  await tx.unsafe(`
    CREATE TABLE IF NOT EXISTS "${schema}".memories (
      id          bigserial primary key,
      text        text not null,
      embedding   vector(1536),
      metadata    jsonb default '{}'::jsonb,
      created_at  timestamptz default now()
    );
    CREATE INDEX IF NOT EXISTS memories_created_idx ON "${schema}".memories (created_at desc);

    CREATE TABLE IF NOT EXISTS "${schema}".documents (
      id          bigserial primary key,
      title       text,
      body        text not null,
      embedding   vector(1536),
      metadata    jsonb default '{}'::jsonb,
      created_at  timestamptz default now()
    );
    CREATE INDEX IF NOT EXISTS documents_created_idx ON "${schema}".documents (created_at desc);

    CREATE TABLE IF NOT EXISTS "${schema}".events (
      id          bigserial primary key,
      kind        text not null,
      payload     jsonb default '{}'::jsonb,
      created_at  timestamptz default now()
    );
    CREATE INDEX IF NOT EXISTS events_created_idx ON "${schema}".events (created_at desc);

    CREATE TABLE IF NOT EXISTS "${schema}".kvs (
      key         text primary key,
      value       jsonb not null,
      updated_at  timestamptz default now()
    );
  `);
  // Mneme Graph — entities + relations as first-class data (separate
  // unsafe() call because pgvector's HNSW index DDL doesn't play well
  // with the big multi-statement block above on some pg versions).
  await tx.unsafe(`
    CREATE TABLE IF NOT EXISTS "${schema}".entities (
      id          bigserial primary key,
      kind        text not null,
      name        text not null,
      properties  jsonb default '{}'::jsonb,
      embedding   vector(1536),
      created_at  timestamptz default now(),
      UNIQUE (kind, name)
    );
    CREATE INDEX IF NOT EXISTS entities_kind_idx ON "${schema}".entities (kind);
    CREATE INDEX IF NOT EXISTS entities_props_gin ON "${schema}".entities USING gin (properties);

    CREATE TABLE IF NOT EXISTS "${schema}".relations (
      id          bigserial primary key,
      src_id      bigint not null references "${schema}".entities(id) ON DELETE CASCADE,
      dst_id      bigint not null references "${schema}".entities(id) ON DELETE CASCADE,
      kind        text not null,
      weight      numeric default 1.0,
      properties  jsonb default '{}'::jsonb,
      created_at  timestamptz default now(),
      UNIQUE (src_id, dst_id, kind)
    );
    CREATE INDEX IF NOT EXISTS relations_src_kind_idx ON "${schema}".relations (src_id, kind);
    CREATE INDEX IF NOT EXISTS relations_dst_kind_idx ON "${schema}".relations (dst_id, kind);
    CREATE INDEX IF NOT EXISTS relations_kind_idx     ON "${schema}".relations (kind);
  `);
}

/**
 * Ensure graph tables exist in a project schema — for existing projects
 * created before Mneme Graph shipped. Idempotent. Called by every
 * /v1/graph/* route on first hit. After one round of CREATE IF NOT EXISTS
 * the route is a no-op fast path.
 *
 * NOTE: this uses `sql` (not a tx) so we don't run inside the route's
 * postgres connection context — keep it tiny.
 */
const ensuredSchemas = new Set<string>();
export async function ensureGraphTables(schema: string): Promise<void> {
  if (!isValidSchemaName(schema)) throw new Error("invalid schema");
  if (ensuredSchemas.has(schema)) return;
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "${schema}".entities (
      id          bigserial primary key,
      kind        text not null,
      name        text not null,
      properties  jsonb default '{}'::jsonb,
      embedding   vector(1536),
      created_at  timestamptz default now(),
      UNIQUE (kind, name)
    );
    CREATE INDEX IF NOT EXISTS entities_kind_idx  ON "${schema}".entities (kind);
    CREATE INDEX IF NOT EXISTS entities_props_gin ON "${schema}".entities USING gin (properties);

    CREATE TABLE IF NOT EXISTS "${schema}".relations (
      id          bigserial primary key,
      src_id      bigint not null references "${schema}".entities(id) ON DELETE CASCADE,
      dst_id      bigint not null references "${schema}".entities(id) ON DELETE CASCADE,
      kind        text not null,
      weight      numeric default 1.0,
      properties  jsonb default '{}'::jsonb,
      created_at  timestamptz default now(),
      UNIQUE (src_id, dst_id, kind)
    );
    CREATE INDEX IF NOT EXISTS relations_src_kind_idx ON "${schema}".relations (src_id, kind);
    CREATE INDEX IF NOT EXISTS relations_dst_kind_idx ON "${schema}".relations (dst_id, kind);
    CREATE INDEX IF NOT EXISTS relations_kind_idx     ON "${schema}".relations (kind);
  `);
  ensuredSchemas.add(schema);
}

// ─── User-defined tables ─────────────────────────────────────────────────────
export async function createUserTable(schema: string, name: string, columns: ColumnDef[]): Promise<void> {
  if (!isValidSchemaName(schema)) throw new Error("invalid schema");
  if (!isValidTableName(name))    throw new Error("invalid table name");
  if ((DEFAULT_TABLES as readonly string[]).includes(name)) {
    throw new Error(`"${name}" is a default table — pick another name`);
  }
  if (columns.length === 0)  throw new Error("at least one column required");
  if (columns.length > 64)   throw new Error("max 64 columns per table");

  let pkCount = 0;
  for (const c of columns) {
    if (!isValidColumnName(c.name))  throw new Error(`invalid column name: ${c.name}`);
    if (!VALID_TYPE_SET.has(c.type)) throw new Error(`invalid column type: ${c.type}`);
    if (c.type === "vector" && (!c.dim || c.dim < 1 || c.dim > 4096)) {
      throw new Error(`vector column "${c.name}" requires dim 1–4096`);
    }
    if (c.primaryKey) pkCount++;
  }
  if (pkCount > 1) throw new Error("at most one column can be primaryKey");

  const colParts: string[] = [];
  if (pkCount === 0) {
    colParts.push(`"id" bigserial PRIMARY KEY`);
  }
  for (const c of columns) {
    const typeStr = c.type === "vector" ? `vector(${c.dim})` : c.type;
    const parts: string[] = [`"${c.name}"`, typeStr];
    if (c.primaryKey)        parts.push("PRIMARY KEY");
    if (c.nullable === false) parts.push("NOT NULL");
    if (c.unique)             parts.push("UNIQUE");
    colParts.push(parts.join(" "));
  }
  if (!columns.some((c) => c.name === "created_at")) {
    colParts.push(`"created_at" timestamptz DEFAULT now()`);
  }

  const ddl = `CREATE TABLE IF NOT EXISTS "${schema}"."${name}" (${colParts.join(", ")})`;
  await sql.unsafe(ddl);
}

// ─── Introspect tables in a schema (for GET /v1/tables) ──────────────────────
export async function introspectTables(schema: string): Promise<TableInfo[]> {
  if (!isValidSchemaName(schema)) throw new Error("invalid schema");

  const tables = await sql<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = ${schema} AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  const result: TableInfo[] = [];
  for (const t of tables) {
    const cols = await sql<Array<{ column_name: string; udt_name: string; is_nullable: string }>>`
      SELECT column_name, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = ${schema} AND table_name = ${t.table_name}
      ORDER BY ordinal_position
    `;
    const countRows = await sql<Array<{ count: string }>>`
      SELECT count(*)::text AS count FROM ${sql(schema)}.${sql(t.table_name)}
    `;
    result.push({
      name:      t.table_name,
      isDefault: (DEFAULT_TABLES as readonly string[]).includes(t.table_name),
      rowCount:  Number(countRows[0]?.count ?? 0),
      columns: cols.map((c) => ({
        name:     c.column_name,
        type:     c.udt_name,
        nullable: c.is_nullable === "YES",
      })),
    });
  }
  return result;
}
