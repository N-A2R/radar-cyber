/**
 * Map timeline: one assertion per observable behavior. Fixtures are created in
 * the throwaway test database; no production row is read or written.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import mapTimelineRoute from "../src/routes/map-timeline.js";

const TAG = `mt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SEPTEMBER = "2026-09-15T10:00:00.000Z";
const OCTOBER = "2026-10-05T10:00:00.000Z";
const OCTOBER_LATE = "2026-10-20T10:00:00.000Z";

let app: FastifyInstance;

type Bucket = { key: string; from: string; to: string; count: number };
type MapEvent = {
  id: string; title: string; family: string; severity: number; lat: number; lon: number;
  observedAt: string | null;
};

/** Migration 231 : un événement ne peut être supprimé qu'après copie intégrale. */
async function supprimerEvenementsDeTest(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const copies = await query<{ dedup_key: string }>(
    `INSERT INTO archive_event
       (id, dedup_key, family, assertion_type, title, summary, observed_at, collected_at,
        valid_at, at, severity, confidence, source_id, source_url, evidence, geo_type,
        lat, lon, org_id, asset_id, created_at)
     SELECT id, dedup_key, family, assertion_type, title, summary, observed_at, collected_at,
            valid_at, at, severity, confidence, source_id, source_url, evidence, geo_type,
            lat, lon, org_id, asset_id, created_at
       FROM event WHERE id = ANY($1::bigint[])
     ON CONFLICT DO NOTHING
     RETURNING dedup_key`,
    [ids],
  );
  const clefs = copies.rows.map((ligne) => ligne.dedup_key);
  await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [ids]);
  await query("DELETE FROM archive_event WHERE dedup_key = ANY($1::text[])", [clefs]);
  await query("DELETE FROM event_archive WHERE dedup_key = ANY($1::text[])", [clefs]);
}

const get = async <T>(url: string): Promise<T> => {
  const res = await app.inject({ method: "GET", url });
  assert.equal(res.statusCode, 200, res.body);
  return res.json<T>();
};

before(async () => {
  await query("INSERT INTO source (id, name, family, url) VALUES ($1,$2,'cti','https://example.invalid/map-timeline')",
    [TAG, `Map timeline source ${TAG}`]);
  for (const [key, when, lat, lon] of [
    ["septembre", SEPTEMBER, 44.84, -0.58],
    ["octobre", OCTOBER, 44.84, -0.58],
    ["octobre-tard", OCTOBER_LATE, 45.2, 0.4],
    ["hors-region", OCTOBER, 48.85, 2.35],
    ["sans-coordonnees", OCTOBER, null, null],
  ] as const) {
    await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, source_id, lat, lon, severity,
                          source_url, evidence)
       VALUES ($1,'cti','observation',$2,$3,$4,$5,$6,3,
               'https://example.invalid/map-timeline', '{"run_id":"1"}'::jsonb)`,
      [`${TAG}-${key}`, `Event ${key} ${TAG}`, when, TAG, lat, lon],
    );
  }
  app = Fastify();
  await app.register(mapTimelineRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  const evenements = await query<{ id: string }>("SELECT id::text FROM event WHERE dedup_key LIKE $1", [`${TAG}-%`]);
  await supprimerEvenementsDeTest(evenements.rows.map((ligne) => ligne.id));
  await query("DELETE FROM source WHERE id = $1", [TAG]);
  await closePools();
});

test("buckets count only dated, geolocated events inside Nouvelle-Aquitaine", async () => {
  const body = await get<{ buckets: Bucket[]; total: number; region: string }>("/api/map/timeline/buckets?months=12");
  const months = body.buckets.filter((b) => b.key === "2026-09" || b.key === "2026-10");
  assert.deepEqual(months.map((b) => [b.key, b.count]), [["2026-09", 1], ["2026-10", 2]]);
  assert.equal(body.region, "nouvelle-aquitaine");
  assert.equal(body.total, months.reduce((sum, b) => sum + b.count, 0));
  assert.deepEqual(Object.keys(months[0]!).sort(), ["count", "from", "key", "to"]);
  assert.equal(months[0]!.from, "2026-09-01T00:00:00.000Z");
  assert.equal(months[0]!.to, "2026-10-01T00:00:00.000Z");
});

test("one bucket returns only its own month and no private fields", async () => {
  const body = await get<{ events: Record<string, unknown>[]; total: number; truncated: boolean }>(
    "/api/map/timeline/events?bucket=2026-10",
  );
  assert.equal(body.total, 2);
  assert.equal(body.events.length, 2);
  assert.equal(body.truncated, false);
  assert.ok(body.events.every((e) => String(e.title).includes(TAG)));
  assert.ok(body.events.every((e) => !("summary" in e) && !("evidence" in e) && !("victim" in e)));
  assert.deepEqual(Object.keys(body.events[0]!).sort(), [
    "assertionType", "confidence", "family", "id", "lat", "lon", "observedAt",
    "orgId", "severity", "sourceId", "sourceUrl", "title",
  ]);
});

test("bucket=all reports the full count even when the page is capped", async () => {
  const body = await get<{ events: MapEvent[]; total: number; truncated: boolean }>(
    "/api/map/timeline/events?bucket=all&limit=1",
  );
  assert.equal(body.events.length, 1);
  assert.equal(body.total, 3);
  assert.equal(body.truncated, true);
  assert.ok(Date.parse(body.events[0]!.observedAt!) >= Date.parse(OCTOBER_LATE));
});

test("invalid bucket and month count are rejected explicitly", async () => {
  for (const url of ["/api/map/timeline/events?bucket=2026-13", "/api/map/timeline/buckets?months=99"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 400, `${url}: ${res.body}`);
  }
});
