/**
 * Mesure de base CTEM (migration 220) : couverture, ports et fraîcheur.
 *
 * La base de test est jetable et le réseau interdit : les observations sont
 * insérées directement avec des dates relatives à `now()`. Chaque assertion porte
 * sur le jeu d'organisations du test, jamais sur le reste de la base.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";
import { lireCtemExposition, measureCtemBaseline } from "../src/exposition/ctem-baseline.js";

const TAG = `ctem${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS: number[] = [];
const SOURCE = `ctem-test-${TAG}`;

before(async () => {
  const noms = ["fraiche-deux-ports", "fraiche-un-port", "ancienne", "sans-exposition", "fraiche-rdp", "fraiche-web"];
  const creees = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, domain)
     SELECT 'CTEM ' || n, $2 || '-' || n, 'entreprise', $3 || '-' || n || '.example.invalid'
       FROM unnest($1::text[]) AS n
     RETURNING id`,
    [noms, TAG, TAG],
  );
  IDS.push(...creees.rows.map((row) => row.id));

  await query(
    `INSERT INTO asset (org_id, kind, value, status)
     SELECT id, 'domain', 'actif-' || id || '.example.invalid', 'candidat'
       FROM unnest($1::integer[]) AS id`,
    [IDS],
  );

  const observations: [number, number, number, string][] = [
    [IDS[0]!, 80, 1, "1 day"],
    [IDS[0]!, 443, 1, "2 days"],
    [IDS[1]!, 443, 2, "1 day"],
    [IDS[2]!, 22, 3, "20 days"],
    [IDS[4]!, 3389, 5, "1 day"],
    [IDS[5]!, 443, 6, "2 days"],
  ];
  await query(
    `INSERT INTO exposition_service
       (org_id, ip, port, category, service, technology, source, source_url, consulted_at, first_seen_at)
     SELECT l.org, '203.0.113.' || l.ip, l.port, 'autre', 'port-' || l.port, 'test', $1,
            'https://example.invalid/' || l.org || '/' || l.port,
            now() - l.age::interval, now() - interval '30 days'
       FROM unnest($2::int[], $3::int[], $4::int[], $5::text[]) AS l(org, port, ip, age)`,
    [
      SOURCE,
      observations.map((o) => o[0]),
      observations.map((o) => o[1]),
      observations.map((o) => o[2]),
      observations.map((o) => o[3]),
    ],
  );
});

after(async () => {
  if (IDS.length > 0) {
    await query("DELETE FROM exposition_service WHERE org_id = ANY($1)", [IDS]);
    await query("DELETE FROM asset WHERE org_id = ANY($1)", [IDS]);
    await query("DELETE FROM org WHERE id = ANY($1)", [IDS]);
  }
  await closePools();
});

test("la vue donne les ports et la fraîcheur par organisation avec actif", async () => {
  const lignes = await lireCtemExposition(IDS);
  const parOrg = new Map(lignes.map((ligne) => [ligne.org_id, ligne]));

  const fraiche = parOrg.get(IDS[0]!);
  assert.ok(fraiche);
  assert.equal(fraiche.expose, true);
  assert.equal(fraiche.nb_services, 2);
  assert.deepEqual(fraiche.ports, [80, 443]);
  assert.equal(fraiche.fraicheur, "fraiche");
  assert.ok(fraiche.age_jours !== null && fraiche.age_jours < 3);

  const ancienne = parOrg.get(IDS[2]!);
  assert.ok(ancienne);
  assert.equal(ancienne.fraicheur, "ancienne");
  assert.ok(ancienne.age_jours !== null && ancienne.age_jours >= 19);

  const sansExposition = parOrg.get(IDS[3]!);
  assert.ok(sansExposition);
  assert.equal(sansExposition.expose, false);
  assert.equal(sansExposition.nb_services, 0);
  assert.deepEqual(sansExposition.ports, []);
  assert.equal(sansExposition.fraicheur, "non_mesuree");
});

test("la couverture compte les organisations avec actif même sans exposition", async () => {
  const mesure = await measureCtemBaseline(IDS);
  assert.equal(mesure.organisations_avec_actif, 6);
  assert.equal(mesure.organisations_exposees, 5);
  assert.ok(Math.abs(mesure.couverture - 5 / 6) < 1e-6);
  assert.equal(mesure.services, 6);
  assert.equal(mesure.ports_distincts, 4);
});

test("le taux de fraîcheur reproduit la requête du critère", async () => {
  const mesure = await measureCtemBaseline(IDS);
  const juge = await query<{ taux: number }>(
    `SELECT count(DISTINCT org_id) FILTER (WHERE consulted_at > now()-interval '7 days')::float/count(DISTINCT org_id) AS taux
       FROM exposition_service WHERE org_id = ANY($1)`,
    [IDS],
  );
  assert.equal(mesure.organisations_fraiches, 4);
  assert.ok(Math.abs(mesure.taux_fraicheur - 0.8) < 1e-6);
  assert.ok(Math.abs(juge.rows[0]!.taux - mesure.taux_fraicheur) < 1e-6);
  assert.ok(mesure.age_median_jours < 7);
});

test("un périmètre restreint ne touche pas au reste de la base", async () => {
  const mesure = await measureCtemBaseline([IDS[0]!, IDS[1]!, IDS[5]!]);
  assert.equal(mesure.organisations_avec_actif, 3);
  assert.equal(mesure.organisations_exposees, 3);
  assert.equal(mesure.couverture, 1);
  assert.equal(mesure.services, 4);
  assert.equal(mesure.ports_distincts, 2);
});
