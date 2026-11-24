/**
 * Database behaviour behind the insurance score: region scope, grey sources,
 * global peer baseline and source identifiers. Runs on the disposable test DB.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { ingestQuery } from "../src/db.js";
import { NA_DEPARTMENTS, inputFromRow, loadInsuranceCorpus, loadInsuranceGroups, loadOrganizationInputs } from "../src/insurance/query.js";
import { sirenUnique } from "./helpers/siren.js";

const REFERENCE = new Date().toISOString().slice(0, 10);
const SIREN = sirenUnique("insurance-query");

// Le corpus de référence contient désormais les opérateurs critiques REC
// (migration 217) : la population attendue est le jeu de test plus ce socle.
async function regionalBaseline(): Promise<number> {
  const { rows } = await ingestQuery<{ count: string }>(
    `SELECT count(*)::text AS count FROM org
      WHERE dept = ANY($1::text[]) AND slug NOT LIKE 'insurance-%'`,
    [NA_DEPARTMENTS],
  );
  return Number(rows[0]?.count ?? 0);
}

async function prepare(): Promise<{ naId: number; otherId: number }> {
  await ingestQuery(
    `INSERT INTO org (name, slug, kind, sector, dept, siren, naf, lat, lon, entity_source)
     VALUES ('NA scored one', 'insurance-na-one', 'entreprise', 'sante', '33', '${SIREN}', '86.90A', 44.8, -0.6, 'sirene'),
            ('NA scored two', 'insurance-na-two', 'entreprise', 'sante', '33', NULL, NULL, NULL, NULL, NULL),
            ('NA scored three', 'insurance-na-three', 'entreprise', 'commerce', '17', NULL, NULL, NULL, NULL, NULL),
            ('Outside region', 'insurance-outside', 'entreprise', 'sante', '75', NULL, NULL, NULL, NULL, NULL)
     ON CONFLICT (slug) DO NOTHING`,
  );
  const { rows } = await ingestQuery<{ id: number; slug: string }>(
    "SELECT id, slug FROM org WHERE slug LIKE 'insurance-%'",
  );
  const naId = rows.find((row) => row.slug === "insurance-na-one")!.id;
  const otherId = rows.find((row) => row.slug === "insurance-outside")!.id;

  await ingestQuery(
    `INSERT INTO source (id, name, family, url, relevance)
     VALUES ('grey-forum', 'Grey forum (fixture)', 'ransomware', 'https://example.invalid/grey', 'grey'),
            ('public-cti', 'Public CTI (fixture)', 'cti', 'https://example.invalid/cti', 'primary')
     ON CONFLICT (id) DO NOTHING`,
  );
  await ingestQuery(
    `INSERT INTO event (dedup_key, family, assertion_type, title, at, severity, org_id, source_id,
                        source_url, evidence)
     VALUES ('insurance-claim-na', 'ransomware', 'third_party_claim', 'Synthetic fixture claim', $1::date, 4, $2::int, 'grey-forum',
             'https://example.invalid/insurance/claim-na', '{"run_id":"1"}'::jsonb),
            ('insurance-ambient-na', 'cti', 'ambient_signal', 'Synthetic fixture signal', $1::date, 3, $2::int, 'public-cti',
             'https://example.invalid/insurance/ambient-na', '{"run_id":"1"}'::jsonb),
            ('insurance-claim-outside', 'ransomware', 'third_party_claim', 'Synthetic fixture outside', $1::date, 4, $3::int, 'grey-forum',
             'https://example.invalid/insurance/claim-outside', '{"run_id":"1"}'::jsonb)
     ON CONFLICT (dedup_key) DO NOTHING`,
    [REFERENCE, naId, otherId],
  );
  return { naId, otherId };
}

test("the reference date comes from the local corpus", async () => {
  const socle = await regionalBaseline();
  await prepare();
  const corpus = await loadInsuranceCorpus();
  assert.equal(corpus.referenceDate, REFERENCE);
  assert.equal(corpus.naOrganizations, socle + 3);
});

test("the population contains only the twelve Nouvelle-Aquitaine departments", async () => {
  const socle = await regionalBaseline();
  await prepare();
  const groups = await loadInsuranceGroups(REFERENCE);
  assert.equal(groups.reduce((sum, row) => sum + row.organizationCount, 0), socle + 3);
  assert.ok(groups.some((row) => row.sector === "sante"));
  assert.ok(groups.some((row) => row.sector === "commerce"));
});

test("grey and public source identifiers are both kept for audit", async () => {
  const { naId } = await prepare();
  const row = await loadOrganizationInputs(naId, REFERENCE);
  assert.deepEqual(row?.sourceIds.sort(), ["grey-forum", "public-cti"]);
  assert.equal(row?.incidentCount, 1);
  assert.equal(row?.ambientCount, 1);
});

test("the peer baseline uses the whole region, not only the selected organization", async () => {
  const socle = await regionalBaseline();
  await prepare();
  const groups = await loadInsuranceGroups(REFERENCE);
  const grouped = groups.find((row) => row.incidentCount === 1 && row.ambientCount === 1);
  assert.ok(grouped);
  assert.ok(Math.abs(grouped.overallClaimRate - 1 / (socle + 3)) < 1e-9);
  assert.ok(grouped.sectorClaimRate > grouped.overallClaimRate);
});

test("the single-organization endpoint reuses the same regional baseline", async () => {
  const { naId } = await prepare();
  const one = await loadOrganizationInputs(naId, REFERENCE);
  const all = await loadInsuranceGroups(REFERENCE);
  const grouped = all.find((row) => row.incidentCount === 1 && row.ambientCount === 1);
  assert.ok(one && grouped);
  assert.deepEqual(inputFromRow(one), inputFromRow(grouped));
});

test("an organization outside Nouvelle-Aquitaine has no score", async () => {
  const { otherId } = await prepare();
  assert.equal(await loadOrganizationInputs(otherId, REFERENCE), null);
});

after(async () => {
  await ingestQuery("DELETE FROM event WHERE dedup_key LIKE 'insurance-%'");
  await ingestQuery("DELETE FROM org WHERE slug LIKE 'insurance-%'");
  await ingestQuery("DELETE FROM source WHERE id IN ('grey-forum', 'public-cti')");
});
