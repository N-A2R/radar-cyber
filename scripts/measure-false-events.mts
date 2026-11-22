/**
 * Reproducible measurement of false events detected and discarded.
 *
 * Read-only by default:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-false-events.mts
 *
 * Persist the detections (requires db/migrate-064-false-events.sql):
 *   ... tsx scripts/measure-false-events.mts --apply
 *
 * The classifier is shared with the alert engine, so the reported number is
 * exactly the set of events the engine discards. No victim data is read or
 * written beyond the event id, the reason, and the relevance score.
 */
import { closePools, ingestQuery, query } from "../apps/api/src/db.js";
import { detectFalseEvent, closeAlertsForFalseEvents } from "../apps/api/src/detect/false-events.js";
type EventRow = {
  id: number;
  title: string;
  summary: string | null;
  family: string;
  org_id: number | null;
  regional: boolean;
};


const APPLY = process.argv.includes("--apply");

async function count(table: string): Promise<number> {
  const r = await query<{ n: string }>(`SELECT count(*)::text AS n FROM ${table}`);
  return Number(r.rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const events = await query<EventRow>(
    "SELECT id, title, summary, family, org_id, regional FROM event"
  );
  const detections = events.rows
    .map((event) => ({ event, verdict: detectFalseEvent(event) }))
    .filter((entry) => entry.verdict.isFalse);

  if (APPLY) {
    const CHUNK = 500;
    for (let start = 0; start < detections.length; start += CHUNK) {
      const chunk = detections.slice(start, start + CHUNK);
      await ingestQuery(
        `INSERT INTO false_event (event_id, reason, relevance_score)
         SELECT * FROM unnest($1::bigint[], $2::text[], $3::integer[])
         ON CONFLICT (event_id) DO NOTHING`,
        [
          chunk.map((d) => d.event.id),
          chunk.map((d) => d.verdict.reason),
          chunk.map((d) => d.verdict.score),
        ]
      );
      await closeAlertsForFalseEvents(
        chunk.map((d) => d.event.id),
        chunk[0].verdict.reason ?? "irrelevant_without_na_signal"
      );
    }
  }

  const byFamily: Record<string, number> = {};
  for (const { event } of detections) {
    byFamily[event.family] = (byFamily[event.family] ?? 0) + 1;
  }

  const result = {
    mode: APPLY ? "apply" : "read-only",
    organisations: await count("org"),
    sources: await count("source"),
    events: events.rows.length,
    false_detected: detections.length,
    false_discarded: await count("false_event"),
    by_family: byFamily,
  };
  console.log(JSON.stringify(result, null, 2));
}

try {
  await main();
} finally {
  await closePools();
}
