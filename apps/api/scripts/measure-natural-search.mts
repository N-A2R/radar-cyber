#!/usr/bin/env -S npx tsx
/**
 * Reproducible latency probe for natural-language search on the real corpus.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx apps/api/scripts/measure-natural-search.mts \
 *     --json=bench/results/NA-natural-search.json
 *
 * Read-only: the probe only issues GET requests through Fastify.inject.
 */
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { closePools, query } from "../src/db.js";
import askRoute from "../src/routes/ask.js";

const QUESTION = "quelles attaques ont touché les hôpitaux de Gironde en 2026";
const WARMUP = 2;
const REPEATS = 11;
const OBJECTIVE_MS = 2000;

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

interface Answer {
  answer: string;
  filters: { departments: string[]; years: number[]; intent: string; sector: string | null };
  hits: Array<{ id: string; source: string }>;
  counts: { total: number; liveEvents: number; frozenIncidents: number };
}

async function main(): Promise<void> {
  const jsonPath = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7)
    ?? "bench/results/NA-natural-search.json";
  const corpus = await query<{ orgs: string; events: string; sources: string }>(
    `SELECT (SELECT count(*) FROM org)::text AS orgs,
            (SELECT count(*) FROM event)::text AS events,
            (SELECT count(*) FROM source)::text AS sources`,
  );
  const counts = corpus.rows[0];
  assert.ok(Number(counts.orgs) > 1_000_000, "the probe must run on the full corpus");
  assert.ok(Number(counts.events) > 20_000, "the probe must run on the full corpus");
  assert.ok(Number(counts.sources) >= 300, "the probe must run on the full corpus");

  const app = Fastify();
  await app.register(askRoute);
  await app.ready();
  try {
    const url = `/search/ask?q=${encodeURIComponent(QUESTION)}`;
    for (let i = 0; i < WARMUP; i += 1) {
      const warm = await app.inject({ method: "GET", url });
      assert.equal(warm.statusCode, 200, warm.body);
    }
    const samples: number[] = [];
    let last: Answer | null = null;
    for (let i = 0; i < REPEATS; i += 1) {
      const start = performance.now();
      const res = await app.inject({ method: "GET", url });
      samples.push(performance.now() - start);
      assert.equal(res.statusCode, 200, res.body);
      last = res.json() as Answer;
      assert.deepEqual(last.filters.departments, ["33"]);
      assert.deepEqual(last.filters.years, [2026]);
      assert.equal(last.filters.sector, "health");
      assert.equal(last.counts.frozenIncidents, 4, `unexpected answer: ${res.body}`);
      assert.ok(last.hits.length > 0);
    }
    const measured = stats(samples);
    const answer = last as Answer;
    const result = {
      command: "DATABASE_URL=postgres://radar:radar@localhost:5433/radar apps/api/node_modules/.bin/tsx apps/api/scripts/measure-natural-search.mts --json=bench/results/NA-natural-search.json",
      measured_at: new Date().toISOString(),
      question: QUESTION,
      corpus: {
        organisations: Number(counts.orgs),
        events: Number(counts.events),
        sources: Number(counts.sources),
      },
      method: `GET /api/search/ask via Fastify inject, ${WARMUP} warmups and ${REPEATS} timed repeats, no network`,
      objective_ms: OBJECTIVE_MS,
      p50_ms: measured.p50,
      p95_ms: measured.p95,
      max_ms: measured.max,
      answer: answer.answer,
      hit_ids: answer.hits.map((hit) => hit.id),
      verdict: measured.p95 < OBJECTIVE_MS ? "PASS" : "FAIL",
    };
    writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result, null, 2));
    assert.equal(result.verdict, "PASS", `p95 ${result.p95_ms} ms exceeds ${OBJECTIVE_MS} ms`);
  } finally {
    await app.close();
    await closePools();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
