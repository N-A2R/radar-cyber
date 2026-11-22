/**
 * Behaviours of the offline Nouvelle-Aquitaine geo backfill.
 * Pure rules need no database; the write path uses the ephemeral test DB.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { geocodePendingEvents } from "../src/collectors/geocode.js";
import { query } from "../src/db.js";
import { backfillOrgGeo } from "../src/geo/backfill.js";
import {
  buildCommuneIndex,
  isNaCoordinate,
  normalizeCommuneName,
  resolveCommune,
  type CommuneRecord,
} from "../src/geo/commune-index.js";

const COMMUNE: CommuneRecord = {
  code: "TEST33",
  nom: "Geo Test Bordeaux",
  departement: "33",
  lat: 44.8378,
  lon: -0.5792,
};

const silent = (): void => {};

describe("commune index", () => {
  it("normalises accents, case and punctuation into one key", () => {
    assert.equal(normalizeCommuneName("L'Isle-Jourdain"), normalizeCommuneName("lisle jourdain"));
    assert.equal(normalizeCommuneName("Angoulême"), "angouleme");
  });

  it("accepts an in-region coordinate and rejects an out-of-region one", () => {
    assert.equal(isNaCoordinate(44.8378, -0.5792), true);
    assert.equal(isNaCoordinate(48.8566, 2.3522), false);
    assert.equal(isNaCoordinate(Number.NaN, 0), false);
  });

  it("resolves an exact city and department match", () => {
    const index = buildCommuneIndex([COMMUNE]);
    assert.deepEqual(resolveCommune(index, "geo test bordeaux", "33"), {
      code: "TEST33",
      lat: 44.8378,
      lon: -0.5792,
    });
  });

  it("refuses a missing city, a missing department and a foreign department", () => {
    const index = buildCommuneIndex([COMMUNE]);
    assert.equal(resolveCommune(index, null, "33"), null);
    assert.equal(resolveCommune(index, "Geo Test Bordeaux", null), null);
    assert.equal(resolveCommune(index, "Geo Test Bordeaux", "75"), null);
  });

  it("drops an ambiguous commune instead of guessing one of two places", () => {
    const other = { ...COMMUNE, code: "TEST33B", lat: 44.9 };
    const index = buildCommuneIndex([COMMUNE, other]);
    assert.equal(resolveCommune(index, "Geo Test Bordeaux", "33"), null);
  });

  it("ignores communes whose coordinate lies outside the region", () => {
    const index = buildCommuneIndex([{ ...COMMUNE, lat: 48.8566 }]);
    assert.equal(resolveCommune(index, "Geo Test Bordeaux", "33"), null);
  });
});

describe("backfill write path", () => {
  it("writes only missing in-region coordinates and traces their source", async () => {
    const inserts = [
      ["Geo Backfill Missing", "geo-backfill-missing", "Geo Test Bordeaux", "33", null],
      ["Geo Backfill Manual", "geo-backfill-manual", "Geo Test Bordeaux", "33", "manuel"],
      ["Geo Backfill Outside", "geo-backfill-outside", "Geo Test Bordeaux", "75", null],
      ["Geo Backfill Unknown", "geo-backfill-unknown", "Geo Test Atlantis", "33", null],
    ] as const;
    for (const [name, slug, city, dept, source] of inserts) {
      await query(
        `INSERT INTO org (name, slug, kind, city, dept, status, lat, lon, geo_source)
         VALUES ($1, $2, 'entreprise', $3, $4, 'confirme',
                 CASE WHEN $5 = 'manuel' THEN 45.0 END,
                 CASE WHEN $5 = 'manuel' THEN 1.0 END, $5)`,
        [name, slug, city, dept, source],
      );
    }

    const first = await backfillOrgGeo(silent, { communes: [COMMUNE] });
    assert.equal(first.updated, 1);

    const { rows } = await query<{
      slug: string;
      lat: number | null;
      lon: number | null;
      geo_source: string | null;
    }>(
      `SELECT slug, lat, lon, geo_source FROM org WHERE slug LIKE 'geo-backfill-%' ORDER BY slug`,
    );
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    const written = bySlug.get("geo-backfill-missing")!;
    assert.deepEqual([written.lat, written.lon, written.geo_source], [44.8378, -0.5792, "commune-centre"]);
    assert.deepEqual(
      [bySlug.get("geo-backfill-manual")!.lat, bySlug.get("geo-backfill-manual")!.geo_source],
      [45.0, "manuel"],
    );
    assert.equal(bySlug.get("geo-backfill-outside")!.lat, null);
    assert.equal(bySlug.get("geo-backfill-unknown")!.lat, null);

    const trace = await query<{ source: string; code: string }>(
      `SELECT e.source, e.preuve->>'codeCommune' AS code
         FROM org_enrichissement e JOIN org o ON o.id = e.org_id
        WHERE o.slug = 'geo-backfill-missing' AND e.champ = 'geo'`,
    );
    assert.deepEqual(trace.rows[0], { source: "commune-centre-local", code: "TEST33" });
  });

  it("is idempotent on a second run", async () => {
    const second = await backfillOrgGeo(silent, { communes: [COMMUNE] });
    assert.equal(second.updated, 0);
  });

  it("propagates a backfilled coordinate to a linked event", async () => {
    const { rows } = await query<{ id: number }>(
      "SELECT id FROM org WHERE slug = 'geo-backfill-missing'",
    );
    await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, org_id, source_url, evidence)
       VALUES ('geo-backfill-event', 'incident', 'confirmed_incident', 'Geo backfill event',
               'ransomlook', $1, 'https://example.invalid/event', '{"run_id":"1"}'::jsonb)`,
      [rows[0]!.id],
    );

    await geocodePendingEvents(silent);

    const event = await query<{
      lat: number | null;
      lon: number | null;
      geo_type: string;
      geo_source: string | null;
    }>("SELECT lat, lon, geo_type, geo_source FROM event WHERE dedup_key = 'geo-backfill-event'");
    assert.deepEqual(event.rows[0], {
      lat: 44.8378,
      lon: -0.5792,
      geo_type: "entity_location",
      geo_source: "org",
    });
  });
});
