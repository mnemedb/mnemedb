/**
 * LLM proxy — text-to-SQL via fal.ai openrouter/claude-sonnet-4.5.
 *
 * Used by mneme-cli (and any future Mneme-built UI that needs natural-
 * language → SQL). Keeps the fal API key on the server (never in the
 * CLI bundle), lets us per-wallet rate-limit LLM cost, and gives us a
 * pluggable layer for adding $MNEME staking → higher LLM tier later.
 *
 * Body: { prompt: string, schema?: string }   // schema = optional context string
 * Returns: { sql: string, model: string, elapsed_ms: number }
 */
import { Hono } from "hono";
import { sql as pg } from "../db";

const route = new Hono();

const FAL_API_KEY = process.env.FAL_API_KEY;
const FAL_MODEL   = process.env.FAL_MODEL ?? "anthropic/claude-sonnet-4.5";
const MAX_PROMPT_CHARS = 8000;

interface TextToSqlBody { prompt?: string; schema?: string }

route.post("/sql", async (c) => {
  if (!FAL_API_KEY) {
    return c.json({ error: "llm not configured on this gateway" }, 503);
  }

  const project = c.get("project");
  const ownSchema = project.schema_name;

  let body: TextToSqlBody;
  try { body = JSON.parse(c.get("bodyText") || "{}"); }
  catch { return c.json({ error: "invalid json" }, 400); }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return c.json({ error: "missing 'prompt'" }, 400);
  if (prompt.length > MAX_PROMPT_CHARS) {
    return c.json({ error: `prompt exceeds ${MAX_PROMPT_CHARS} chars` }, 413);
  }

  // Auto-fetch schema if client didn't provide one
  let schemaContext = body.schema;
  if (!schemaContext) {
    schemaContext = await buildSchemaContext(ownSchema);
  }

  const systemPrompt = `You are a SQL generation assistant for Mneme — an agent-native Postgres database on Base. You translate natural language into a SINGLE PostgreSQL statement.

Rules:
- Output ONLY the SQL, nothing else. No markdown fences. No commentary.
- The current schema is "${ownSchema}". Table references should be UNQUALIFIED (just \`books\`, not \`${ownSchema}.books\`).
- pgvector is installed. Vector columns can be searched with <-> (L2), <=> (cosine), <#> (inner product).
- ALL default tables have: id (bigserial PK), created_at (timestamptz). Some have updated_at.
- The 4 default tables are: memories(text, embedding), documents(title, body, embedding), events(type, payload jsonb), kvs(key, value).
- Single statement only. End with ; if needed but no second statement.
- If the user's request is ambiguous, pick the most useful interpretation. Don't ask for clarification.
- Prefer SELECT for read intents. Use RETURNING * for INSERT/UPDATE/DELETE so the user sees the affected row.
- If the user wants vector search and didn't give an embedding, leave a placeholder \`'[0.0, 0.0, ...]'::vector\` so they know to fill it in.

Current schema:
${schemaContext}`;

  const startedAt = Date.now();
  try {
    // fal.ai openrouter/router — synchronous (non-stream) for CLI use
    const res = await fetch("https://fal.run/openrouter/router", {
      method:  "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Key ${FAL_API_KEY}`,
      },
      body: JSON.stringify({
        prompt:      `${systemPrompt}\n\nUser request: ${prompt}\n\nSQL:`,
        model:       FAL_MODEL,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return c.json({
        error: `llm upstream error: ${res.status}`,
        detail: errBody.slice(0, 500),
      }, 502);
    }

    const json = await res.json() as { output?: string; text?: string; choices?: Array<{ message?: { content?: string } }> };
    // fal.ai openrouter/router returns various shapes; try common ones
    const raw =
      json.output ??
      json.text ??
      json.choices?.[0]?.message?.content ??
      "";

    let sqlOut = (raw as string).trim();
    // strip code fences if present (some models ignore "no markdown" instructions)
    sqlOut = sqlOut.replace(/^```(?:sql)?\s*/i, "").replace(/```\s*$/i, "").trim();

    if (!sqlOut) {
      return c.json({ error: "llm returned empty SQL", raw: json }, 502);
    }

    return c.json({
      sql:        sqlOut,
      model:      FAL_MODEL,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (e) {
    return c.json({
      error:      `llm request failed: ${(e as Error).message}`,
      elapsed_ms: Date.now() - startedAt,
    }, 502);
  }
});

/** Build a compact text representation of the user's schema for LLM context. */
async function buildSchemaContext(schema: string): Promise<string> {
  try {
    const rows = await pg<Array<{ table_name: string; columns: string }>>`
      SELECT
        c.table_name,
        string_agg(c.column_name || ' ' || c.udt_name, ', ' ORDER BY c.ordinal_position) AS columns
      FROM information_schema.columns c
      WHERE c.table_schema = ${schema}
      GROUP BY c.table_name
      ORDER BY c.table_name
    `;
    if (rows.length === 0) return "(no tables yet)";
    return rows.map((r) => `  ${r.table_name}(${r.columns})`).join("\n");
  } catch {
    return "(could not introspect schema)";
  }
}

export { route as llmRoute };
