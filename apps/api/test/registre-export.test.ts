/**
 * Export CSV du registre des traitements : une ligne par source active, portée
 * calculée en SQL, champs tous renseignés, aucun secret ni donnée personnelle.
 *
 * Base jetable comme dans `presse-locale.test.ts` : le test peut tourner seul
 * ou dans la suite lancée par `run.ts` (qui fournit déjà une base radar_test_*).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { createTestDatabase, dropTestDatabase, type TestDb } from "./helpers/testdb.js";
import type * as DbModule from "../src/db.js";

const TAG = `rexp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const NATIONAL = `test:${TAG}:nationale`;
const LOCAL = `test:${TAG}:locale`;
const INTERNATIONAL = `test:${TAG}:internationale`;
const DESACTIVE = `test:${TAG}:desactivee`;
const SOURCES = [NATIONAL, LOCAL, INTERNATIONAL, DESACTIVE];
const NOM_LOCAL = `Presse "du coin", édition ${TAG}`;
const FINALITE_LOCALE = `Surveillance, "qualifiée" de la presse ${TAG}`;
const ENTETE = "source_id,source_nom,famille,portee,finalite,base_legale,duree_jours,declare_at,exporte_le";
const JUGE = `SELECT count(*) FROM source s LEFT JOIN registre_traitement r ON r.source_id=s.id WHERE s.enabled AND (r.id IS NULL OR r.base_legale IS NULL OR r.duree_jours IS NULL OR r.finalite IS NULL);`;

let db: DbModule;
let app: FastifyInstance;
let baseJetable: TestDb | null = null;

/** Parseur CSV minimal : gère les guillemets doublés et les virgules. */
function cellules(ligne: string): string[] {
  const valeurs: string[] = [];
  let courante = "";
  let guillemet = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (guillemet) {
      if (c === '"' && ligne[i + 1] === '"') { courante += '"'; i += 1; }
      else if (c === '"') guillemet = false;
      else courante += c;
    } else if (c === '"') guillemet = true;
    else if (c === ",") { valeurs.push(courante); courante = ""; }
    else courante += c;
  }
  valeurs.push(courante);
  return valeurs;
}

before(async () => {
  const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
  const nom = new URL(url).pathname.replace(/^\//, "");
  if (!/^radar_test_/.test(nom)) {
    baseJetable = await createTestDatabase();
    process.env.DATABASE_URL = baseJetable.url;
  }
  // Import dynamique nécessaire : db.ts (et donc la route) lit DATABASE_URL au
  // chargement ; un import statique figerait l'URL avant la base jetable.
  db = await import("../src/db.js");
  const route = (await import("../src/routes/registre-traitements.js")).default;

  await db.query("DELETE FROM registre_traitement WHERE source_id = ANY($1::text[])", [SOURCES]);
  await db.query("DELETE FROM source WHERE id = ANY($1::text[])", [SOURCES]);
  await db.query(
    `INSERT INTO source (id, name, family, url, enabled, region, department) VALUES
       ($1, $2, 'cti', $3, true, 'national', '33'),
       ($4, $5, 'presse', $6, true, 'nouvelle-aquitaine', '40'),
       ($7, $8, 'vuln', $9, true, NULL, NULL),
       ($10, $11, 'ransomware', $12, false, 'national', NULL)`,
    [NATIONAL, `Avis national ${TAG}`, `https://exemple.invalid/${NATIONAL}`,
     LOCAL, NOM_LOCAL, `https://exemple.invalid/${LOCAL}`,
     INTERNATIONAL, `Veille internationale ${TAG}`, `https://exemple.invalid/${INTERNATIONAL}`,
     DESACTIVE, `Source inactive ${TAG}`, `https://exemple.invalid/${DESACTIVE}`],
  );
  await db.query("UPDATE registre_traitement SET finalite = $1, duree_jours = 120 WHERE source_id = $2",
    [FINALITE_LOCALE, LOCAL]);
  // Champs vides : la route doit les remplacer, sans rendre la ligne invalide.
  await db.query("UPDATE registre_traitement SET finalite = '', base_legale = '' WHERE source_id = $1",
    [INTERNATIONAL]);

  app = Fastify({ logger: false });
  await app.register(route, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (db) {
    await db.query("DELETE FROM registre_traitement WHERE source_id = ANY($1::text[])", [SOURCES]);
    await db.query("DELETE FROM source WHERE id = ANY($1::text[])", [SOURCES]);
    await db.closePools();
  }
  if (baseJetable) await dropTestDatabase(baseJetable);
});

test("export public : en-têtes datés, CRLF, une ligne par source active", async () => {
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const res = await app.inject({ method: "GET", url: "/api/registre-traitements/export.csv" });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(res.headers["content-type"], "text/csv; charset=utf-8");
  assert.equal(res.headers["content-disposition"],
    `attachment; filename="registre_traitements_${aujourdHui}.csv"`);
  assert.equal(res.headers["cache-control"], "no-store");

  const actives = await db.query<{ id: string }>("SELECT id FROM source WHERE enabled");
  const lignes = res.body.split("\r\n");
  assert.equal(lignes[lignes.length - 1], "", "le corps doit finir par CRLF");
  const donnees = lignes.slice(0, -1);
  assert.equal(donnees[0], ENTETE);
  assert.equal(donnees.length, actives.rows.length + 1, "une ligne par source active");

  const parId = new Map<string, string[]>();
  for (const ligne of donnees.slice(1)) {
    const cellulesLigne = cellules(ligne);
    assert.equal(cellulesLigne.length, 9, `9 colonnes attendues : ${ligne}`);
    for (const cellule of cellulesLigne) assert.notEqual(cellule.trim(), "", `cellule vide : ${ligne}`);
    parId.set(cellulesLigne[0]!, cellulesLigne);
  }
  assert.equal(parId.has(DESACTIVE), false, "la source désactivée ne doit pas apparaître");
  assert.deepEqual([...parId.keys()].sort(), actives.rows.map((s) => s.id).sort());

  const nationale = parId.get(NATIONAL)!;
  assert.equal(nationale[3], "nationale");
  assert.notEqual(nationale[3], "locale", "une source nationale n'est jamais locale");
  const locale = parId.get(LOCAL)!;
  assert.equal(locale[3], "locale");
  assert.equal(locale[6], "120", "durée déclarée conservée");
  assert.equal(parId.get(INTERNATIONAL)![3], "internationale");

  for (const ligne of parId.values()) {
    assert.equal(ligne[8], aujourdHui);
    assert.match(ligne[7], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.match(ligne[5], /Intérêt légitime/);
  }

  // Guillemets doublés et virgules échappés dans le nom et la finalité.
  assert.ok(res.body.includes(`"Presse ""du coin"", édition ${TAG}"`), "nom mal échappé");
  assert.equal(parId.get(LOCAL)![1], NOM_LOCAL);
  assert.equal(parId.get(LOCAL)![4], FINALITE_LOCALE);
  assert.ok(parId.get(INTERNATIONAL)![4].length > 0, "finalité vide remplacée");
});

test("critère du juge : zéro source active au registre incomplet", async () => {
  const { rows } = await db.query<{ count: string }>(JUGE);
  assert.equal(rows[0]?.count, "0", JUGE);
});
