import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { authMiddleware } from "./auth";
import { initDb } from "./db";
import { tablesRoute } from "./routes/tables";
import { rowsRoute } from "./routes/rows";
import { vectorRoute } from "./routes/vector";
import { statsRoute } from "./routes/stats";
import { projectsPublic, projectsMe } from "./routes/projects";
import { sessionsRoute } from "./routes/sessions";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/",       (c) => c.json({ name: "mneme-gateway", version: "0.0.0" }));
app.get("/health", (c) => c.json({ ok: true }));

// PUBLIC endpoints — typed-data signature instead of session.
app.route("/projects", projectsPublic);   // CreateProject sig → project + session
app.route("/sessions", sessionsRoute);    // MnemeSession sig  → session

// AUTHED endpoints — require Bearer session OR per-request EIP-712 sig.
app.use("/v1/*", authMiddleware);
app.route("/v1/tables",      tablesRoute);
app.route("/v1/rows",        rowsRoute);
app.route("/v1/vector",      vectorRoute);
app.route("/v1/stats",       statsRoute);
app.route("/v1/projects/me", projectsMe);

await initDb();

const port = Number(process.env.PORT ?? 8787);
console.log(`mneme-gateway listening on :${port}`);
export default { port, fetch: app.fetch };
