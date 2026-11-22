/**
 * Victim alert latency, measured on the live database.
 *
 * Two clocks are reported separately:
 *   - emission: publication of the event row (event.created_at) to creation of
 *     its alert (alert.created_at). The trigger runs in the insert transaction,
 *     so this is the latency our service controls.
 *   - source: publication announced by the source (event.observed_at) to the
 *     first sighting (least(collected_at, created_at)). This depends on the
 *     upstream feed and is reported as context, not as our own latency.
 *
 * The emission sample replays real Nouvelle-Aquitaine victim claims inside one
 * transaction that is always rolled back: the production rows are unchanged.
 * Only identifiers and timestamps leave the database; no victim title, body,
 * e-mail or person name is read or written.
 *
 * Run (no paid service, under 60 s):
 *   DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-alerte-victime.mts
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query, withClient } from "../apps/api/src/db.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUTPUT = resolve(process.env.RADAR_MEASURE_OUTPUT ?? resolve(ROOT, "bench/results/victim-alert-latency.json"));
const DEPTS_NA = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const TARGET_MS = 1000;
const WINDOW_DAYS = 7;

type RealClaim = {
  id: string;
  org_id: number;
  source_id: string;
  observed_at: Date | string;
  collected_at: Date | string;
  created_at: Date | string;
};

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] ?? 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function main(): Promise<void> {
  const counts = await query<{ n: string }>(
    `SELECT (SELECT count(*)::text FROM org) AS n
     UNION ALL SELECT (SELECT count(*)::text FROM source)
     UNION ALL SELECT (SELECT count(*)::text FROM event)`,
  );
  const [organisations, sources, events] = counts.rows.map((row) => Number(row.n));
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ organisations, sources, events }))
    .digest("hex");

  const claims = await query<RealClaim>(
    `SELECT e.id::text, e.org_id, e.source_id, e.observed_at, e.collected_at, e.created_at
       FROM event e
       JOIN org o ON o.id = e.org_id
      WHERE o.dept = ANY($1::text[])
        AND e.assertion_type = 'third_party_claim'
        AND e.family IN ('ransomware', 'leaks')
      ORDER BY e.collected_at DESC
      LIMIT 200`,
    [DEPTS_NA],
  );

  const emissions: number[] = [];
  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const claim of claims.rows) {
        const inserted = await client.query<{ id: number; created_at: Date }>(
          `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, collected_at,
                              severity, source_id, org_id, tlp)
           VALUES ($1, 'ransomware', 'third_party_claim', 'Victim claim replay', $2, $3, 5, $4, $5, 'CLEAR')
           RETURNING id, created_at`,
          [`victim-latency-replay:${randomUUID()}`, claim.observed_at, claim.collected_at, claim.source_id, claim.org_id],
        );
        const eventRow = inserted.rows[0];
        if (!eventRow) continue;
        const alert = await client.query<{ created_at: Date }>(
          "SELECT created_at FROM alert WHERE rule_id = 'victim-na' AND event_id = $1",
          [eventRow.id],
        );
        const alertAt = alert.rows[0]?.created_at;
        if (!alertAt) throw new Error("victim alert was not created during replay");
        emissions.push(Date.parse(String(alertAt)) - Date.parse(String(eventRow.created_at)));
      }
    } finally {
      await client.query("ROLLBACK");
    }
  });

  const windowStart = Date.now() - WINDOW_DAYS * 86_400_000;
  const firstSeen = (row: RealClaim): number =>
    Math.min(Date.parse(String(row.collected_at)), Date.parse(String(row.created_at)));
  const published = (row: RealClaim): number => Date.parse(String(row.observed_at));
  const bucketKey = (row: RealClaim): string =>
    `${row.source_id}:${new Date(firstSeen(row)).toISOString().slice(0, 13)}`;
  const bucketCounts = new Map<string, number>();
  for (const row of claims.rows) {
    const key = bucketKey(row);
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
  }
  const sourceLags = claims.rows
    .filter((row) => published(row) >= windowStart && published(row) <= Date.now())
    .filter((row) => firstSeen(row) >= published(row))
    .filter((row) => (bucketCounts.get(bucketKey(row)) ?? 0) < 50)
    .map((row) => (firstSeen(row) - published(row)) / 3_600_000)
    .sort((a, b) => a - b);

  const sortedEmissions = [...emissions].sort((a, b) => a - b);
  const result = {
    generatedAt: new Date().toISOString(),
    fingerprint: { organisations, sources, events, sha256: fingerprint },
    definition: "event row publication (created_at) to victim alert creation (created_at), same transaction",
    targetMs: TARGET_MS,
    emission: {
      realClaims: claims.rows.length,
      replayed: emissions.length,
      p50Ms: round(quantile(sortedEmissions, 0.5), 3),
      p90Ms: round(quantile(sortedEmissions, 0.9), 3),
      maxMs: round(sortedEmissions.at(-1) ?? 0, 3),
      withinTarget: sortedEmissions.filter((ms) => ms <= TARGET_MS).length,
    },
    sourcePublication: {
      windowDays: WINDOW_DAYS,
      count: sourceLags.length,
      p50Hours: round(quantile(sourceLags, 0.5)),
      p90Hours: round(quantile(sourceLags, 0.9)),
      withinOneHour: sourceLags.filter((h) => h <= 1).length,
    },
  };

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `emission p50 ${result.emission.p50Ms} ms on ${result.emission.replayed} real NA claims ` +
      `(max ${result.emission.maxMs} ms, target ${TARGET_MS} ms)`,
  );
  console.log(
    `source publication p50 ${result.sourcePublication.p50Hours} h on ${result.sourcePublication.count} claims (context)`,
  );
  console.log(`result: ${OUTPUT}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePools());
