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
export const DEFAULT_TABLES = ["memories", "documents", "events", "kvs"] as const;
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
