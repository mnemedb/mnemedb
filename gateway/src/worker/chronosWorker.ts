/**
 * Mneme Chronos worker — periodic auto-anchoring.
 *
 * Every CHRONOS_TICK_MS (default 6h) walk all projects and anchor any
 * schema whose journal grew since its last anchor. Cheap when idle: one
 * MAX(id) probe per project, anchor only when there is new material.
 */
import { sql } from "../db";
import { createAnchor } from "../chronos";

const TICK_MS = Number(process.env.CHRONOS_TICK_MS ?? 6 * 60 * 60 * 1000);

let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function startChronosWorker() {
  if (process.env.CHRONOS_WORKER_ENABLED === "false") {
    console.log("[chronos] worker disabled via CHRONOS_WORKER_ENABLED=false");
    return;
  }
  if (running) return;
  running = true;
  console.log(`[chronos] worker starting · tick ${TICK_MS}ms`);
  void loop();
}

export function stopChronosWorker() {
  running = false;
  if (timer) clearTimeout(timer);
}

async function loop() {
  while (running) {
    try {
      await tick();
    } catch (e) {
      console.error("[chronos] tick failed:", (e as Error).message);
    }
    await new Promise<void>((r) => { timer = setTimeout(r, TICK_MS); });
  }
}

async function tick() {
  const projects = await sql<Array<{ schema_name: string }>>`
    SELECT schema_name FROM _mneme_projects ORDER BY id ASC LIMIT 200
  `;
  let anchored = 0;
  for (const p of projects) {
    try {
      const a = await createAnchor(p.schema_name);
      if (a) anchored++;
    } catch {
      // schema may predate chronos (no _journal yet) — ensureChronos runs
      // lazily on first API hit; skip quietly here.
    }
  }
  if (anchored > 0) console.log(`[chronos] tick complete · ${anchored} schemas anchored`);
}
