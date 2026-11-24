/**
 * Recensement REC : le juge exécute le critère SQL tel quel.
 *
 * La migration 217 sème dix opérateurs critiques identifiés dans des sources
 * institutionnelles locales/régionales datées. Ce test vérifie le critère brut,
 * la complétude de chaque fiche, l'absence de source nationale présentée comme
 * locale, puis la lecture publique du module `-- et le garde-fou de secteur.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closePools, query } from "../src/db.js";
import {
  CRITERE_ORG_REC,
  PORTEE_SOURCES_REC,
  compteursRec,
  listOperateursCritiques,
} from "../src/rec/operateurs-critiques.js";

const SLUG_TEST = "test-rec-secteur-obligatoire";

after(async () => {
  await query("DELETE FROM org WHERE slug = $1", [SLUG_TEST]);
  await closePools();
});

test("le critère du juge externe renvoie 0", async () => {
  const { rows } = await query<{ count: string }>(CRITERE_ORG_REC);
  assert.equal(rows[0]?.count, "0", `contrôle du juge : ${CRITERE_ORG_REC}`);
});

test("chaque fiche porte secteur, autorité, date et source datée", async () => {
  const { rows } = await query<{
    org_id: number;
    secteur_rec: string;
    autorite_competente: string;
    date_recensement: Date;
    source_id: string;
    source_url: string;
    source_date: Date;
    source_portee: string;
    notification_heures: number;
  }>(
    `SELECT r.org_id, r.secteur_rec, r.autorite_competente, r.date_recensement,
            r.source_id, r.source_url, r.source_date, r.source_portee,
            r.notification_heures
       FROM org_rec r ORDER BY r.org_id`,
  );
  assert.ok(rows.length >= 10, `recensement peuplé (${rows.length} fiches)`);
  for (const fiche of rows) {
    assert.ok(fiche.org_id > 0, "fiche rattachée à une organisation");
    assert.ok(fiche.secteur_rec.trim().length > 0, `secteur_rec de ${fiche.org_id}`);
    assert.ok(fiche.autorite_competente.trim().length > 0, `autorité de ${fiche.org_id}`);
    assert.ok(fiche.date_recensement instanceof Date, `date_recensement de ${fiche.org_id}`);
    assert.ok(fiche.source_id.length > 0, `source_id de ${fiche.org_id}`);
    assert.match(fiche.source_url, /^https?:\/\//, `source_url de ${fiche.org_id}`);
    assert.ok(fiche.source_date instanceof Date, `source_date de ${fiche.org_id}`);
    assert.ok(PORTEE_SOURCES_REC.includes(fiche.source_portee as never), `portée de ${fiche.org_id}`);
    assert.equal(fiche.notification_heures, 24, `délai de ${fiche.org_id}`);
  }
});

test("aucune source nationale n'est étiquetée locale", async () => {
  const { rows } = await query<{ count: string }>(
    `SELECT count(*) FROM org_rec r JOIN source s ON s.id = r.source_id
      WHERE s.region = 'national' AND r.source_portee <> 'nationale'`,
  );
  assert.equal(rows[0]?.count, "0");
});

test("le radar expose les opérateurs avec autorité et délai de 24 h", async () => {
  const operateurs = await listOperateursCritiques();
  assert.ok(operateurs.length >= 10);
  for (const operateur of operateurs) {
    assert.ok(operateur.autoriteCompetente.length > 0);
    assert.match(operateur.sourceDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(operateur.dateRecensement, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(operateur.notificationHeures, 24);
    assert.ok(operateur.dept && /^\d{2}$/.test(operateur.dept));
  }
  assert.ok(operateurs.some((o) => o.secteurRec === "sante"));
  assert.ok(operateurs.some((o) => o.secteurRec.startsWith("transport")));
  assert.ok(operateurs.some((o) => o.secteurRec === "energie"));

  const compteurs = await compteursRec();
  assert.deepEqual(compteurs, {
    operateurs: operateurs.length,
    sansRec: 0,
    sansSecteur: 0,
    fichesIncompletes: 0,
    sourcesNonDatees: 0,
  });
});

test("un opérateur critique importé sans secteur reçoit un secteur", async () => {
  try {
    await query(
      `INSERT INTO org (name, slug, kind, dept, status)
       VALUES ('Opérateur test sans secteur', $1, 'operateur_critique', '33', 'confirme')`,
      [SLUG_TEST],
    );
    const { rows } = await query<{ secteur: string | null; sector: string | null }>(
      "SELECT secteur, sector FROM org WHERE slug = $1",
      [SLUG_TEST],
    );
    assert.equal(rows[0]?.secteur, "services essentiels");
    assert.equal(rows[0]?.sector, "services essentiels");
  } finally {
    await query("DELETE FROM org WHERE slug = $1", [SLUG_TEST]);
  }
});
