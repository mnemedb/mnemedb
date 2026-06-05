/**
 * Mneme Graph — entities + relations as first-class data.
 *
 * Solves pgvector's structural failure mode (keyword similarity overlaps but
 * semantic meaning diverges) by making relationships first-class and
 * traversable. Vector search is still here — it now SUPPLEMENTS the graph
 * via /semantic-neighbors (vector seeds, then walk N hops out).
 *
 *   POST   /v1/graph/entities          add/upsert an entity
 *   POST   /v1/graph/relations         add a relation (edge)
 *   GET    /v1/graph/entities          list/search entities (by kind, name LIKE, props)
 *   GET    /v1/graph/neighbors/:id     k-hop traversal from an entity
 *   GET    /v1/graph/path              shortest path between two entities
 *   POST   /v1/graph/semantic-neighbors  hybrid: vector seeds + graph walk
 *   DELETE /v1/graph/entities/:id      remove entity (cascades to relations)
 *   DELETE /v1/graph/relations/:id     remove one relation
 */
import { Hono } from "hono";
import { sql, ensureGraphTables } from "../db";

const route = new Hono();

// ─── POST /entities ──────────────────────────────────────────────────────
interface AddEntityBody {
  kind?:       string;
  name?:       string;
  properties?: Record<string, unknown>;
  embedding?:  number[];        // length 1536, optional
}

route.post("/entities", async (c) => {
  const project = c.get("project");
  await ensureGraphTables(project.schema_name);

  let body: AddEntityBody;
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const kind = (body.kind ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!kind || !name) return c.json({ error: "kind and name are required" }, 400);
  if (kind.length > 64 || name.length > 256) {
    return c.json({ error: "kind ≤ 64 chars, name ≤ 256 chars" }, 400);
  }

  const propsJson = JSON.stringify(body.properties ?? {});
  const embStr    = body.embedding && Array.isArray(body.embedding) && body.embedding.length > 0
    ? `[${body.embedding.join(",")}]`
    : null;

  // ON CONFLICT (kind, name) DO UPDATE — merge properties + refresh embedding
  const rows = await sql<Array<{
    id: number; kind: string; name: string; created_at: Date;
  }>>`
    INSERT INTO ${sql(project.schema_name)}.entities (kind, name, properties, embedding)
    VALUES (${kind}, ${name}, ${propsJson}::jsonb,
            ${embStr ? sql`${embStr}::vector` : sql`NULL`})
    ON CONFLICT (kind, name) DO UPDATE
    SET properties = ${sql(project.schema_name)}.entities.properties || EXCLUDED.properties,
        embedding  = COALESCE(EXCLUDED.embedding, ${sql(project.schema_name)}.entities.embedding)
    RETURNING id, kind, name, created_at
  `;
  const e = rows[0]!;
  return c.json({ ok: true, id: e.id, kind: e.kind, name: e.name, created_at: e.created_at });
});

// ─── POST /relations ─────────────────────────────────────────────────────
interface AddRelationBody {
  src?:        number | string;     // entity id OR "kind:name" reference
  dst?:        number | string;
  kind?:       string;
  weight?:     number;
  properties?: Record<string, unknown>;
}

route.post("/relations", async (c) => {
  const project = c.get("project");
  await ensureGraphTables(project.schema_name);

  let body: AddRelationBody;
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const kind = (body.kind ?? "").trim();
  if (!kind) return c.json({ error: "kind is required" }, 400);
  if (kind.length > 64) return c.json({ error: "kind ≤ 64 chars" }, 400);

  const srcId = await resolveEntityRef(project.schema_name, body.src);
  const dstId = await resolveEntityRef(project.schema_name, body.dst);
  if (!srcId || !dstId) {
    return c.json({ error: "src and dst must be entity ids or 'kind:name' strings of existing entities" }, 400);
  }

  const propsJson = JSON.stringify(body.properties ?? {});
  const weight    = typeof body.weight === "number" ? body.weight : 1.0;

  const rows = await sql<Array<{ id: number; src_id: number; dst_id: number; kind: string }>>`
    INSERT INTO ${sql(project.schema_name)}.relations (src_id, dst_id, kind, weight, properties)
    VALUES (${srcId}, ${dstId}, ${kind}, ${weight}, ${propsJson}::jsonb)
    ON CONFLICT (src_id, dst_id, kind) DO UPDATE
    SET weight     = EXCLUDED.weight,
        properties = ${sql(project.schema_name)}.relations.properties || EXCLUDED.properties
    RETURNING id, src_id, dst_id, kind
  `;
  const r = rows[0]!;
  return c.json({ ok: true, id: r.id, src_id: r.src_id, dst_id: r.dst_id, kind: r.kind });
});

// ─── GET /entities — list/search ─────────────────────────────────────────
route.get("/entities", async (c) => {
  const project = c.get("project");
  await ensureGraphTables(project.schema_name);

  const kind     = c.req.query("kind");
  const nameLike = c.req.query("name_like");
  const limit    = Math.min(Number(c.req.query("limit") ?? 50), 500);

  const whereClauses: string[] = [];
  const params: Array<string | number | boolean | null> = [];
  let p = 1;
  if (kind)     { whereClauses.push(`kind = $${p++}`);          params.push(kind); }
  if (nameLike) { whereClauses.push(`name ILIKE $${p++}`);      params.push(`%${nameLike}%`); }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const rows = await sql.unsafe(
    `SELECT id, kind, name, properties, created_at
     FROM "${project.schema_name}".entities
     ${where}
     ORDER BY created_at DESC
     LIMIT ${limit}`,
    params,
  );
  return c.json({ entities: rows, count: rows.length });
});

// ─── GET /neighbors/:id — k-hop traversal ────────────────────────────────
route.get("/neighbors/:id", async (c) => {
  const project = c.get("project");
  await ensureGraphTables(project.schema_name);

  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);
  const hops      = Math.min(Math.max(Number(c.req.query("hops") ?? 1), 1), 5);
  const limit     = Math.min(Number(c.req.query("limit") ?? 100), 1000);
  const edgeKinds = c.req.query("edge_kinds");   // comma-separated, optional

  // Undirected walk: follow edges in EITHER direction
  const edgeFilter = edgeKinds
    ? `AND r.kind = ANY($3::text[])`
    : "";
  const params: Array<string | number | boolean | null | string[]> = [id, hops];
  if (edgeKinds) params.push(edgeKinds.split(",").map((s) => s.trim()));

  const cte = `
    WITH RECURSIVE walk AS (
      SELECT id, kind, name, properties, 0 AS hops
      FROM "${project.schema_name}".entities
      WHERE id = $1
      UNION
      SELECT e.id, e.kind, e.name, e.properties, w.hops + 1
      FROM walk w
      JOIN "${project.schema_name}".relations r
        ON (r.src_id = w.id OR r.dst_id = w.id) ${edgeFilter}
      JOIN "${project.schema_name}".entities e
        ON e.id = CASE WHEN r.src_id = w.id THEN r.dst_id ELSE r.src_id END
      WHERE w.hops < $2
    )
    SELECT DISTINCT ON (id) id, kind, name, properties, hops
    FROM walk
    WHERE hops > 0
    ORDER BY id, hops
    LIMIT ${limit}
  `;
  const rows = await sql.unsafe(cte, params);
  return c.json({ root_id: id, hops, count: rows.length, neighbors: rows });
});

// ─── GET /path?src=&dst=&max_hops= — shortest path ───────────────────────
route.get("/path", async (c) => {
  const project = c.get("project");
  await ensureGraphTables(project.schema_name);

  const src      = Number(c.req.query("src"));
  const dst      = Number(c.req.query("dst"));
  const maxHops  = Math.min(Math.max(Number(c.req.query("max_hops") ?? 4), 1), 6);
  if (!Number.isInteger(src) || !Number.isInteger(dst) || src <= 0 || dst <= 0) {
    return c.json({ error: "src and dst must be positive entity ids (use ?src=N&dst=M)" }, 400);
  }

  // Bidirectional walk to find shortest path. Uses array path-tracking to avoid cycles.
  const rows = await sql.unsafe(
    `
    WITH RECURSIVE walk AS (
      SELECT ARRAY[id]::bigint[] AS path, id AS current, 0 AS hops
      FROM "${project.schema_name}".entities
      WHERE id = $1
      UNION ALL
      SELECT w.path || e.id, e.id, w.hops + 1
      FROM walk w
      JOIN "${project.schema_name}".relations r
        ON (r.src_id = w.current OR r.dst_id = w.current)
      JOIN "${project.schema_name}".entities e
        ON e.id = CASE WHEN r.src_id = w.current THEN r.dst_id ELSE r.src_id END
      WHERE w.hops < $3
        AND NOT (e.id = ANY(w.path))
    )
    SELECT path, hops FROM walk WHERE current = $2 ORDER BY hops LIMIT 1
    `,
    [src, dst, maxHops],
  );
  if (rows.length === 0) return c.json({ found: false, src, dst, max_hops: maxHops });

  // Hydrate entity names along the path
  const top  = rows[0] as unknown as { path: number[]; hops: number };
  const path = top.path;
  const nodes = await sql<Array<{ id: number; kind: string; name: string }>>`
    SELECT id, kind, name
    FROM ${sql(project.schema_name)}.entities
    WHERE id = ANY(${path}::bigint[])
  `;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hydrated = path.map((id) => byId.get(id));

  return c.json({
    found: true,
    src,
    dst,
    hops: top.hops,
    path: hydrated,
  });
});

// ─── POST /semantic-neighbors — hybrid retrieval ─────────────────────────
/**
 * The killer move: vector search finds seed entities, then we walk the
 * graph N hops out, scoring each reached entity by:
 *
 *     score = MAX(vector_sim * decay^hops)
 *
 * Returns top-K by score. This is what pure vector search misses — entities
 * that ARE related but don't embed similarly to the query.
 */
interface SemanticBody {
  embedding?: number[];     // 1536-dim, required
  seed_k?:    number;       // how many vector seeds to start from (default 10, max 50)
  hops?:      number;       // graph hops out from each seed (default 2, max 4)
  decay?:     number;       // multiplier per hop (default 0.5)
  limit?:     number;       // final result cap (default 50, max 200)
  kind?:      string;       // optional entity kind filter on final results
}

route.post("/semantic-neighbors", async (c) => {
  const project = c.get("project");
  await ensureGraphTables(project.schema_name);

  let body: SemanticBody;
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const emb = body.embedding;
  if (!emb || !Array.isArray(emb) || emb.length === 0) {
    return c.json({ error: "embedding (number[]) is required" }, 400);
  }
  const seedK = Math.min(Math.max(body.seed_k ?? 10, 1), 50);
  const hops  = Math.min(Math.max(body.hops   ?? 2, 0), 4);
  const decay = body.decay ?? 0.5;
  const limit = Math.min(Math.max(body.limit  ?? 50, 1), 200);
  const kind  = body.kind;

  const embStr = `[${emb.join(",")}]`;

  const kindFilter = kind ? `AND e.kind = $5` : "";
  const params: Array<string | number | boolean | null> = [embStr, seedK, hops, decay];
  if (kind) params.push(kind);

  const rows = await sql.unsafe(
    `
    WITH seeds AS (
      SELECT id, (1 - (embedding <=> $1::vector))::float8 AS sim, 0 AS hops
      FROM "${project.schema_name}".entities
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    ),
    walk AS (
      SELECT id, sim, hops FROM seeds
      UNION
      SELECT e.id, w.sim, w.hops + 1
      FROM walk w
      JOIN "${project.schema_name}".relations r
        ON (r.src_id = w.id OR r.dst_id = w.id)
      JOIN "${project.schema_name}".entities e
        ON e.id = CASE WHEN r.src_id = w.id THEN r.dst_id ELSE r.src_id END
      WHERE w.hops < $3
    ),
    ranked AS (
      SELECT id, MAX(sim * POWER($4::float8, hops::float8)) AS score
      FROM walk
      GROUP BY id
    )
    SELECT e.id, e.kind, e.name, e.properties, r.score::float8 AS score
    FROM ranked r
    JOIN "${project.schema_name}".entities e ON e.id = r.id
    WHERE TRUE ${kindFilter}
    ORDER BY r.score DESC
    LIMIT ${limit}
    `,
    params,
  );
  return c.json({
    seed_k: seedK,
    hops,
    decay,
    count: rows.length,
    matches: rows,
  });
});

// ─── DELETE /entities/:id ────────────────────────────────────────────────
route.delete("/entities/:id", async (c) => {
  const project = c.get("project");
  await ensureGraphTables(project.schema_name);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);
  const rows = await sql.unsafe(
    `DELETE FROM "${project.schema_name}".entities WHERE id = $1 RETURNING id`,
    [id],
  );
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true, id });
});

route.delete("/relations/:id", async (c) => {
  const project = c.get("project");
  await ensureGraphTables(project.schema_name);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);
  const rows = await sql.unsafe(
    `DELETE FROM "${project.schema_name}".relations WHERE id = $1 RETURNING id`,
    [id],
  );
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true, id });
});

// ─── helpers ─────────────────────────────────────────────────────────────

/**
 * Resolve an entity reference. Accepts:
 *   - a numeric id (3, 42, ...)
 *   - a "kind:name" string ("person:vitalik", "token:MNEME")
 * Returns the entity id, or null if not found.
 */
async function resolveEntityRef(schema: string, ref: unknown): Promise<number | null> {
  if (typeof ref === "number" && Number.isInteger(ref) && ref > 0) {
    const rows = await sql.unsafe(
      `SELECT id FROM "${schema}".entities WHERE id = $1`,
      [ref],
    );
    return rows.length ? (rows[0] as unknown as { id: number }).id : null;
  }
  if (typeof ref === "string" && ref.includes(":")) {
    const idx  = ref.indexOf(":");
    const kind = ref.slice(0, idx);
    const name = ref.slice(idx + 1);
    const rows = await sql.unsafe(
      `SELECT id FROM "${schema}".entities WHERE kind = $1 AND name = $2`,
      [kind, name],
    );
    return rows.length ? (rows[0] as unknown as { id: number }).id : null;
  }
  return null;
}

export { route as graphRoute };
