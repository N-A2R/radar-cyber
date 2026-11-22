/**
 * Reproducible measurement for the map timeline chantier.
 *
 * Reads only the database; never writes. Counts the real reference state and
 * the events the map timeline can actually navigate: dated, geolocated events
 * inside the Nouvelle-Aquitaine envelope, grouped into UTC months.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-map-timeline.mts [--write]
 */
import { writeFile } from "node:fs/promises";
import { closePools, query } from "../apps/api/src/db.js";

const BOUNDS = { minLat: 44, maxLat: 46.6, minLon: -1.9, maxLon: 1.3 };
const TIME = "COALESCE(e.observed_at, e.collected_at)";
const REGION = "e.lat BETWEEN 44 AND 46.6 AND e.lon BETWEEN -1.9 AND 1.3";
const WINDOW = `${TIME} >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '11 months'
  AND ${TIME} < date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 month'`;

type Totals = {
  organisations: number;
  sources: number;
  events: number;
  navigable_all: number;
  first_event: string | null;
  last_event: string | null;
};
type Bucket = { key: string; count: number };

const [totalsResult, bucketsResult] = await Promise.all([
  query<Totals>(
    `SELECT (SELECT count(*) FROM org)::int AS organisations,
            (SELECT count(*) FROM source)::int AS sources,
            (SELECT count(*) FROM event)::int AS events,
            count(*) FILTER (WHERE ${REGION})::int AS navigable_all,
            to_char(min(${TIME}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS first_event,
            to_char(max(${TIME}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_event
     FROM event e`,
  ),
  query<Bucket>(
    `SELECT to_char(date_trunc('month', ${TIME} AT TIME ZONE 'UTC'), 'YYYY-MM') AS key,
            count(*)::int AS count
     FROM event e
     WHERE ${REGION} AND ${WINDOW}
     GROUP BY 1 ORDER BY 1`,
  ),
]);

const totals = totalsResult.rows[0]!;
const buckets = bucketsResult.rows;
const report = {
  measuredAt: new Date().toISOString(),
  region: "nouvelle-aquitaine",
  bounds: BOUNDS,
  organisations: totals.organisations,
  sources: totals.sources,
  events: totals.events,
  navigableEventsAllDates: totals.navigable_all,
  navigableEvents12Months: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
  monthsWithEvents: buckets.length,
  largestMonth: buckets.reduce((best, bucket) => Math.max(best, bucket.count), 0),
  firstEvent: totals.first_event,
  lastEvent: totals.last_event,
  buckets,
};

const json = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv.includes("--write")) {
  await writeFile("bench/results/map-timeline.json", json);
  console.log("written: bench/results/map-timeline.json");
}
console.log(json);
await closePools();
