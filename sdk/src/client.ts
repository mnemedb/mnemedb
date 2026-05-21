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

export class Collection<T = unknown> {
  constructor(private mneme: Mneme, public readonly table: string) {}

  insert(rows: T | T[]) {
    return this.mneme.request<{ inserted: number; rows: T[] }>(
      "POST",
      `/v1/rows/${this.table}`,
      rows,
    );
  }

  list(opts?: { limit?: number; offset?: number; order?: string }) {
    const q = new URLSearchParams();
    if (opts?.limit  != null) q.set("limit",  String(opts.limit));
    if (opts?.offset != null) q.set("offset", String(opts.offset));
    if (opts?.order)          q.set("order",  opts.order);
    const qs = q.toString() ? `?${q}` : "";
    return this.mneme.request<{ rows: T[] }>("GET", `/v1/rows/${this.table}${qs}`);
  }
}
