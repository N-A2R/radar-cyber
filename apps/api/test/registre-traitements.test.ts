/**
 * Registre des traitements du corpus : toute source active doit être déclarée.
 *
 * Le contrôle du juge externe est recopié mot pour mot : il porte sur la base
 * légale, la durée, la finalité et l'identifiant de ligne de chaque source
 * active. Les sources sont ajoutées après les migrations : la déclaration
 * provient donc du trigger, pas de l'amorçage initial.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";

const ACTIF = "test:registre-active";
const INACTIF = "test:registre-inactif";
const DUREE = "test:registre-duree";
const INCONNU = "test:registre-inconnu";
const SOURCES = [ACTIF, INACTIF, DUREE, INCONNU];

const JUGE = `SELECT count(*) FROM source s LEFT JOIN registre_traitement r ON r.source_id=s.id WHERE s.enabled AND (r.id IS NULL OR r.base_legale IS NULL OR r.duree_jours IS NULL OR r.finalite IS NULL);`;
const BASE_LEGALE = "Intérêt légitime : observatoire de la cybermenace (art. 6.1.f)";
const FINALITE_CTI = "Veille CTI : collecte et qualification des indicateurs de menace";
const FINALITE_GENERIQUE = "Veille de sécurité : détection, qualification et documentation des incidents cyber";

before(async () => {
  await query("DELETE FROM registre_traitement WHERE source_id = ANY($1::text[])", [SOURCES]);
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [SOURCES]);
  await query(
    `INSERT INTO source (id, name, family, url, enabled) VALUES
       ($1, $2, 'cti', $3, true),
       ($4, $5, 'cti', $6, false),
       ($7, $8, 'vuln', $9, false),
       ($10, $11, 'famille_inconnue_test', $12, true)`,
    [ACTIF, `Registre actif ${ACTIF}`, `https://exemple.invalid/${ACTIF}`,
     INACTIF, `Registre inactif ${INACTIF}`, `https://exemple.invalid/${INACTIF}`,
     DUREE, `Registre durée ${DUREE}`, `https://exemple.invalid/${DUREE}`,
     INCONNU, `Registre famille inconnue ${INCONNU}`, `https://exemple.invalid/${INCONNU}`],
  );
  // DUREE est réactivée avec une durée déjà déclarée : le trigger ne doit pas
  // remplacer cette déclaration par les 90 jours par défaut.
  await query("INSERT INTO registre_traitement (source_id, duree_jours) VALUES ($1, 42)", [DUREE]);
  await query("UPDATE source SET enabled = true WHERE id = $1", [DUREE]);
});

after(async () => {
  await query("DELETE FROM registre_traitement WHERE source_id = ANY($1::text[])", [SOURCES]);
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [SOURCES]);
  await closePools();
});

test("critère du juge : aucune source active n'a de registre incomplet", async () => {
  const { rows } = await query<{ count: string }>(JUGE);
  assert.equal(rows[0]?.count, "0", `contrôle du juge : ${JUGE}`);
});

test("le trigger crée une ligne complète pour la source active", async () => {
  const { rows } = await query<{
    id: string; base_legale: string; duree_jours: number; finalite: string;
  }>(
    "SELECT id, base_legale, duree_jours, finalite FROM registre_traitement WHERE source_id = $1",
    [ACTIF],
  );
  assert.equal(rows.length, 1);
  assert.ok(Number(rows[0]?.id) > 0, "l'identité de la ligne est renseignée");
  assert.equal(rows[0]?.base_legale, BASE_LEGALE);
  assert.equal(rows[0]?.duree_jours, 90);
  assert.equal(rows[0]?.finalite, FINALITE_CTI);
});

test("une source désactivée n'est pas comptée ni déclarée", async () => {
  const { rows } = await query<{ source_id: string }>(
    "SELECT source_id FROM registre_traitement WHERE source_id = $1",
    [INACTIF],
  );
  assert.deepEqual(rows, []);

  const { rows: jugement } = await query<{ count: string }>(JUGE);
  assert.equal(jugement[0]?.count, "0", `contrôle du juge : ${JUGE}`);
});

test("une durée déjà déclarée n'est pas écrasée à la réactivation", async () => {
  const { rows } = await query<{
    base_legale: string; duree_jours: number; finalite: string;
  }>(
    "SELECT base_legale, duree_jours, finalite FROM registre_traitement WHERE source_id = $1",
    [DUREE],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.duree_jours, 42);
  assert.equal(rows[0]?.base_legale, BASE_LEGALE);
  assert.ok(rows[0]?.finalite, "la finalité reste renseignée");
});

test("une famille inconnue reçoit la finalité générique", async () => {
  const { rows } = await query<{ finalite: string }>(
    "SELECT finalite FROM registre_traitement WHERE source_id = $1",
    [INCONNU],
  );
  assert.equal(rows[0]?.finalite, FINALITE_GENERIQUE);
  assert.doesNotMatch(rows[0]?.finalite ?? "", /local/i);
});
