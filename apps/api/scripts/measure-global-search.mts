#!/usr/bin/env -S npx tsx
/**
 * Reproducible global-search latency probe on the real corpus.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx apps/api/scripts/measure-global-search.mts \
 *     --json=bench/results/NA-global-search.json
 *
 * Requires the schema from db/migrate-065-search-normalized.sql.
 * Read-only: no corpus rows are created, changed or deleted.
 */
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { closePools, query } from "../src/db.js";
import searchRoute from "../src/routes/search.js";

const QUERIES = [
  "hopital",
  "bordeaux",
  "hopital universitaire rennes",
  "saint pierre bordeaux",
  "ransomware nouvelle aquitaine",
];
const WARMUP = 2;
const REPEATS = 11;
const OBJECTIVE_MS = 200;

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[Math.max(0, index)].toFixed(2));
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

async function main(): Promise<void> {
  const jsonPath = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
    ?? "bench/results/NA-global-search.json";

  const corpus = await query<{ orgs: string; events: string; sources: string }>(
    `SELECT (SELECT count(*) FROM org)::text AS orgs,
            (SELECT count(*) FROM event)::text AS events,
            (SELECT count(*) FROM source)::text AS sources`,
  );
  const counts = corpus.rows[0];
  assert.ok(Number(counts.orgs) > 1_000_000, "the probe must run on the full corpus");

  const app = Fastify();
  await app.register(searchRoute);
  await app.ready();
  try {
    const perQuery: Record<string, ReturnType<typeof stats>> = {};
    const all: number[] = [];
    for (const q of QUERIES) {
      const url = `/search?q=${encodeURIComponent(q)}`;
      for (let i = 0; i < WARMUP; i += 1) {
        const warm = await app.inject({ method: "GET", url });
        assert.equal(warm.statusCode, 200, warm.body);
      }
      const samples: number[] = [];
      for (let i = 0; i < REPEATS; i += 1) {
        const start = performance.now();
        const res = await app.inject({ method: "GET", url });
        samples.push(performance.now() - start);
        assert.equal(res.statusCode, 200, res.body);
        const payload = JSON.parse(res.body) as { orgs: unknown[]; events: unknown[]; indicators: unknown[] };
        assert.ok(Array.isArray(payload.orgs) && Array.isArray(payload.events) && Array.isArray(payload.indicators));
        assert.ok(payload.orgs.length <= 50 && payload.events.length <= 50 && payload.indicators.length <= 50);
      }
      perQuery[q] = stats(samples);
      all.push(...samples);
    }
    const overall = stats(all);
    const result = {
      command: "DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx apps/api/scripts/measure-global-search.mts --json=bench/results/NA-global-search.json",
      measured_at: new Date().toISOString(),
      corpus: {
        organisations: Number(counts.orgs),
        events: Number(counts.events),
        sources: Number(counts.sources),
      },
      method: `GET /api/search via Fastify inject, ${WARMUP} warmups and ${REPEATS} timed repeats per query, no network`,
      objective_ms: OBJECTIVE_MS,
      p50_ms: overall.p50,
      p95_ms: overall.p95,
      max_ms: overall.max,
      per_query_ms: perQuery,
      verdict: overall.p95 < OBJECTIVE_MS ? "PASS" : "FAIL",
    };
    writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    assert.equal(result.verdict, "PASS", `p95 ${overall.p95} ms exceeds ${OBJECTIVE_MS} ms`);
  } finally {
    await app.close();
    await closePools();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
