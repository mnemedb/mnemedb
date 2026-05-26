import type { Account } from "viem";
import { signRequest } from "./sign";
import type {
  CreateTableArgs,
  DocumentRow,
  EventRow,
  KvRow,
  MemoryRow,
  TableInfo,
  VectorSearchArgs,
} from "./types";

export type MnemeAuth =
  | { account:     Account;  accessToken?: never }
  | { accessToken: string;   account?:     never };

export type MnemeOptions = MnemeAuth & {
  gatewayUrl:     string;
  chainId?:       number;
  domainName?:    string;
  domainVersion?: string;
};

export interface StatsResponse {
  tables: Record<string, number>;
  totals: {
    rows:                  number;
    default_tables:        number;
    custom_tables:         number;
    vector_searches_today: number;
    mneme_burned_total:    number;
  };
}

// ─── Binary helpers (used by storage.upload) ──────────────────────────────
async function toUint8Array(input: Blob | Uint8Array | ArrayBuffer | string): Promise<Uint8Array> {
  if (input instanceof Uint8Array)   return input;
  if (input instanceof ArrayBuffer)  return new Uint8Array(input);
  if (typeof Blob !== "undefined" && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }
  if (typeof input === "string") return new TextEncoder().encode(input);
  throw new Error("unsupported file type for storage.upload");
}

function uint8ToBase64(bytes: Uint8Array): string {
  // Chunked to avoid call-stack overflow on large files
  const CHUNK = 32768;
  const parts: string[] = [];
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  if (typeof btoa !== "undefined") return btoa(parts.join(""));
  // Node/Bun fallback
  return Buffer.from(parts.join(""), "binary").toString("base64");
}

export class MnemeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "MnemeError";
  }
}

export class Mneme {
  private auth:          MnemeAuth;
  private gatewayUrl:    string;
  private chainId:       number;
  private domainName:    string;
  private domainVersion: string;

  /** Convenience accessors for the four always-on default tables. */
  readonly memories:  Collection<MemoryRow>;
  readonly documents: Collection<DocumentRow>;
  readonly events:    Collection<EventRow>;
  readonly kvs:       Collection<KvRow>;

  constructor(opts: MnemeOptions) {
    this.auth = "accessToken" in opts && opts.accessToken
      ? { accessToken: opts.accessToken }
      : { account: (opts as { account: Account }).account };
    this.gatewayUrl    = opts.gatewayUrl.replace(/\/$/, "");
    this.chainId       = opts.chainId       ?? 8453;
    this.domainName    = opts.domainName    ?? "Mneme";
    this.domainVersion = opts.domainVersion ?? "1";

    this.memories  = new Collection<MemoryRow>(this,  "memories");
    this.documents = new Collection<DocumentRow>(this, "documents");
    this.events    = new Collection<EventRow>(this,    "events");
    this.kvs       = new Collection<KvRow>(this,       "kvs");
  }

  // ─── DDL ──────────────────────────────────────────────────────────────────
  createTable(args: CreateTableArgs) {
    return this.request<{ ok: true; table: string }>("POST", "/v1/tables", args);
  }

  listTables() {
    return this.request<{ tables: TableInfo[] }>("GET", "/v1/tables");
  }

  // ─── Vector & stats ───────────────────────────────────────────────────────
  vectorSearch(args: VectorSearchArgs) {
    return this.request<{ matches: unknown[] }>("POST", "/v1/vector/search", args);
  }

  stats() {
    return this.request<StatsResponse>("GET", "/v1/stats");
  }

  // ─── Generic CRUD against any table the agent owns ───────────────────────
  from<T = unknown>(table: string): Collection<T> {
    return new Collection<T>(this, table);
  }

  // ─── Storage (Cloudflare R2 backend, $MNEME burn quota) ──────────────────
  readonly storage = {
    upload: async (args: {
      key:         string;
      file:        Blob | Uint8Array | ArrayBuffer | string;
      visibility?: "public" | "private";
      contentType?: string;
    }): Promise<{
      ok:           true;
      key:          string;
      visibility:   "public" | "private";
      size:         number;
      content_type: string;
      public_url?:  string;
    }> => {
      const bytes = await toUint8Array(args.file);
      const content_base64 = uint8ToBase64(bytes);
      return this.request("POST", "/v1/storage/upload", {
        key:            args.key,
        visibility:     args.visibility ?? "private",
        content_type:   args.contentType ?? "application/octet-stream",
        content_base64,
      });
    },

    list: (args?: { visibility?: "public" | "private"; prefix?: string }) => {
      const q = new URLSearchParams();
      if (args?.visibility) q.set("visibility", args.visibility);
      if (args?.prefix)     q.set("prefix",     args.prefix);
      return this.request<{
        visibility: "public" | "private";
        count:      number;
        objects: Array<{
          key:           string;
          size:          number;
          last_modified: string;
          public_url?:   string;
        }>;
      }>("GET", `/v1/storage/list${q.toString() ? `?${q}` : ""}`);
    },

    delete: (args: { key: string; visibility?: "public" | "private" }) => {
      const q = new URLSearchParams({ key: args.key });
      if (args.visibility) q.set("visibility", args.visibility);
      return this.request<{ ok: true; key: string; freed_bytes: number }>(
        "DELETE",
        `/v1/storage/object?${q}`,
      );
    },

    url: (args: { key: string; visibility?: "public" | "private"; expiresIn?: number }) => {
      const q = new URLSearchParams({ key: args.key });
      if (args.visibility) q.set("visibility", args.visibility);
      if (args.expiresIn != null) q.set("expires_in", String(args.expiresIn));
      return this.request<{ url: string; expires_in: number }>(
        "GET",
        `/v1/storage/url?${q}`,
      );
    },

    quota: () =>
      this.request<{
        wallet:           string;
        bytes_used:       number;
        bytes_limit:      number;
        bytes_available:  number;
        free_tier_bytes:  number;
        bonus_expires_at: string | null;
      }>("GET", "/v1/storage/quota"),

    /**
     * Credit a $MNEME burn tx → extend storage capacity.
     *   100 $MNEME →   1 GB / 30d
     *   1000 $MNEME →  10 GB / 30d
     *  10000 $MNEME → 100 GB / 30d
     */
    burn: (args: { tx_hash: string }) =>
      this.request<{
        ok:             true;
        tx_hash:        string;
        burned_tokens:  number;
        tier:           string;
        bytes_added:    number;
        days_added:     number;
        new_expires_at: string;
      }>("POST", "/v1/storage/burn", { tx_hash: args.tx_hash }),
  };

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const bodyText = body === undefined ? "" : JSON.stringify(body);
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if ("accessToken" in this.auth && this.auth.accessToken) {
      headers["Authorization"] = `Bearer ${this.auth.accessToken}`;
    } else if ("account" in this.auth && this.auth.account) {
      const signed = await signRequest({
        account:       this.auth.account,
        chainId:       this.chainId,
        domainName:    this.domainName,
        domainVersion: this.domainVersion,
        method,
        path,
        body: bodyText,
      });
      Object.assign(headers, signed);
    } else {
      throw new Error("Mneme: either { account } or { accessToken } is required");
    }

    const res = await fetch(`${this.gatewayUrl}${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : bodyText,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
    if (!res.ok) throw new MnemeError(res.status, json.error ?? "request failed");
    return json as T;
  }
}

/** PostgREST-ish where clause. e.g. `["status.eq.done", "score.gt.10"]`. */
export type WhereClause = string;

export class Collection<T = unknown> {
  constructor(private mneme: Mneme, public readonly table: string) {}

  /** Insert one row or an array of rows. Returns the inserted rows. */
  insert(rows: T | T[]) {
    return this.mneme.request<{ inserted: number; rows: T[] }>(
      "POST",
      `/v1/rows/${this.table}`,
      rows,
    );
  }

  /**
   * List rows. Supports filtering with `where` (PostgREST-style col.op.value),
   * ordering with `order` (e.g. "created_at.desc"), and pagination.
   *
   * Ops: eq, neq, gt, gte, lt, lte, like, ilike, in, is.
   * Example: `m.from("todos").list({ where: ["done.eq.false"], order: "created_at.desc" })`
   */
  list(opts?: { limit?: number; offset?: number; order?: string; where?: WhereClause | WhereClause[] }) {
    const q = new URLSearchParams();
    if (opts?.limit  != null) q.set("limit",  String(opts.limit));
    if (opts?.offset != null) q.set("offset", String(opts.offset));
    if (opts?.order)          q.set("order",  opts.order);
    if (opts?.where) {
      const ws = Array.isArray(opts.where) ? opts.where : [opts.where];
      for (const w of ws) q.append("where", w);
    }
    const qs = q.toString() ? `?${q}` : "";
    return this.mneme.request<{ rows: T[]; count: number }>("GET", `/v1/rows/${this.table}${qs}`);
  }

  /** Update one row by id. Returns the updated row. */
  update(id: string | number, updates: Partial<T>) {
    return this.mneme.request<{ updated: 1; row: T }>(
      "PATCH",
      `/v1/rows/${this.table}/${id}`,
      updates,
    );
  }

  /** Delete one row by id. */
  delete(id: string | number) {
    return this.mneme.request<{ deleted: 1; id: number | string }>(
      "DELETE",
      `/v1/rows/${this.table}/${id}`,
    );
  }

  /**
   * Bulk delete by filter. Refuses to delete the whole table — at least one
   * where clause is required. Returns the count of deleted rows.
   */
  deleteWhere(where: WhereClause | WhereClause[]) {
    const ws = Array.isArray(where) ? where : [where];
    if (ws.length === 0) throw new Error("deleteWhere requires at least one filter");
    const q = new URLSearchParams();
    for (const w of ws) q.append("where", w);
    return this.mneme.request<{ deleted: number }>(
      "DELETE",
      `/v1/rows/${this.table}?${q}`,
    );
  }
}
