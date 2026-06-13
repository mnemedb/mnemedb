/**
 * Mneme Beam — real-time SSE feed of every schema write.
 *
 * Trigger functions on every default + stream table call pg_notify on the
 * 'mneme_beam' channel with { schema, table, op, id, ts }. One Postgres
 * LISTEN connection (started at gateway boot) demuxes by schema and
 * forwards each event to all matching SSE subscribers.
 *
 *   GET /v1/beam              tail your own schema (SSE)
 *
 * Payload format (one line per event):
 *
 *   data: {"schema":"agent_handle","table":"memories","op":"INSERT","id":"42","ts":"…"}
 *
 * Keep-alive comment lines (`: ping`) are emitted every 25s so reverse
 * proxies don't time the connection out.
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ensureBeamTriggers } from "../db";
import { subscribeToBeam } from "../worker/beamHub";

const route = new Hono();

route.get("/", async (c) => {
  const project = c.get("project");
  await ensureBeamTriggers(project.schema_name);

  return streamSSE(c, async (stream) => {
    // Send a small welcome event so the client knows the channel is hot.
    await stream.writeSSE({
      event: "ready",
      data: JSON.stringify({
        schema: project.schema_name,
        ts:     new Date().toISOString(),
      }),
    });

    // Subscribe — every matching event flows through the queue.
    const queue: string[]               = [];
    let   wake:  (() => void) | undefined;
    const unsubscribe = subscribeToBeam(project.schema_name, (payload) => {
      queue.push(payload);
      wake?.();
    });

    // Keep-alive ticker: send a comment every 25s (reverse-proxy timeout-safe).
    const keepalive = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" }).catch(() => { /* aborted */ });
    }, 25_000);

    // Tear-down on abort
    stream.onAbort(() => {
      unsubscribe();
      clearInterval(keepalive);
      wake?.();
    });

    // Drain loop — wait, flush, repeat
    try {
      while (!stream.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => { wake = resolve; });
          continue;
        }
        const payload = queue.shift()!;
        await stream.writeSSE({ event: "row", data: payload });
      }
    } finally {
      unsubscribe();
      clearInterval(keepalive);
    }
  });
});

export { route as beamRoute };
