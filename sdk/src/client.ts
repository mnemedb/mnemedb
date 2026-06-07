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
  | { account:     Account;  accessToken?: never; apiKey?: never }
  | { accessToken: string;   account?:     never; apiKey?: never }
  | { apiKey:      string;   account?:     never; accessToken?: never };

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
    if ("apiKey" in opts && opts.apiKey) {
      this.auth = { apiKey: opts.apiKey };
    } else if ("accessToken" in opts && opts.accessToken) {
      this.auth = { accessToken: opts.accessToken };
    } else {
      this.auth = { account: (opts as { account: Account }).account };
    }
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

  /**
   * Natural-language → SQL via the gateway's LLM proxy.
   * Use the returned SQL with `m.sql(...)` to execute it.
   */
  llm = {
    sql: (args: { prompt: string; schema?: string }) =>
      this.request<{ sql: string; model: string; elapsed_ms: number }>(
        "POST", "/v1/llm/sql", args,
      ),
    /**
     * Free-form chat with the Mneme assistant. Server-side LLM is told
     * about your schema and Base ecosystem — useful for "what does this
     * SQL do", "how do I do vector search", "what's pgvector", etc.
     */
    chat: (args: {
      prompt:  string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
    }) =>
      this.request<{ reply: string; model: string; elapsed_ms: number }>(
        "POST", "/v1/llm/chat", args,
      ),
  };

  /**
   * Mneme Dreams — async LLM reflection on your project's data.
   *
   * The gateway runs a background worker that reads each project's recent
   * memories/entities/relations/streams and asks claude-sonnet-4.5 to
   * surface NON-OBVIOUS observations:
   *   pattern   — co-occurrence/repetition/cluster
   *   question  — something the data implies worth investigating
   *   gap       — data missing but likely useful given what IS there
   *   synthesis — narrative paragraph across the recent window
   *
   * Worker runs ~daily per project. You can also force one immediately
   * with .generate() — useful when you've just inserted a batch.
   *
   * @example
   * await m.dreams.generate({ hint: "focus on what's connected to MNEME" });
   * const recent = await m.dreams.list({ limit: 10 });
   */
  readonly dreams = {
    /** Trigger a fresh dream pass right now. Returns the inserted rows. */
    generate: (args?: { hint?: string; max_dreams?: number }) =>
      this.request<{
        ok:                 boolean;
        count?:             number;
        elapsed_ms?:        number;
        context_chars?:     number;
        records_considered?:number;
        reason?:            string;
        dreams: Array<{ id: number; kind: string; title: string; body: string; created_at: string }>;
      }>("POST", "/v1/dreams/generate", args ?? {}),

    /** List recent dreams (newest first). Optional kind filter. */
    list: (opts?: { limit?: number; kind?: string }) => {
      const q = new URLSearchParams();
      if (opts?.limit) q.set("limit", String(opts.limit));
      if (opts?.kind)  q.set("kind",  opts.kind);
      return this.request<{
        count:  number;
        dreams: Array<{
          id: number; kind: string; title: string; body: string;
          sources: string[]; model: string | null; created_at: string;
        }>;
      }>("GET", `/v1/dreams${q.toString() ? `?${q}` : ""}`);
    },

    /** Fetch one dream by id. */
    get: (id: number) =>
      this.request<{
        id: number; kind: string; title: string; body: string;
        sources: string[]; model: string | null; created_at: string;
      }>("GET", `/v1/dreams/${id}`),

    /** Delete a dream. */
    delete: (id: number) =>
      this.request<{ ok: true; id: number }>("DELETE", `/v1/dreams/${id}`),
  };

  /**
   * Mneme Graph — entities + relations as first-class data.
   *
   * Solves pgvector's structural failure mode (similar keywords, divergent
   * meaning) by making relationships traversable. Vector search still works
   * via .semanticNeighbors which does vector seed → graph walk → ranked
   * fan-out (find entities that ARE related but don't embed similarly to
   * the query).
   *
   * Two default tables auto-provisioned per project:
   *   entities(id, kind, name, properties jsonb, embedding vector(1536))
   *   relations(id, src_id, dst_id, kind, weight, properties jsonb)
   *
   * @example
   * await m.graph.addEntity({ kind: "person", name: "vitalik", properties: { wallet: "0xd8d…" }});
   * await m.graph.addEntity({ kind: "token",  name: "MNEME" });
   * await m.graph.addRelation({ src: "person:vitalik", dst: "token:MNEME", kind: "holds" });
   * const fan = await m.graph.neighbors(1, { hops: 2 });
   */
  readonly graph = {
    /** Upsert by (kind, name). Properties merge; embedding overwrites if provided. */
    addEntity: (args: {
      kind:        string;
      name:        string;
      properties?: Record<string, unknown>;
      embedding?:  number[];
    }) =>
      this.request<{ ok: true; id: number; kind: string; name: string; created_at: string }>(
        "POST", "/v1/graph/entities", args,
      ),

    /** Add an edge. `src` and `dst` accept entity ids OR "kind:name" refs. */
    addRelation: (args: {
      src:         number | string;
      dst:         number | string;
      kind:        string;
      weight?:     number;
      properties?: Record<string, unknown>;
    }) =>
      this.request<{ ok: true; id: number; src_id: number; dst_id: number; kind: string }>(
        "POST", "/v1/graph/relations", args,
      ),

    /** List entities, filterable by kind / name LIKE. */
    listEntities: (args?: { kind?: string; name_like?: string; limit?: number }) => {
      const q = new URLSearchParams();
      if (args?.kind)      q.set("kind",      args.kind);
      if (args?.name_like) q.set("name_like", args.name_like);
      if (args?.limit)     q.set("limit",     String(args.limit));
      return this.request<{
        entities: Array<{ id: number; kind: string; name: string; properties: Record<string, unknown>; created_at: string }>;
        count:    number;
      }>("GET", `/v1/graph/entities${q.toString() ? `?${q}` : ""}`);
    },

    /** k-hop neighbors (1-5 hops, undirected). Optional edge-kind filter. */
    neighbors: (id: number, opts?: { hops?: number; limit?: number; edge_kinds?: string[] }) => {
      const q = new URLSearchParams();
      if (opts?.hops)       q.set("hops",       String(opts.hops));
      if (opts?.limit)      q.set("limit",      String(opts.limit));
      if (opts?.edge_kinds) q.set("edge_kinds", opts.edge_kinds.join(","));
      return this.request<{
        root_id: number; hops: number; count: number;
        neighbors: Array<{ id: number; kind: string; name: string; properties: Record<string, unknown>; hops: number }>;
      }>("GET", `/v1/graph/neighbors/${id}${q.toString() ? `?${q}` : ""}`);
    },

    /** Shortest path between two entities (≤ max_hops). */
    path: (src: number, dst: number, opts?: { max_hops?: number }) => {
      const q = new URLSearchParams({ src: String(src), dst: String(dst) });
      if (opts?.max_hops) q.set("max_hops", String(opts.max_hops));
      return this.request<
        | { found: false; src: number; dst: number; max_hops: number }
        | {
            found: true; src: number; dst: number; hops: number;
            path: Array<{ id: number; kind: string; name: string }>;
          }
      >("GET", `/v1/graph/path?${q}`);
    },

    /**
     * Hybrid retrieval — pgvector finds K seed entities by embedding
     * similarity, then we walk the graph N hops out. Each reached entity
     * scores as MAX(vector_sim × decay^hops). Returns top-`limit` by score.
     *
     * This is the answer to "pgvector breaks when keyword similarity
     * overlaps but semantic meaning diverges" — we don't trust the vector
     * alone, we use it to find footholds and then traverse the graph.
     */
    semanticNeighbors: (args: {
      embedding: number[];
      seed_k?:   number;
      hops?:     number;
      decay?:    number;
      limit?:    number;
      kind?:     string;
    }) =>
      this.request<{
        seed_k: number; hops: number; decay: number; count: number;
        matches: Array<{ id: number; kind: string; name: string; properties: Record<string, unknown>; score: number }>;
      }>("POST", "/v1/graph/semantic-neighbors", args),

    /** Delete an entity (cascades to all attached relations). */
    deleteEntity:   (id: number) =>
      this.request<{ ok: true; id: number }>("DELETE", `/v1/graph/entities/${id}`),
    deleteRelation: (id: number) =>
      this.request<{ ok: true; id: number }>("DELETE", `/v1/graph/relations/${id}`),
  };

  /**
   * Mneme Live — chain stream subscriptions.
   *
   * Subscribe to any Base contract + event → matching events get inserted
   * into a table in your schema in near-real-time (~6s latency, polling).
   *
   * @example
   * await m.streams.watch({
   *   contract:     "0x3FcDbEBD5e7BaB79477cFDcA2CDCF6e904C27b07",
   *   event:        "transfer",                    // or raw "Transfer(address,address,uint256)"
   *   target_table: "mneme_transfers",
   * });
   * // …a few seconds later:
   * await m.sql("SELECT * FROM mneme_transfers ORDER BY block_ts DESC LIMIT 10");
   */
  readonly streams = {
    /** Create a subscription. Auto-creates target_table if missing. */
    watch: (args: {
      contract:     string;
      event:        string;             // template alias OR raw event signature
      target_table: string;
      label?:       string;
    }) =>
      this.request<{
        ok:              true;
        id:              number;
        contract:        string;
        event_signature: string;
        event_name:      string;
        topic0:          string;
        target_table:    string;
        created_at:      string;
        note:            string;
      }>("POST", "/v1/streams", args),

    /** List all subscriptions on this project. */
    list: () =>
      this.request<{
        streams: Array<{
          id:              number;
          contract:        string;
          event_signature: string;
          event_name:      string;
          target_table:    string;
          active:          boolean;
          label:           string | null;
          last_block:      number;
          created_at:      string;
        }>;
      }>("GET", "/v1/streams"),

    /** Pause a subscription. Target table is kept; no more inserts. */
    unwatch: (id: number) =>
      this.request<{ ok: true; id: number; note: string }>("DELETE", `/v1/streams/${id}`),
  };

  /**
   * Service-account API keys — for B2B2C integrators (e.g. Gitlawb) that
   * distribute scoped keys to end-users who don't have wallets.
   *
   * Only callable by wallet-authed clients (keys cannot mint more keys).
   */
  readonly serviceKeys = {
    /** Mint a new scoped key. Returns the raw key value ONCE. */
    create: (args: { scope: string; label?: string; rpm_limit?: number }) =>
      this.request<{
        ok:         true;
        id:         number;
        key:        string;        // ← raw key value, save it
        key_prefix: string;
        scope:      string;
        label:      string | null;
        rpm_limit:  number;
        created_at: string;
        warning:    string;
      }>("POST", "/v1/service/keys", args),

    /** List all keys you've created (no raw values — only metadata). */
    list: () =>
      this.request<{
        keys: Array<{
          id: number;
          key_prefix: string;
          scope: string;
          label: string | null;
          rpm_limit: number;
          revoked: boolean;
          revoked_at: string | null;
          last_used_at: string | null;
          created_at: string;
        }>;
      }>("GET", "/v1/service/keys"),

    /** Revoke a key by id. */
    revoke: (id: number) =>
      this.request<{ ok: true; id: number }>("DELETE", `/v1/service/keys/${id}`),
  };

  /**
   * Run raw SQL against your project's Postgres schema.
   *
   * Safety guards (server-side):
   *   - 5-second statement timeout
   *   - search_path pinned to your schema (unqualified table refs resolve to YOUR schema)
   *   - cross-tenant schema references are blocked
   *   - 1000-row result cap
   *   - single statement only
   *
   * Returns rows, column metadata, and elapsed time.
   *
   * @example
   * await m.sql("SELECT count(*) FROM memories");
   * await m.sql("CREATE INDEX ON books (rating)");
   */
  sql<T = Record<string, unknown>>(query: string) {
    return this.request<{
      rows:       T[];
      row_count:  number;
      columns:    string[];
      truncated:  boolean;
      elapsed_ms: number;
    }>("POST", "/v1/sql", { query });
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

    if ("apiKey" in this.auth && this.auth.apiKey) {
      headers["Authorization"] = `ApiKey ${this.auth.apiKey}`;
    } else if ("accessToken" in this.auth && this.auth.accessToken) {
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
      throw new Error("Mneme: one of { account }, { accessToken }, or { apiKey } is required");
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
