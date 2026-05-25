/**
 * Quick "are there real users yet?" probe.
 * Set DATABASE_URL env var (read from gateway/.env), then run from gateway/
 * so the `postgres` package is on the resolution path.
 *
 *   $env:DATABASE_URL = "postgres://..."
 *   bun --cwd gateway run ../scripts/real-users.ts
 */
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL env var not set"); process.exit(1); }

const sql = postgres(DATABASE_URL, { max: 2, idle_timeout: 5 });

const all = await sql<Array<{ id: number; handle: string; owner_wallet: string; created_at: Date }>>`
  SELECT id, handle, owner_wallet, created_at
  FROM _mneme_projects
  ORDER BY created_at DESC
`;

const smokeOnes = all.filter((p) => p.handle.startsWith("smoke_"));
const realOnes  = all.filter((p) => !p.handle.startsWith("smoke_"));

console.log("─── total projects ─────────────────────────");
console.log(`  total          : ${all.length}`);
console.log(`  smoke tests    : ${smokeOnes.length}`);
console.log(`  real projects  : ${realOnes.length}`);

console.log("\n─── real projects (newest first) ──────────");
for (const p of realOnes) {
  const ageMin = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 60000);
  const ageStr = ageMin < 60 ? `${ageMin}m ago` : `${Math.floor(ageMin/60)}h ago`;
  console.log(`  ${p.handle.padEnd(20)} ${p.owner_wallet}  (${ageStr})`);
}

console.log("\n─── activity per real project ─────────────");
for (const p of realOnes) {
  const schema = `agent_${p.handle}`;
  try {
    const counts = await sql.unsafe(`
      SELECT
        (SELECT count(*) FROM "${schema}".memories)  AS memories,
        (SELECT count(*) FROM "${schema}".documents) AS documents,
        (SELECT count(*) FROM "${schema}".events)    AS events,
        (SELECT count(*) FROM "${schema}".kvs)       AS kvs
    `);
    const c = counts[0] as { memories: string; documents: string; events: string; kvs: string };
    const total = Number(c.memories) + Number(c.documents) + Number(c.events) + Number(c.kvs);
    const custom = await sql`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = ${schema}
        AND table_name NOT IN ('memories','documents','events','kvs')
    `;
    console.log(
      `  ${p.handle.padEnd(20)} total=${String(total).padStart(4)} ` +
      `mem=${c.memories} doc=${c.documents} evt=${c.events} kvs=${c.kvs}` +
      `  custom_tables=${(custom[0] as { n: number }).n}`
    );
  } catch (e) {
    console.log(`  ${p.handle.padEnd(20)} (error: ${(e as Error).message})`);
  }
}

await sql.end();
