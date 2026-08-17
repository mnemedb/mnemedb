/**
 * Vercel serverless entry — the whole gateway behind /api/*.
 *
 * vercel.json rewrites /api/:path* to this function; the Hono root app
 * uses basePath("/api") so the original request path matches the same
 * routes the Bun server exposes at "/".
 *
 * Long-running in-process workers don't exist on serverless. Instead,
 * GET /api/cron/tick runs one iteration of each worker — wired to a
 * Vercel Cron (see vercel.json) and callable by any external pinger
 * (cron-job.org etc.) for higher frequency.
 */
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { app } from "../gateway/src/app";
import { initDb } from "../gateway/src/db";
import { startBeamHub } from "../gateway/src/worker/beamHub";
import { runChainStreamsTick } from "../gateway/src/worker/chainStreams";
import { runDreamsTick } from "../gateway/src/worker/dreams";
import { runChronosTick } from "../gateway/src/worker/chronosWorker";

// initDb once per warm instance; on failure keep serving (mirror of the
// defensive boot in gateway/src/index.ts) and retry on the next request.
let ready: Promise<void> | undefined;

const root = new Hono().basePath("/api");

root.use("*", async (_c, next) => {
  if (!ready) {
    ready = initDb().then(
      () => console.log("[boot] initDb ok"),
      (e) => {
        console.error("[boot] initDb FAILED — some endpoints may 500:", (e as Error).message);
        ready = undefined;
      },
    );
  }
  await ready;
  await next();
});

// Beam SSE needs the Postgres LISTEN hub — start it lazily, only for beam.
root.use("/v1/beam", async (_c, next) => {
  startBeamHub();
  await next();
});
root.use("/v1/beam/*", async (_c, next) => {
  startBeamHub();
  await next();
});

// One iteration of every background worker. Vercel Cron sends
// "Authorization: Bearer $CRON_SECRET" automatically when the env var is set.
root.get("/cron/tick", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (secret && c.req.header("authorization") !== `Bearer ${secret}`) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const results: Record<string, string> = {};

  if (process.env.STREAMS_WORKER_ENABLED === "false") {
    results.streams = "disabled";
  } else {
    try { await runChainStreamsTick(); results.streams = "ok"; }
    catch (e) { results.streams = `error: ${(e as Error).message}`; }
  }

  if (process.env.DREAMS_WORKER_ENABLED === "false" || !process.env.FAL_API_KEY) {
    results.dreams = "disabled";
  } else {
    try { await runDreamsTick(); results.dreams = "ok"; }
    catch (e) { results.dreams = `error: ${(e as Error).message}`; }
  }

  if (process.env.CHRONOS_WORKER_ENABLED === "false") {
    results.chronos = "disabled";
  } else {
    try { await runChronosTick(); results.chronos = "ok"; }
    catch (e) { results.chronos = `error: ${(e as Error).message}`; }
  }

  return c.json({ ok: true, results });
});

root.route("/", app);

export default handle(root);
