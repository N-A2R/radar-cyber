/**
 * Reproducible latency probe for the shortest attack-path query.
 *
 * Runs the real Fastify route against the real database, for every group in
 * the graph, with one warm-up call per group. Read-only: no fixture is added.
 *
 *   DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar pnpm measure:attack-path
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import Fastify from "fastify";
import { closePools, query } from "../../src/db.js";
import attackPathRoute from "../../src/routes/attack-path.js";

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string =>
  argv.includes(name) ? (argv[argv.indexOf(name) + 1] ?? fallback) : fallback;
const JSON_OUT = argv.includes("--json") ? (argv[argv.indexOf("--json") + 1] ?? null) : null;
const REPEATS = Math.max(1, Number(arg("--repeats", "3")));
const GROUP_LIMIT = Math.max(0, Number(arg("--groups", "0")));

type PathBody = { found: boolean; hops: number; path: string[] };

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)].toFixed(1));
}

async function main(): Promise<void> {
  const totals = await query<{
    organizations: string; sources: string; events: string; graphEntities: string; graphRelations: string;
  }>(`SELECT
         (SELECT count(*) FROM org)::text AS organizations,
         (SELECT count(*) FROM source)::text AS sources,
         (SELECT count(*) FROM event)::text AS events,
         (SELECT count(*) FROM graph_entity)::text AS graphEntities,
         (SELECT count(*) FROM graph_relation)::text AS graphRelations`);
  const allGroups = await query<{ id: string }>(
    `SELECT id FROM graph_entity WHERE kind = 'group' ORDER BY id`,
  );
  const groups = GROUP_LIMIT === 0 ? allGroups.rows : allGroups.rows.slice(0, GROUP_LIMIT);
  if (groups.length === 0) throw new Error("no group entity in the database");

  const app = Fastify();
  await app.register(attackPathRoute, { prefix: "/api" });
  await app.ready();

  const durations: number[] = [];
  let found = 0;
  let worst: { group: string; ms: number; hops: number; found: boolean } | null = null;

  for (const group of groups) {
    const name = group.id.startsWith("group:") ? group.id.slice("group:".length) : group.id;
    for (let attempt = 0; attempt <= REPEATS; attempt++) {
      const started = performance.now();
      const res = await app.inject({
        method: "GET",
        url: `/api/attack-path?group=${encodeURIComponent(name)}`,
      });
      const ms = Number((performance.now() - started).toFixed(1));
      if (res.statusCode !== 200) throw new Error(`${group.id}: HTTP ${res.statusCode} ${res.body}`);
      if (attempt === 0) continue; // warm-up
      const body = res.json<PathBody>();
      durations.push(ms);
      if (body.found) found++;
      if (worst === null || ms > worst.ms) {
        worst = { group: group.id, ms, hops: body.hops, found: body.found };
      }
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    command: "DATABASE_URL=<real-db> pnpm measure:attack-path",
    database: Object.fromEntries(
      Object.entries(totals.rows[0]!).map(([key, value]) => [key, Number(value)]),
    ),
    groups: groups.length,
    repetitions: REPEATS,
    requests: durations.length,
    found,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: percentile(durations, 1),
    targetMs: 500,
    worst,
  };
  console.log(
    `shortest attack path | ${groups.length} groups x ${REPEATS} calls | ` +
    `p50 ${result.p50Ms} ms | p95 ${result.p95Ms} ms | max ${result.maxMs} ms | ` +
    `path found ${found}/${durations.length} | target < ${result.targetMs} ms`,
  );
  if (JSON_OUT) {
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`result: ${JSON_OUT}`);
  }
  await app.close();
  await closePools();
}

main().catch(async (err) => {
  console.error(err);
  await closePools().catch(() => {});
  process.exitCode = 1;
});
