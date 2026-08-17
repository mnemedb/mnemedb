/**
 * Bun entry — long-running server: boots DB, starts in-process workers,
 * serves the app. Vercel deploys use api/index.ts at the repo root instead.
 */
import { app } from "./app";
import { initDb } from "./db";
import { startChainStreamsWorker } from "./worker/chainStreams";
import { startDreamsWorker } from "./worker/dreams";
import { startBeamHub } from "./worker/beamHub";
import { startChronosWorker } from "./worker/chronosWorker";

// Defensive boot — if any migration or worker init fails, log loudly but
// keep the HTTP server alive so /health and existing routes still answer.
try {
  await initDb();
  console.log("[boot] initDb ok");
} catch (e) {
  console.error("[boot] initDb FAILED — gateway will start anyway, some endpoints may 500:", (e as Error).message);
}

try { startChainStreamsWorker(); console.log("[boot] chainStreamsWorker started"); }
catch (e) { console.error("[boot] chainStreamsWorker failed:", (e as Error).message); }

try { startDreamsWorker(); console.log("[boot] dreamsWorker started"); }
catch (e) { console.error("[boot] dreamsWorker failed:", (e as Error).message); }

try { startBeamHub(); console.log("[boot] beamHub started"); }
catch (e) { console.error("[boot] beamHub failed:", (e as Error).message); }

try { startChronosWorker(); console.log("[boot] chronosWorker started"); }
catch (e) { console.error("[boot] chronosWorker failed:", (e as Error).message); }

const port = Number(process.env.PORT ?? 8787);
console.log(`mneme-gateway listening on :${port}`);
export default { port, fetch: app.fetch };
