/**
 * Behaviours of the final-mile Nouvelle-Aquitaine geocoder.
 * Pure rules need no database; the write path uses the ephemeral test DB.
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { query } from "../src/db.js";
import {
  backfillRemainingGeo,
  buildGeoLookup,
  expandGeoName,
  normalizeGeoName,
  resolveGeo,
  type ReferenceCommune,
} from "../src/geo/complete.js";

const communes: ReferenceCommune[] = [
  { code: "87001", nom: "Saint-Yrieix-la-Perche", departement: "87", parent: null, lat: 45.435, lon: 1.205 },
  { code: "87002", nom: "Aubazine", departement: "19", parent: null, lat: 45.09, lon: 1.62 },
  { code: "87003", nom: "Saint-Médard-de-Barbezieux", departement: "16", parent: null, lat: 45.48, lon: 0.14 },
  { code: "87004", nom: "Old Town", departement: "87", parent: null, lat: 45.5, lon: 1.1 },
  { code: "24013", nom: "Atur", departement: "24", parent: "24053", lat: null, lon: null },
  { code: "24053", nom: "Boulazac Isle Manoire", departement: "24", parent: null, lat: 45.142, lon: 0.782 },
  { code: "33001", nom: "Bordeaux", departement: "33", parent: null, lat: 44.84, lon: -0.58 },
];

const lookup = buildGeoLookup(communes, [
  {
    city: "SAUZE-VAUSSAIS",
    dept: "79",
    code: "79307",
    nom: "Sauzé-entre-Bois",
    lat: 46.1347,
    lon: 0.1053,
    source: "test-complement",
  },
]);

describe("geo name normalisation", () => {
  it("expands SIRENE abbreviations, ligatures and apostrophes", () => {
    assert.equal(expandGeoName("ST-YRIEIX LA PERCHE"), "saint yrieix la perche");
    assert.equal(expandGeoName("STE-EULALIE D'ANS"), "sainte eulalie d ans");
    assert.equal(normalizeGeoName("Sallebœuf"), "salleboeuf");
  });

  it("matches an abbreviated city through the same key as the reference", () => {
    assert.deepEqual(resolveGeo(lookup, "ST YRIEIX LA PERCHE", "87"), {
      code: "87001",
      nom: "Saint-Yrieix-la-Perche",
      lat: 45.435,
      lon: 1.205,
      method: "exact",
      confidence: 1,
    });
  });
});

describe("geo lookup safety", () => {
  it("inherits the INSEE parent centre for a delegated commune", () => {
    const match = resolveGeo(lookup, "ATUR", "24");
    assert.equal(match?.method, "parent");
    assert.deepEqual([match?.code, match?.lat, match?.lon], ["24053", 45.142, 0.782]);
  });

  it("matches a spelling variant by fuzzy score without guessing", () => {
    const match = resolveGeo(lookup, "AUBZINE", "19");
    assert.equal(match?.code, "87002");
    assert.ok((match?.confidence ?? 0) < 1, "a fuzzy match must not claim full confidence");
    assert.equal(resolveGeo(lookup, "Unknown Town", "19")?.method, "department");
  });

  it("uses a versioned complement before falling back to the department", () => {
    const match = resolveGeo(lookup, "SAUZE-VAUSSAIS", "79");
    assert.equal(match?.method, "complement");
    assert.equal(match?.code, "79307");
  });

  it("refuses departments outside Nouvelle-Aquitaine", () => {
    assert.equal(resolveGeo(lookup, "Paris", "75"), null);
  });

  it("drops an ambiguous commune key instead of picking one", () => {
    const ambiguous = buildGeoLookup([
      communes[0]!,
      { ...communes[0]!, code: "87999", lat: 45.9 },
    ]);
    assert.equal(resolveGeo(ambiguous, "Saint-Yrieix-la-Perche", "87")?.method, "department");
  });
  it("resolves a French department label to the same regional centre", () => {
    assert.deepEqual(resolveGeo(lookup, null, "Gironde"), lookup.departments.get("33"));
    assert.equal(resolveGeo(lookup, null, "Paris"), null);
  });
});

describe("final-mile backfill write path", () => {
  it("writes missing and out-of-region coordinates with provenance, then is idempotent", async () => {
    const inserts = [
      ["geo-complete-missing", "ST YRIEIX LA PERCHE", "87", null, null],
      ["geo-complete-outside", "Saint-Yrieix-la-Perche", "87", 48.85, 2.35],
      ["geo-complete-nocity", null, "87", null, null],
      ["geo-complete-dept-label", null, "Gironde", null, null],
      ["geo-complete-outside-dept", "Paris", "75", null, null],
    ] as const;
    for (const [slug, city, dept, lat, lon] of inserts) {
      await query(
        `INSERT INTO org (name, slug, kind, city, dept, status, lat, lon)
         VALUES ($1, $2, 'entreprise', $3, $4, 'confirme', $5, $6)`,
        [slug, slug, city, dept, lat, lon],
      );
    }

    const first = await backfillRemainingGeo(() => {}, { lookup });
    // le backfill traite TOUTES les orgs en attente : dans une base partagée le
    // total varie. Ce qui compte est vérifié ligne par ligne juste après.
    assert.ok(first.updated >= 4, `au moins 4 orgs mises à jour, obtenu ${first.updated}`);

    const { rows } = await query<{ slug: string; lat: number | null; source: string | null }>(
      `SELECT o.slug, o.lat, e.source
         FROM org o LEFT JOIN org_enrichissement e
           ON e.org_id = o.id AND e.champ = 'geo'
        WHERE o.slug LIKE 'geo-complete-%' ORDER BY o.slug`,
    );
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    assert.equal(bySlug.get("geo-complete-missing")?.lat, 45.435);
    assert.equal(bySlug.get("geo-complete-outside")?.lat, 45.435);
    assert.equal(bySlug.get("geo-complete-nocity")?.lat, 45.4675);
    assert.equal(bySlug.get("geo-complete-dept-label")?.lat, 44.84);
    assert.equal(bySlug.get("geo-complete-outside-dept")?.lat, null);
    assert.equal(bySlug.get("geo-complete-missing")?.source, "geo-complete-exact");
    assert.equal(bySlug.get("geo-complete-nocity")?.source, "geo-complete-department");
    assert.equal(bySlug.get("geo-complete-dept-label")?.source, "geo-complete-department");

    const second = await backfillRemainingGeo(() => {}, { lookup });
    assert.equal(second.updated, 0);
  });
});

after(async () => {
  await query("DELETE FROM org_enrichissement WHERE org_id IN (SELECT id FROM org WHERE slug LIKE 'geo-complete-%')");
  await query("DELETE FROM org WHERE slug LIKE 'geo-complete-%'");
});
