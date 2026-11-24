/**
 * Map timeline: monthly buckets and the geolocated events behind one bucket.
 *
 * The map used to receive the last 300 events of the regional feed. Most of
 * them have no coordinates, so the map showed almost no event points even
 * though the database holds thousands of dated, geolocated Nouvelle-Aquitaine
 * events. These two routes expose those events month by month, with an
 * explicit count so the scrubber never pretends a truncated page is complete.
 *
 * Region filter: a Nouvelle-Aquitaine envelope (department polygons are not
 * stored in Postgres; the web app draws the exact polygons). Sources are not
 * filtered: grey sources are allowed. No victim fields, summary or evidence
 * leave this route - only the public event title and its map geometry.
 */
import type { FastifyInstance } from "fastify";
import { badRequest } from "../errors.js";
import { query } from "../db.js";
import { evenementPublicSql } from "../security/tlp.js";

export const NA_BOUNDS = Object.freeze({ minLat: 44, maxLat: 46.6, minLon: -1.9, maxLon: 1.3 });
const REGION_FILTER = `e.lat BETWEEN $1 AND $2 AND e.lon BETWEEN $3 AND $4 AND ${evenementPublicSql("e")}`;
const EVENT_TIME = `COALESCE(e.observed_at, e.collected_at)`;
const MAX_MONTHS = 36;
const MAX_EVENTS = 2000;

type BucketRow = { key: string; count: number | string };
type CountRow = { total: number | string };
type EventRow = {
  id: number | string;
  title: string;
  family: string;
  assertionType: string;
  confidence: string | null;
  sourceId: string;
  sourceUrl: string | null;
  orgId: number | null;
  lat: number;
  lon: number;
  severity: number;
  observedAt: string | null;
};

const REGION_PARAMS = [NA_BOUNDS.minLat, NA_BOUNDS.maxLat, NA_BOUNDS.minLon, NA_BOUNDS.maxLon];

function monthBounds(key: string): { from: string; to: string } {
  const [year, month] = key.split("-").map(Number);
  const from = new Date(Date.UTC(year!, month! - 1, 1));
  const to = new Date(Date.UTC(year!, month!, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

function limitOf(raw: unknown, fallback: number): number {
  if (raw === undefined) return fallback;
  const text = Array.isArray(raw) ? raw[0] : raw;
  const value = Number(text);
  if (!Number.isInteger(value)) throw badRequest("limit must be an integer");
  return Math.min(Math.max(value, 1), MAX_EVENTS);
}

export default async function (app: FastifyInstance) {
  app.get("/map/timeline/buckets", async (req) => {
    const q = req.query as Record<string, string | string[] | undefined>;
    const rawMonths = Array.isArray(q.months) ? q.months[0] : q.months;
    const months = rawMonths === undefined ? 12 : Number(rawMonths);
    if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
      throw badRequest(`months must be an integer between 1 and ${MAX_MONTHS}`);
    }
    const r = await query<BucketRow>(
      `WITH scoped AS (
         SELECT date_trunc('month', ${EVENT_TIME} AT TIME ZONE 'UTC') AS month
         FROM event e
         WHERE ${REGION_FILTER}
           AND ${EVENT_TIME} >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - make_interval(months => $5 - 1)
           AND ${EVENT_TIME} < date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 month'
       )
       SELECT to_char(month, 'YYYY-MM') AS key, count(*)::int AS count
       FROM scoped GROUP BY month ORDER BY month`,
      [...REGION_PARAMS, months],
    );
    const buckets = r.rows.map((row) => ({ ...monthBounds(row.key), key: row.key, count: Number(row.count) }));
    return {
      buckets,
      total: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
      region: "nouvelle-aquitaine",
      bounds: NA_BOUNDS,
    };
  });

  app.get("/map/timeline/events", async (req) => {
    const q = req.query as Record<string, string | string[] | undefined>;
    const rawBucket = Array.isArray(q.bucket) ? q.bucket[0] : q.bucket;
    const bucket = rawBucket === undefined || rawBucket === "" ? "all" : rawBucket;
    const limit = limitOf(q.limit, 1000);
    const params: unknown[] = [...REGION_PARAMS];
    let window = "";
    if (bucket !== "all") {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bucket)) throw badRequest("bucket must be YYYY-MM or all");
      const { from, to } = monthBounds(bucket);
      params.push(from, to);
      window = `AND ${EVENT_TIME} >= $${params.length - 1} AND ${EVENT_TIME} < $${params.length}`;
    }
    const where = `WHERE ${REGION_FILTER} ${window}`;
    const count = await query<CountRow>(`SELECT count(*)::int AS total FROM event e ${where}`, params);
    const total = Number(count.rows[0]?.total ?? 0);
    const r = await query<EventRow>(
      `SELECT e.id, e.title, e.family, e.assertion_type AS "assertionType", e.severity,
              e.confidence, e.source_id AS "sourceId", e.source_url AS "sourceUrl",
              e.org_id AS "orgId", e.lat, e.lon, e.observed_at AS "observedAt"
       FROM event e ${where}
       ORDER BY ${EVENT_TIME} DESC, e.id DESC LIMIT $${params.length + 1}`,
      [...params, limit],
    );
    return {
      bucket,
      events: r.rows.map((row) => ({
        id: String(row.id),
        title: row.title,
        family: row.family,
        assertionType: row.assertionType,
        severity: Number(row.severity),
        confidence: row.confidence,
        sourceId: row.sourceId,
        sourceUrl: row.sourceUrl,
        orgId: row.orgId,
        lat: Number(row.lat),
        lon: Number(row.lon),
        observedAt: row.observedAt,
      })),
      total,
      truncated: total > r.rows.length,
    };
  });
}
