/**
 * Mneme Beam · listen hub.
 *
 * One Postgres LISTEN connection per gateway process. Every notification
 * on the 'mneme_beam' channel is parsed, the schema field is read, and
 * the payload is forwarded to every subscriber registered for that
 * schema. Subscribers are simple callback closures registered by the
 * SSE route.
 *
 * Auto-reconnects on disconnect. Safe to start before any subscriber
 * exists — the buffer is empty, no events get dropped.
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;

type Subscriber = (payload: string) => void;

/** schema_name → set of subscribers */
const subs = new Map<string, Set<Subscriber>>();

let listenSql: ReturnType<typeof postgres> | undefined;
let started   = false;

export function startBeamHub() {
  if (started) return;
  if (!DATABASE_URL) {
    console.error("[beam] DATABASE_URL not set, hub disabled");
    return;
  }
  started = true;
  console.log("[beam] hub starting");
  void runHub();
}

export function subscribeToBeam(schema: string, cb: Subscriber): () => void {
  let set = subs.get(schema);
  if (!set) {
    set = new Set();
    subs.set(schema, set);
  }
  set.add(cb);
  return () => {
    const s = subs.get(schema);
    if (!s) return;
    s.delete(cb);
    if (s.size === 0) subs.delete(schema);
  };
}

async function runHub() {
  // Keep trying — back off on errors so we don't hammer the DB.
  let backoff = 1_000;
  while (started) {
    try {
      listenSql = postgres(DATABASE_URL!, {
        max:                    1,
        idle_timeout:           0,           // never close
        max_lifetime:           60 * 30,     // recycle every 30 min
        connect_timeout:        20,
        publications:           "",          // no logical pub needed
      });

      await listenSql.listen("mneme_beam", (payloadStr) => {
        if (!payloadStr) return;
        let schema: string;
        try {
          const obj = JSON.parse(payloadStr) as { schema?: string };
          schema = obj.schema ?? "";
        } catch {
          return;
        }
        const set = subs.get(schema);
        if (!set || set.size === 0) return;
        for (const cb of set) {
          try { cb(payloadStr); } catch { /* subscriber crashed, ignore */ }
        }
      });
      console.log("[beam] LISTEN mneme_beam established");
      backoff = 1_000;

      // Keep alive — the listen() returns a promise that resolves on close.
      await new Promise((resolve) => {
        const tick = setInterval(() => {
          if (!started) { clearInterval(tick); resolve(undefined); }
        }, 5_000);
      });
    } catch (e) {
      console.error("[beam] hub error:", (e as Error).message);
    } finally {
      try { await listenSql?.end({ timeout: 1 }); } catch { /* */ }
      listenSql = undefined;
    }

    if (!started) return;
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 30_000);
  }
}

export function stopBeamHub() {
  started = false;
}
