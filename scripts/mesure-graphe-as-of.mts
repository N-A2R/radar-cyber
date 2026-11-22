#!/usr/bin/env -S npx tsx
/**
 * Reproducible latency measurement of a three-year temporal graph query.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     pnpm mesure:graphe-as-of
 *   DATABASE_URL=... pnpm mesure:graphe-as-of --json=bench/results/graphe-as-of.json
 *
 * Each sample issues the same queries as GET /api/graph/as-of?window=3y at a
 * different date of the three-year window. Only opaque ids, timestamps and
 * aggregate counters are read; no victim data is touched.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { queryGraphAsOf } from "../apps/api/src/graph/as-of.js";
import { closePools, query } from "../apps/api/src/db.js";

const OBJECTIVE_MS = 100;
const END = process.env.AS_OF_END ?? "2026-11-22T00:00:00.000Z";
const argv = process.argv.slice(2);
const output =
  argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
  "bench/results/graphe-as-of.json";

function percentile(sorted: number[], fraction: number): number {
  const rank = Math.ceil(fraction * sorted.length) - 1;
  return sorted[Math.max(0, rank)]!;
}

function dates(): string[] {
  const start = new Date(END);
  start.setUTCFullYear(start.getUTCFullYear() - 3);
  const samples: string[] = [];
  for (let i = 0; i <= 36; i++) {
    const at = new Date(start);
    at.setUTCMonth(start.getUTCMonth() + i);
    samples.push(at.toISOString());
  }
  return samples;
}

try {
  const baseline = await query<{ orgs: string; sources: string; events: string; relations: string }>(
    `SELECT (SELECT count(*)::text FROM org) AS orgs,
            (SELECT count(*)::text FROM source) AS sources,
            (SELECT count(*)::text FROM event) AS events,
            (SELECT count(*)::text FROM graph_relation) AS relations`,
  );
  const indexes = await query<{ name: string }>(
    `SELECT indexname AS name FROM pg_indexes
      WHERE tablename = 'graph_relation' AND indexname = 'graph_relation_period_idx'`,
  );
  if (indexes.rows.length !== 1) {
    throw new Error("graph_relation_period_idx is missing: run db/migrate-071-graphe-as-of.sql");
  }

  const samples = dates();
  await queryGraphAsOf({ at: END, windowYears: 3, limit: 200 });
  const latencies: number[] = [];
  for (const at of samples) {
    const started = performance.now();
    const result = await queryGraphAsOf({ at, windowYears: 3, limit: 200 });
    latencies.push(performance.now() - started);
    if (result.summary.changes === null) throw new Error("three-year window was not evaluated");
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  const max = sorted[sorted.length - 1]!;

  const result = {
    command: "DATABASE_URL=postgres://radar:radar@localhost:5433/radar pnpm mesure:graphe-as-of",
    measuredAt: new Date().toISOString(),
    objective: { description: "3-year temporal graph query", budgetMs: OBJECTIVE_MS },
    window: { from: samples[0], to: END, years: 3 },
    baseline: Object.fromEntries(
      Object.entries(baseline.rows[0]!).map(([key, value]) => [key, Number(value)]),
    ),
    samples: latencies.length,
    latencyMs: {
      p50: Number(p50.toFixed(2)),
      p95: Number(p95.toFixed(2)),
      max: Number(max.toFixed(2)),
    },
    objectiveMet: p95 < OBJECTIVE_MS,
    index: indexes.rows[0]!.name,
  };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `3-year graph query: p50 ${result.latencyMs.p50} ms, p95 ${result.latencyMs.p95} ms, ` +
      `max ${result.latencyMs.max} ms over ${result.samples} dates ` +
      `(objective < ${OBJECTIVE_MS} ms: ${result.objectiveMet ? "met" : "not met"})`,
  );
  console.log(`written: ${output}`);
  if (!result.objectiveMet) process.exitCode = 1;
} finally {
  await closePools();
}
