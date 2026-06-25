/**
 * Mneme Crystal — public agent profile.
 *
 * Public, NO AUTH. Returns sanitized profile data for any handle.
 *
 *   GET /profile/:handle           full profile (stats + graph)
 *   GET /profile/:handle/graph     just the entities + relations payload
 *
 * Privacy: only public-safe fields. Memories text → counts only.
 * Entities + relations are exposed by default because they're the
 * "shareable shape" of the agent's mind. Future: opt-in per project.
 */
import { Hono } from "hono";
import { sql, getProjectByHandle } from "../db";

const route = new Hono();

const MAX_NODES = 80;
const MAX_EDGES = 150;

route.get("/:handle", async (c) => {
  const handle = c.req.param("handle").toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(handle)) {
    return c.json({ error: "invalid handle" }, 400);
  }
  const project = await getProjectByHandle(handle);
  if (!project) return c.json({ error: "not found" }, 404);

  // Pull stats from every default table — table-may-not-exist tolerant.
  const stats = await getStats(project.schema_name);
  const graph = await getGraph(project.schema_name);
  const recentEntities = await getRecentEntities(project.schema_name);
  const recentDreams   = await getRecentDreamsPublic(project.schema_name);

  return c.json({
    handle:       project.handle,
    schema:       project.schema_name,
    wallet:       project.owner_wallet,
    fork_url:     `https://mnemedb.dev/m/${project.handle}/fork`,
    profile_url:  `https://mnemedb.dev/m/${project.handle}`,
    stats,
    graph,
    recent_entities: recentEntities,
    recent_dreams:   recentDreams,
  });
});

route.get("/:handle/graph", async (c) => {
  const handle = c.req.param("handle").toLowerCase();
  if (!/^[a-z0-9_]{3,32}$/.test(handle)) {
    return c.json({ error: "invalid handle" }, 400);
  }
  const project = await getProjectByHandle(handle);
  if (!project) return c.json({ error: "not found" }, 404);
  const graph = await getGraph(project.schema_name);
  return c.json(graph);
});

// ─── helpers ─────────────────────────────────────────────────────────────

async function getStats(schema: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const tables = ["memories", "documents", "events", "kvs", "entities", "relations", "dreams", "mandates"];
  for (const t of tables) {
    try {
      const rows = await sql.unsafe(
        `SELECT count(*)::int AS n FROM "${schema}"."${t}"`,
      ) as unknown as Array<{ n: number }>;
      out[t] = rows[0]?.n ?? 0;
    } catch {
      out[t] = 0;
    }
  }
  // Mesh aggregate (across all listings for this project)
  try {
    const mesh = await sql<Array<{ listings: string; queries: string; revenue: string }>>`
      SELECT COUNT(*)::text                                  AS listings,
             COALESCE(SUM(query_count), 0)::text             AS queries,
             COALESCE(SUM(revenue_usdc), 0)::text            AS revenue
      FROM _mneme_mesh_listings WHERE project_id = (
        SELECT id FROM _mneme_projects WHERE schema_name = ${schema}
      ) AND active = true
    `;
    out.mesh_listings = Number(mesh[0]?.listings ?? 0);
    out.mesh_queries  = Number(mesh[0]?.queries  ?? 0);
    out.mesh_revenue  = Number(mesh[0]?.revenue  ?? 0);
  } catch { /* */ }
  return out;
}

interface GraphNode { id: number; kind: string; name: string; weight?: number }
interface GraphLink { source: number; target: number; kind: string }

async function getGraph(schema: string): Promise<{ nodes: GraphNode[]; links: GraphLink[] }> {
  try {
    // Top entities by relation degree (most connected = most interesting)
    const rows = await sql.unsafe(
      `WITH degree AS (
         SELECT e.id, e.kind, e.name,
                COALESCE(c1.cnt, 0) + COALESCE(c2.cnt, 0) AS deg
         FROM "${schema}".entities e
         LEFT JOIN (SELECT src_id AS id, COUNT(*) AS cnt FROM "${schema}".relations GROUP BY src_id) c1 ON c1.id = e.id
         LEFT JOIN (SELECT dst_id AS id, COUNT(*) AS cnt FROM "${schema}".relations GROUP BY dst_id) c2 ON c2.id = e.id
       )
       SELECT id, kind, name, deg::int AS weight
       FROM degree
       ORDER BY deg DESC, id DESC
       LIMIT $1`,
      [MAX_NODES],
    ) as unknown as GraphNode[];

    const nodeIds = new Set(rows.map((r) => r.id));
    if (nodeIds.size === 0) return { nodes: [], links: [] };

    const linkRows = await sql.unsafe(
      `SELECT src_id::int AS source, dst_id::int AS target, kind
       FROM "${schema}".relations
       WHERE src_id = ANY($1::bigint[]) AND dst_id = ANY($1::bigint[])
       ORDER BY id DESC
       LIMIT $2`,
      [Array.from(nodeIds), MAX_EDGES],
    ) as unknown as GraphLink[];

    return { nodes: rows, links: linkRows };
  } catch {
    return { nodes: [], links: [] };
  }
}

async function getRecentEntities(schema: string): Promise<Array<{ id: number; kind: string; name: string; created_at: Date }>> {
  try {
    return await sql.unsafe(
      `SELECT id, kind, name, created_at FROM "${schema}".entities ORDER BY created_at DESC LIMIT 10`,
    ) as unknown as Array<{ id: number; kind: string; name: string; created_at: Date }>;
  } catch { return []; }
}

async function getRecentDreamsPublic(schema: string): Promise<Array<{ id: number; kind: string; title: string; created_at: Date }>> {
  try {
    // Public dream feed: title + kind only (no body — body could be sensitive)
    return await sql.unsafe(
      `SELECT id, kind, title, created_at FROM "${schema}".dreams ORDER BY created_at DESC LIMIT 5`,
    ) as unknown as Array<{ id: number; kind: string; title: string; created_at: Date }>;
  } catch { return []; }
}

export { route as profileRoute };
