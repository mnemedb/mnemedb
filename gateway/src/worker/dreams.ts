/**
 * Mneme Dreams worker — daily scheduled job.
 *
 * Every DREAM_TICK_MS (default 1h), walks every project. For each project
 * that has activity in the last 24h AND hasn't dreamed in the last 22h,
 * call the same internal pipeline as POST /v1/dreams/generate. Insert N
 * dreams (default 2) per project.
 *
 * Designed to coexist with the manual /generate route — both write to the
 * same dreams table. Worker is idempotent: it locks per-project via a
 * row in _mneme_projects.last_dreamed_at (added lazily on first dream).
 */
import { sql, ensureDreamsTable } from "../db";

const DREAM_TICK_MS = Number(process.env.DREAMS_TICK_MS ?? 60 * 60 * 1000);          // 1h
const DREAM_GAP_MS  = Number(process.env.DREAMS_GAP_MS  ?? 22 * 60 * 60 * 1000);     // 22h between runs
const DREAMS_PER_RUN = Number(process.env.DREAMS_PER_RUN ?? 2);

let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function startDreamsWorker() {
  if (process.env.DREAMS_WORKER_ENABLED === "false") {
    console.log("[dreams] worker disabled via DREAMS_WORKER_ENABLED=false");
    return;
  }
  if (!process.env.FAL_API_KEY) {
    console.log("[dreams] worker disabled: FAL_API_KEY not set");
    return;
  }
  if (running) return;
  running = true;
  console.log(`[dreams] worker starting · tick ${DREAM_TICK_MS}ms · gap ${DREAM_GAP_MS}ms · ${DREAMS_PER_RUN} per run`);
  void loop();
}

export function stopDreamsWorker() {
  running = false;
  if (timer) clearTimeout(timer);
}

async function loop() {
  while (running) {
    try {
      await tick();
    } catch (e) {
      console.error("[dreams] tick failed:", (e as Error).message);
    }
    await new Promise<void>((r) => { timer = setTimeout(r, DREAM_TICK_MS); });
  }
}

async function tick() {
  // Ensure column exists once per process lifetime
  await sql`
    ALTER TABLE _mneme_projects
      ADD COLUMN IF NOT EXISTS last_dreamed_at timestamptz
  `.catch(() => { /* ignore — concurrent migrations */ });

  // Candidate projects: dreamed > GAP ago (or never)
  const cutoff = new Date(Date.now() - DREAM_GAP_MS);
  const projects = await sql<Array<{ id: number; schema_name: string }>>`
    SELECT id, schema_name FROM _mneme_projects
    WHERE last_dreamed_at IS NULL OR last_dreamed_at < ${cutoff}
    ORDER BY COALESCE(last_dreamed_at, 'epoch'::timestamptz) ASC
    LIMIT 20
  `;
  if (projects.length === 0) return;

  // Lazy import — avoid circular ref by lifting the LLM call to a shared util
  const { generateAndInsertDreams } = await import("../routes/dreams.runner");

  let totalDreams = 0;
  for (const p of projects) {
    try {
      await ensureDreamsTable(p.schema_name);
      const n = await generateAndInsertDreams(p.id, p.schema_name, DREAMS_PER_RUN);
      if (n > 0) {
        totalDreams += n;
        await sql`UPDATE _mneme_projects SET last_dreamed_at = now() WHERE id = ${p.id}`;
      }
    } catch (e) {
      console.error(`[dreams] project ${p.id} failed:`, (e as Error).message);
      // still bump timestamp on errors to avoid hammering bad projects
      await sql`UPDATE _mneme_projects SET last_dreamed_at = now() WHERE id = ${p.id}`.catch(() => {});
    }
  }
  if (totalDreams > 0) {
    console.log(`[dreams] tick complete · ${projects.length} projects scanned · ${totalDreams} dreams inserted`);
  }
}
