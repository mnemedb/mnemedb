import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { authMiddleware } from "./auth";
import { rateLimitMiddleware } from "./rateLimit";
import { initDb } from "./db";
import { tablesRoute } from "./routes/tables";
import { rowsRoute } from "./routes/rows";
import { vectorRoute } from "./routes/vector";
import { statsRoute } from "./routes/stats";
import { projectsPublic, projectsMe } from "./routes/projects";
import { sessionsRoute } from "./routes/sessions";
import { storageRoute } from "./routes/storage";
import { sqlRoute } from "./routes/sql";
import { serviceKeysRoute } from "./routes/serviceKeys";
import { llmRoute } from "./routes/llm";
import { streamsRoute } from "./routes/streams";
import { graphRoute } from "./routes/graph";
import { dreamsRoute } from "./routes/dreams";
import { beamRoute } from "./routes/beam";
import { meshRoute } from "./routes/mesh";
import { mandatesRoute } from "./routes/mandates";
import { profileRoute } from "./routes/profile";
import { chronosRoute } from "./routes/chronos";
import { startChainStreamsWorker } from "./worker/chainStreams";
import { startDreamsWorker } from "./worker/dreams";
import { startBeamHub } from "./worker/beamHub";
import { startChronosWorker } from "./worker/chronosWorker";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/",       (c) => c.json({ name: "mneme-gateway", version: "0.0.0" }));
app.get("/health", (c) => c.json({ ok: true }));

// PUBLIC endpoints — typed-data signature instead of session.
app.route("/projects", projectsPublic);   // CreateProject sig → project + session
app.route("/sessions", sessionsRoute);    // MnemeSession sig  → session
app.route("/profile",  profileRoute);     // public agent profiles — Mneme Crystal

// AUTHED endpoints — require Bearer session OR per-request EIP-712 sig.
app.use("/v1/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);
app.route("/v1/tables",      tablesRoute);
app.route("/v1/rows",        rowsRoute);
app.route("/v1/vector",      vectorRoute);
app.route("/v1/storage",     storageRoute);
app.route("/v1/sql",         sqlRoute);
app.route("/v1/service/keys", serviceKeysRoute);
app.route("/v1/llm",          llmRoute);
app.route("/v1/streams",      streamsRoute);
app.route("/v1/graph",        graphRoute);
app.route("/v1/dreams",       dreamsRoute);
app.route("/v1/beam",         beamRoute);
app.route("/v1/mesh",         meshRoute);
app.route("/v1/mandates",     mandatesRoute);
app.route("/v1/chronos",      chronosRoute);
app.route("/v1/stats",       statsRoute);
app.route("/v1/projects/me", projectsMe);

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
