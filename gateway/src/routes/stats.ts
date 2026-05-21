import { Hono } from "hono";
import { introspectTables } from "../db";
import type { StatusCode } from "hono/utils/http-status";

const route = new Hono();

// GET /v1/stats — per-table row counts (defaults + custom) for the agent's schema.
route.get("/", async (c) => {
  const schema = c.get("project").schema_name;

  try {
    const tables = await introspectTables(schema);
    const tableCounts: Record<string, number> = {};
    let totalRows = 0;
    let defaultCount = 0;
    let customCount  = 0;
    for (const t of tables) {
      tableCounts[t.name] = t.rowCount;
      totalRows += t.rowCount;
      if (t.isDefault) defaultCount++; else customCount++;
    }

    return c.json({
      tables: tableCounts,
      totals: {
        rows:                  totalRows,
        default_tables:        defaultCount,
        custom_tables:         customCount,
        vector_searches_today: 0,
        mneme_burned_total:    0,
      },
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500 as StatusCode);
  }
});

export { route as statsRoute };
