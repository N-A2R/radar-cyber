/**
 * Indice ReCyF-2.5 : critère du juge externe exécuté tel quel, et CSV daté.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { closePools, query } from "../src/db.js";
import {
  CRITERE_SQL,
  ENTETE_CSV_RECYF,
  FORMULE,
  METHODE_SHA256,
  REFERENTIEL,
  SOURCE_REFERENCE,
  csvReCyF,
  nomFichierCsvReCyF,
  publierScoresReCyF,
  scoreReCyF,
} from "../src/analyse/recyf.js";

const MARQUE = `recyf-${Date.now()}`;
const LOT = new Date("2026-11-23T12:00:00.000Z");
const ATTENDU_SCORE = 1 / 3;
const ATTENDU_CONFIANCE = 0.8;

let orgId: number;
let csv: string;

before(async () => {
  const org = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, dept) VALUES ($1, $2, 'collectivite', '33') RETURNING id",
    [`Commune de test ${MARQUE}`, `commune-${MARQUE}`],
  );
  orgId = org.rows[0].id;

  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, severity, confidence, source_id, source_url, org_id, evidence)
     VALUES ($1,'presse','confirmed_incident','Fait ReCyF A',4,'B2','ransomlook','https://example.invalid/a',$4,'{"run_id":"1"}'::jsonb),
            ($2,'presse','confirmed_incident','Fait ReCyF B',3,NULL,'ransomlook','https://example.invalid/b',$4,'{"run_id":"1"}'::jsonb),
            ($3,'presse','confirmed_incident','Fait ReCyF C',2,'C2','ransomlook','https://example.invalid/c',$4,'{"run_id":"1"}'::jsonb)`,
    [`${MARQUE}-a`, `${MARQUE}-b`, `${MARQUE}-c`, orgId],
  );

  // Un score historique coexiste avec l'indice ReCyF : aucune écrasure.
  await query(
    `INSERT INTO org_score (org_id, score, services, confirmees, criticite, regle, referentiel, calcule_le)
     VALUES ($1, 0.42, 3, 2, 6, 'ctem-priorite@1', 'ctem-priorite@1', now())`,
    [orgId],
  );

  const publication = await publierScoresReCyF(query, LOT);
  assert.equal(publication.collectivites, 1);
  csv = csvReCyF(publication.lignes, LOT);
});

after(async () => {
  if (orgId) {
    await query("DELETE FROM event WHERE org_id = $1", [orgId]);
    await query("DELETE FROM org_score WHERE org_id = $1", [orgId]);
    await query("DELETE FROM org WHERE id = $1", [orgId]);
  }
  await closePools().catch(() => {});
});

test("la méthode datée est empreintée de la même valeur dans le code et la migration", () => {
  assert.equal(METHODE_SHA256, "2683a397fbbf87d4dea6eb920b20c21eb4ffe39ec5f273dc5dcb3c5ee0cd6ed6");
  assert.match(FORMULE, /2026-11-23/);
  assert.match(SOURCE_REFERENCE, /externe/);
  assert.equal(scoreReCyF([4]), 0);
  assert.equal(scoreReCyF([1, 1]), 1);
  assert.equal(scoreReCyF([2, 3]), 0.5);
});

test("chaque collectivité avec événement porte un score ReCyF complet et daté", async () => {
  const row = await query<{
    score: number;
    confidence: number;
    methode_sha256: string;
    formule: string;
    methode: string;
    calcule_le: string | Date;
    services: number;
    confirmees: number;
  }>(
    `SELECT score, confidence, methode_sha256, formule, methode, calcule_le, services, confirmees
       FROM org_score WHERE org_id = $1 AND referentiel = $2`,
    [orgId, REFERENTIEL],
  );
  assert.equal(row.rows.length, 1);
  const score = row.rows[0];
  assert.ok(Math.abs(score.score - ATTENDU_SCORE) < 1e-9);
  assert.ok(Math.abs(score.confidence - ATTENDU_CONFIANCE) < 1e-9);
  assert.equal(score.methode_sha256, METHODE_SHA256);
  assert.equal(score.formule, FORMULE);
  assert.match(score.methode, /ANSSI/);
  assert.equal(new Date(score.calcule_le).toISOString(), LOT.toISOString());
  assert.equal(score.services, 3);
  assert.equal(score.confirmees, 2);

  const historique = await query<{ score: number }>(
    "SELECT score FROM org_score WHERE org_id = $1 AND referentiel = 'ctem-priorite@1'",
    [orgId],
  );
  assert.equal(historique.rows[0]?.score, 0.42);
});

test("le critère SQL du juge externe renvoie 0", async () => {
  const critere = await query<{ count: string }>(CRITERE_SQL);
  assert.equal(critere.rows[0]?.count, "0");
});

test("le CSV daté contient le score et sa formule", () => {
  const lignes = csv.trimEnd().split("\n");
  assert.equal(lignes[0], ENTETE_CSV_RECYF.join(","));
  assert.equal(lignes.length, 2);
  assert.match(nomFichierCsvReCyF(LOT), /^export-recyf-2026-11-23\.csv$/);
  assert.ok(lignes[1].includes(LOT.toISOString()));
  assert.ok(lignes[1].includes(ATTENDU_SCORE.toFixed(6)));
  assert.ok(lignes[1].includes(METHODE_SHA256));
  assert.ok(lignes[1].includes(FORMULE));
  assert.ok(lignes[1].includes("ANSSI"));
});
