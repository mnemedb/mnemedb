/**
 * Shared dream generation pipeline — used by BOTH the manual POST
 * /v1/dreams/generate route AND the scheduled background worker.
 *
 * Extracted to its own module so the worker can import it without
 * pulling in the Hono route handler (and to avoid a circular import
 * worker → routes/dreams → worker).
 */
import { sql } from "../db";

const FAL_API_KEY = process.env.FAL_API_KEY;
const FAL_MODEL   = process.env.FAL_MODEL ?? "anthropic/claude-sonnet-4.5";

interface ParsedDream {
  kind:    "pattern" | "question" | "gap" | "synthesis" | string;
  title:   string;
  body:    string;
  sources?: string[];
}

/** Returns number of dreams inserted (0 if no data / LLM failed silently). */
export async function generateAndInsertDreams(
  _projectId: number,
  schema: string,
  maxDreams: number,
): Promise<number> {
  if (!FAL_API_KEY) return 0;

  const ctx = await buildDreamContext(schema);
  if (ctx.totalRecords === 0) return 0;

  let dreams: ParsedDream[];
  try {
    dreams = await callDreamLlm(ctx.text, undefined, maxDreams);
  } catch (e) {
    console.error(`[dreams.runner] LLM failed for ${schema}:`, (e as Error).message);
    return 0;
  }

  let inserted = 0;
  for (const d of dreams) {
    try {
      await sql`
        INSERT INTO ${sql(schema)}.dreams (kind, title, body, sources, model)
        VALUES (${d.kind}, ${d.title}, ${d.body}, ${JSON.stringify(d.sources ?? [])}::jsonb, ${FAL_MODEL})
      `;
      inserted++;
    } catch (e) {
      console.error(`[dreams.runner] insert failed for ${schema}:`, (e as Error).message);
    }
  }
  return inserted;
}

// ─── Context builder (duplicate of routes/dreams.ts — kept local for clarity) ──
interface DreamContext { text: string; totalRecords: number }

export async function buildDreamContext(schema: string): Promise<DreamContext> {
  const sections: string[] = [];
  let total = 0;

  try {
    const mems = await sql.unsafe(
      `SELECT id, text FROM "${schema}".memories ORDER BY created_at DESC LIMIT 15`,
    ) as unknown as Array<{ id: number; text: string }>;
    if (mems.length) {
      total += mems.length;
      sections.push(`MEMORIES (${mems.length} recent):\n${mems
        .map((m) => `  [memory:${m.id}] ${truncate(m.text, 220)}`).join("\n")}`);
    }
  } catch { /* */ }

  try {
    const docs = await sql.unsafe(
      `SELECT id, title, substring(body, 1, 200) AS snippet FROM "${schema}".documents ORDER BY created_at DESC LIMIT 8`,
    ) as unknown as Array<{ id: number; title: string; snippet: string }>;
    if (docs.length) {
      total += docs.length;
      sections.push(`DOCUMENTS (${docs.length} recent):\n${docs
        .map((d) => `  [doc:${d.id}] ${d.title ?? "(untitled)"} — ${truncate(d.snippet, 160)}`).join("\n")}`);
    }
  } catch { /* */ }

  try {
    const ents = await sql.unsafe(
      `SELECT id, kind, name FROM "${schema}".entities ORDER BY created_at DESC LIMIT 25`,
    ) as unknown as Array<{ id: number; kind: string; name: string }>;
    if (ents.length) {
      total += ents.length;
      sections.push(`ENTITIES (${ents.length} recent):\n${ents
        .map((e) => `  [entity:${e.id}] ${e.kind}:${e.name}`).join("\n")}`);
    }
  } catch { /* */ }

  try {
    const rels = await sql.unsafe(
      `SELECT r.id, r.kind, s.kind AS src_kind, s.name AS src_name,
              d.kind AS dst_kind, d.name AS dst_name
       FROM "${schema}".relations r
       JOIN "${schema}".entities s ON s.id = r.src_id
       JOIN "${schema}".entities d ON d.id = r.dst_id
       ORDER BY r.created_at DESC LIMIT 25`,
    ) as unknown as Array<{
      id: number; kind: string;
      src_kind: string; src_name: string; dst_kind: string; dst_name: string;
    }>;
    if (rels.length) {
      total += rels.length;
      sections.push(`RELATIONS (${rels.length} recent):\n${rels
        .map((r) => `  [rel:${r.id}] ${r.src_kind}:${r.src_name} ─[${r.kind}]→ ${r.dst_kind}:${r.dst_name}`).join("\n")}`);
    }
  } catch { /* */ }

  return { text: sections.join("\n\n"), totalRecords: total };
}

// ─── LLM ────────────────────────────────────────────────────────────────
const SYSTEM = `You are the Dream worker for Mneme — an agent-native database. Once per cycle you read a project's recent data and surface NON-OBVIOUS observations:

  pattern   — a co-occurrence / repetition / cluster the user might have missed
  question  — something the data implies that's worth investigating
  gap       — data that's missing but likely useful given what IS there
  synthesis — a one-paragraph narrative across the recent window

You are not summarizing. The user already knows what they wrote. You are reflecting — surfacing what they might NOT have noticed.

Output STRICTLY as a JSON array, no prose around it. Each element:

  { "kind": "pattern" | "question" | "gap" | "synthesis",
    "title": "≤72 chars, no period at end",
    "body":  "2-4 sentences, plain prose, terminal-friendly (~72 cols/line), no markdown headers",
    "sources": ["entity:<id>", "memory:<id>", "rel:<id>", ...]   // optional }

Mix kinds. If the data is sparse, prefer 'question' and 'gap' over inventing patterns.`;

export async function callDreamLlm(context: string, hint: string | undefined, max: number): Promise<ParsedDream[]> {
  const userMsg =
    `Generate ${max} dreams from this project data.${hint ? `\n\nUser hint: ${hint}` : ""}\n\n` +
    `--- PROJECT DATA ---\n${context}\n--- END ---\n\nJSON array:`;

  const res = await fetch("https://fal.run/openrouter/router", {
    method:  "POST",
    headers: {
      "content-type":  "application/json",
      "authorization": `Key ${FAL_API_KEY}`,
    },
    body: JSON.stringify({
      prompt:      `${SYSTEM}\n\n${userMsg}`,
      model:       FAL_MODEL,
      temperature: 0.5,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`fal ${res.status}: ${err.slice(0, 200)}`);
  }
  const json = await res.json() as { output?: string; text?: string; choices?: Array<{ message?: { content?: string } }> };
  const raw  = (json.output ?? json.text ?? json.choices?.[0]?.message?.content ?? "").trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

  const startIdx = cleaned.indexOf("[");
  const endIdx   = cleaned.lastIndexOf("]");
  if (startIdx < 0 || endIdx <= startIdx) throw new Error("LLM did not return a JSON array");
  const parsed = JSON.parse(cleaned.slice(startIdx, endIdx + 1)) as Array<Record<string, unknown>>;

  return parsed.slice(0, max).map((d): ParsedDream => ({
    kind:    String(d.kind  ?? "synthesis"),
    title:   String(d.title ?? "(untitled)").slice(0, 200),
    body:    String(d.body  ?? ""),
    sources: Array.isArray(d.sources) ? (d.sources as unknown[]).map(String).slice(0, 30) : [],
  })).filter((d) => d.body.length > 0);
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
