/**
 * Reproducible measurement of the per-API-key rate limiter.
 *
 *   pnpm mesure:quotas-cles
 *   pnpm mesure:quotas-cles --json=bench/results/quotas-cles-mesures.json
 *
 * Uses a throwaway PostgreSQL database created by the standard test helper:
 * no production data, no network, no paid service. Every request goes through
 * the real Fastify route, the real API-key resolver and the atomic SQL quota.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { createTestDatabase, dropTestDatabase, type TestDb } from "../apps/api/test/helpers/testdb.js";

const output = process.argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length)
  ?? "bench/results/quotas-cles-mesures.json";
const KEY_COUNT = 10;
const QUOTA = 40;
const REQUESTS_PER_KEY = QUOTA * 2;
const WINDOW_SECONDS = 60;

const reference = JSON.parse(
  readFileSync(new URL("../bench/results/auto-repair-na.json", import.meta.url), "utf8"),
) as { referenceState: { organisations: number; sources: number; events: number; observedAt: string } };
const coverage = JSON.parse(
  readFileSync(new URL("../bench/results/couverture-mesuree.json", import.meta.url), "utf8"),
) as { base: { evenements: number } };

let db: TestDb | null = null;
let app: FastifyInstance | null = null;
let closePools: (() => Promise<void>) | null = null;

try {
  db = await createTestDatabase();
  // db.ts reads DATABASE_URL at import time: set it before loading the app.
  process.env.DATABASE_URL = db.url;

  const [appModule, dbModule, keyModule] = await Promise.all([
    import("../apps/api/src/app.js"),
    import("../apps/api/src/db.js"),
    import("../apps/api/src/api-key.js"),
  ]);
  ({ closePools } = dbModule);

  const email = `quota-measure-${process.pid}@bench.test`;
  const user = await dbModule.query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','admin') RETURNING id",
    [email],
  );
  const userId = user.rows[0]!.id;
  const keys: { id: number; value: string }[] = [];
  for (let index = 0; index < KEY_COUNT; index++) {
    const value = keyModule.generateApiKey();
    const inserted = await dbModule.query<{ id: number }>(
      `INSERT INTO api_key (user_id, name, key_hash, key_prefix, scope, quota)
       VALUES ($1, $2, $3, $4, 'read', $5) RETURNING id`,
      [userId, `measure-${index}`, keyModule.hashApiKey(value), value.slice(0, 12), QUOTA],
    );
    keys.push({ id: inserted.rows[0]!.id, value });
  }

  app = await appModule.buildApp();
  await app.ready();

  const startedAt = performance.now();
  const outcomes = await Promise.all(
    keys.flatMap((key, index) =>
      Array.from({ length: REQUESTS_PER_KEY }, () =>
        app!.inject({
          method: "GET",
          url: "/api/v1/health",
          headers: { "x-api-key": key.value },
        }).then((response) => ({ index, response })),
      ),
    ),
  );
  const elapsedMs = performance.now() - startedAt;

  let accepted = 0;
  let rejected = 0;
  let headersVerified = 0;
  const acceptedByKey = new Array<number>(KEY_COUNT).fill(0);
  for (const { index, response } of outcomes) {
    const limit = Number(response.headers["ratelimit-limit"]);
    const remaining = Number(response.headers["ratelimit-remaining"]);
    const reset = Number(response.headers["ratelimit-reset"]);
    const retryAfter = response.headers["retry-after"];
    const headersOk = limit === QUOTA
      && Number.isInteger(remaining) && remaining >= 0 && remaining < QUOTA
      && Number.isInteger(reset) && reset >= 0 && reset <= WINDOW_SECONDS
      && (response.statusCode === 200 ? retryAfter === undefined : Number(retryAfter) >= 1);
    if (headersOk) headersVerified++;
    if (response.statusCode === 200) {
      accepted++;
      acceptedByKey[index]++;
    } else if (response.statusCode === 429) {
      rejected++;
    }
  }
  const overflows = acceptedByKey.filter((count) => count > QUOTA).length;
  const expected = KEY_COUNT * QUOTA;
  const verified = accepted === expected && rejected === expected
    && overflows === 0 && headersVerified === outcomes.length;

  const result = {
    generatedAt: new Date().toISOString(),
    command: "pnpm mesure:quotas-cles",
    baseline: {
      organisations: reference.referenceState.organisations,
      sources: reference.referenceState.sources,
      events: reference.referenceState.events,
      eventsInWindow: coverage.base.evenements,
      provenance: "bench/results/auto-repair-na.json, bench/results/couverture-mesuree.json",
    },
    method: {
      transport: "Fastify inject (no network)",
      keys: KEY_COUNT,
      quotaPerKey: QUOTA,
      windowSeconds: WINDOW_SECONDS,
      requestsPerKey: REQUESTS_PER_KEY,
      concurrency: outcomes.length,
    },
    measurement: {
      requests: outcomes.length,
      accepted,
      rejected,
      overflows,
      headersVerified,
      elapsedMs: Math.round(elapsedMs),
      requestsPerSecond: Math.round((outcomes.length * 1000) / elapsedMs),
    },
    verdict: verified ? "enforced" : "not enforced",
  };

  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `${result.verdict}: ${accepted + rejected} requests — ${accepted} accepted / ${rejected} rejected ` +
      `— ${result.measurement.requestsPerSecond} req/s — ${overflows} overflow(s) across ${KEY_COUNT} keys ` +
      `(quota ${QUOTA}/${WINDOW_SECONDS}s, ${headersVerified} headers verified)`,
  );
  console.log(JSON.stringify(result, null, 2));
  if (!verified) process.exitCode = 1;
} finally {
  if (app) await app.close();
  if (closePools) await closePools();
  if (db) await dropTestDatabase(db);
}
