// ─── Column types Mneme supports for runtime table creation ──────────────────
export const COLUMN_TYPES = [
  "text", "int", "bigint", "bool", "jsonb", "timestamptz",
  "vector", "numeric", "uuid", "date",
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export interface ColumnDef {
  name:        string;
  type:        ColumnType;
  /** Required when `type === "vector"`. 1–4096. */
  dim?:        number;
  nullable?:   boolean;
  unique?:     boolean;
  primaryKey?: boolean;
}

export interface CreateTableArgs {
  name:    string;
  columns: ColumnDef[];
}

export interface ColumnInfo {
  name:     string;
  type:     string;
  nullable: boolean;
}

export interface TableInfo {
  name:      string;
  isDefault: boolean;
  rowCount:  number;
  columns:   ColumnInfo[];
}

export interface VectorSearchArgs {
  table:     string;
  column:    string;
  embedding: number[];
  k?:        number;
}

// ─── Default tables auto-provisioned at project create ───────────────────────
export const DEFAULT_TABLES = ["memories", "documents", "events", "kvs"] as const;
export type DefaultTable = (typeof DEFAULT_TABLES)[number];

// Row shapes for the defaults (typed convenience accessors).
export interface MemoryRow {
  id?:         number;
  text:        string;
  embedding?:  number[];
  metadata?:   Record<string, unknown>;
  created_at?: string;
}

export interface DocumentRow {
  id?:         number;
  title?:      string;
  body:        string;
  embedding?:  number[];
  metadata?:   Record<string, unknown>;
  created_at?: string;
}

export interface EventRow {
  id?:         number;
  kind:        string;
  payload?:    Record<string, unknown>;
  created_at?: string;
}

export interface KvRow {
  key:         string;
  value:       unknown;
  updated_at?: string;
}
