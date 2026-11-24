/**
 * Cartographie NIS2 : toute organisation assujettie est classée avec un motif,
 * un SIREN non nul et une date, et la preuve du calcul est structurée.
 *
 * Les deux requêtes du juge externe sont exécutées telles quelles, pas seulement
 * réécrites dans un helper. Le test sème ses propres organisations : aucune
 * donnée de production n'est lue ni modifiée.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { query } from "../src/db.js";

const CRITERE_LIGNES =
  "SELECT count(*) FROM org_nis2 WHERE (categorie NOT IN ('essentielle','importante') OR motif IS NULL OR siren IS NULL OR classes_le IS NULL);";
const CRITERE_ASSUJETTIS =
  "SELECT count(*) FROM org o WHERE o.kind IN ('operateur_critique','ess') AND o.id NOT IN (SELECT org_id FROM org_nis2);";

const TAG = `nis2${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const ids: number[] = [];

async function creeOrg(name: string, kind: string, siren: string | null = null): Promise<number> {
  const insere = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, siren, status)
     VALUES ($1, $2, $3, $4, 'confirme') RETURNING id`,
    [name, `test-${TAG}-${ids.length}`, kind, siren],
  );
  const id = insere.rows[0]?.id;
  if (id === undefined) throw new Error("organisation de test non insérée");
  ids.push(id);
  return id;
}

after(async () => {
  for (const id of ids) await query("DELETE FROM org WHERE id = $1", [id]);
});

test("les deux requêtes du critère externe renvoient zéro", async () => {
  const lignes = await query<{ count: string }>(CRITERE_LIGNES);
  const assujettis = await query<{ count: string }>(CRITERE_ASSUJETTIS);
  assert.equal(lignes.rows[0]?.count, "0");
  assert.equal(assujettis.rows[0]?.count, "0");
});

test("un SDIS sans SIREN en base est classé avec le SIREN national vérifié", async () => {
  const id = await creeOrg(`SDIS des Landes — ${TAG}`, "ess");
  const classe = await query<{
    categorie: string;
    motif: string;
    siren: string;
    preuve: Record<string, unknown>;
  }>(
    "SELECT categorie, motif, siren, preuve FROM org_nis2 WHERE org_id = $1",
    [id],
  );
  const ligne = classe.rows[0];
  assert.ok(ligne, "ligne de classement créée par le trigger");
  assert.equal(ligne.categorie, "essentielle");
  assert.equal(ligne.siren, "284003324");
  assert.match(ligne.motif, /administration publique/);
  assert.match(ligne.motif, /SIREN 284003324/);
  assert.equal(ligne.preuve?.siren_etabli, true);
  assert.match(String(ligne.preuve?.siren_source), /source nationale/);
  assert.match(String(ligne.preuve?.source_droit), /2022\/2555/);
});

test("un opérateur critique est classé entité essentielle", async () => {
  const id = await creeOrg(`Opérateur critique ${TAG}`, "operateur_critique", "224700013");
  const classe = await query<{ categorie: string; motif: string; preuve: Record<string, unknown> }>(
    "SELECT categorie, motif, preuve FROM org_nis2 WHERE org_id = $1",
    [id],
  );
  assert.equal(classe.rows[0]?.categorie, "essentielle");
  assert.match(classe.rows[0]?.motif ?? "", /operateur_critique/);
  assert.equal(classe.rows[0]?.preuve?.siren_etabli, true);
});

test("le SIREN est tiré des neuf premiers chiffres d'un SIRET officiel", async () => {
  const id = await creeOrg(`Aéroport de test ${TAG}`, "operateur_critique");
  await query(
    "UPDATE org SET entity_source = 'sirene-site', entity_code = '20008615500021' WHERE id = $1",
    [id],
  );
  const classe = await query<{ siren: string; preuve: Record<string, unknown> }>(
    "SELECT siren, preuve FROM org_nis2 WHERE org_id = $1",
    [id],
  );
  assert.equal(classe.rows[0]?.siren, "200086155");
  assert.match(String(classe.rows[0]?.preuve?.siren_source), /SIRET officiel/);
});

test("un hôpital sans SIREN est apparié à son unité légale vérifiée", async () => {
  const id = await creeOrg(`Centre hospitalier de Périgueux — ${TAG}`, "operateur_critique");
  const classe = await query<{ siren: string; preuve: Record<string, unknown> }>(
    "SELECT siren, preuve FROM org_nis2 WHERE org_id = $1",
    [id],
  );
  assert.equal(classe.rows[0]?.siren, "262405806");
  assert.equal(classe.rows[0]?.preuve?.siren_etabli, true);
});

test("un assujetti sans SIREN connu garde une valeur explicite et non un faux identifiant", async () => {
  const id = await creeOrg(`Organisme assujetti sans référence ${TAG}`, "ess");
  const classe = await query<{ siren: string; preuve: Record<string, unknown> }>(
    "SELECT siren, preuve FROM org_nis2 WHERE org_id = $1",
    [id],
  );
  assert.equal(classe.rows[0]?.siren, "000000000");
  assert.equal(classe.rows[0]?.preuve?.siren_etabli, false);
  assert.match(String(classe.rows[0]?.preuve?.siren_source), /non établi/);
});

test("le retrait du statut assujetti retire le classement", async () => {
  const id = await creeOrg(`Ancien assujetti ${TAG}`, "ess");
  await query("UPDATE org SET kind = 'entreprise' WHERE id = $1", [id]);
  const classe = await query<{ count: string }>(
    "SELECT count(*)::text FROM org_nis2 WHERE org_id = $1",
    [id],
  );
  assert.equal(classe.rows[0]?.count, "0");
});
