/**
 * GET /api/history — intégration mémoire longue.
 *
 * Le brut est purgé à 90 jours par `runRetention`, qui archive avant de
 * supprimer. Le test inscrit un fait par mois sur douze mois, lance la vraie
 * purge, puis vérifie que la route sait encore répondre sur toute la période —
 * et qu'elle distingue le présent de l'archive.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import { runRetention } from "../src/maintenance/retention.js";
import historyRoute from "../src/routes/history.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `hist${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SOURCE = `${TAG}-source`;
const MAINTENANT = new Date();
const DEBUT = new Date(Date.UTC(MAINTENANT.getUTCFullYear(), MAINTENANT.getUTCMonth() - 11, 1));
const FIN = new Date(Date.UTC(MAINTENANT.getUTCFullYear(), MAINTENANT.getUTCMonth() + 1, 0));
const FROM = DEBUT.toISOString().slice(0, 10);
const TO = FIN.toISOString().slice(0, 10);
const MOIS_ATTENDUS = Array.from({ length: 12 }, (_, i) =>
  new Date(Date.UTC(DEBUT.getUTCFullYear(), DEBUT.getUTCMonth() + i, 1)).toISOString().slice(0, 7),
);

function dateMois(i: number): Date {
  const mois = new Date(Date.UTC(DEBUT.getUTCFullYear(), DEBUT.getUTCMonth() + i, 1, 0, 30));
  return i === 11 ? new Date(Math.min(mois.getTime(), MAINTENANT.getTime() - 3_600_000)) : mois;
}

let app: FastifyInstance;
let cibleId: number;
let cibleSlug: string;
let autreId: number;

before(async () => {
  app = Fastify();
  await app.register(historyRoute, { prefix: "/api" });
  await app.ready();

  await query(
    "INSERT INTO source (id, name, family, url) VALUES ($1,$2,'cti',$3)",
    [SOURCE, `Source historique ${TAG}`, `https://exemple.invalid/${TAG}`],
  );
  cibleSlug = `${TAG}-cible`;
  const cible = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'entreprise','33') RETURNING id",
    [`Organisation cible ${TAG}`, cibleSlug],
  );
  cibleId = Number(cible.rows[0].id);
  const autre = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'entreprise','40') RETURNING id",
    [`Organisation autre ${TAG}`, `${TAG}-autre`],
  );
  autreId = Number(autre.rows[0].id);

  const valeurs: unknown[] = [];
  const marque = (valeur: unknown): string => {
    valeurs.push(valeur);
    return `$${valeurs.length}`;
  };
  const lignes: string[] = [];
  for (let i = 0; i < 12; i++) {
    const date = dateMois(i).toISOString();
    lignes.push(
      `(${marque(`${TAG}:cible:${i}`)},'ransomware','confirmed_incident','Fait cible ${i}',` +
        `${marque(SOURCE)},${marque(cibleId)},${marque(date)},${marque(date)},'https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
    );
  }
  // Deux faits d'une autre organisation, un ancien et un récent : le filtre
  // `org` doit les écarter sans toucher aux comptes de la cible.
  const ancien = dateMois(2).toISOString();
  const recent = new Date(Date.now() - 86_400_000).toISOString();
  lignes.push(
    `(${marque(`${TAG}:autre:ancien`)},'phishing','confirmed_incident','Fait tiers ancien',` +
      `${marque(SOURCE)},${marque(autreId)},${marque(ancien)},${marque(ancien)},'https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
    `(${marque(`${TAG}:autre:recent`)},'phishing','confirmed_incident','Fait tiers récent',` +
      `${marque(SOURCE)},${marque(autreId)},${marque(recent)},${marque(recent)},'https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
  );
  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, source_id, org_id, observed_at, valid_at, source_url, evidence)
     VALUES ${lignes.join(", ")}`,
    valeurs,
  );

  // La vraie rétention : archive puis purge tout ce qui a plus de 90 jours.
  await runRetention(() => {}, { days: 90, tables: ["event"] });
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM archive_event WHERE dedup_key LIKE $1", [`${TAG}:%`]);
  await supprimerEvenementsArchivees("source_id = $1", [SOURCE]);
  await query("DELETE FROM source WHERE id = $1", [SOURCE]);
  await query("DELETE FROM org WHERE slug LIKE $1", [`${TAG}-%`]);
  await closePools();
});

async function lire(url: string): Promise<{
  total: number;
  brut: number;
  archive: number;
  parMois: { mois: string; brut: number; archive: number; total: number }[];
}> {
  const res = await app.inject({ method: "GET", url });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

test("la purge a bien vidé le brut des faits anciens", async () => {
  const restants = await query<{ n: string }>("SELECT count(*)::text AS n FROM event WHERE source_id = $1", [SOURCE]);
  const archives = await query<{ n: string }>("SELECT count(*)::text AS n FROM event_archive WHERE source_id = $1", [SOURCE]);
  const presents = Number(restants.rows[0].n) + Number(archives.rows[0].n);
  assert.equal(presents, 14, "aucun des quatorze faits insérés n'a disparu");
  assert.ok(Number(archives.rows[0].n) > 0, "des faits ont quitté event pour l'archive");
  assert.ok(Number(restants.rows[0].n) > 0, "les faits récents restent dans event");
});

test("douze mois de données sont rendus alors que event est purgé à 90 jours", async () => {
  const corps = await lire(`/api/history?from=${FROM}&to=${TO}&org=${cibleId}`);
  assert.deepEqual(corps.parMois.map((m) => m.mois), MOIS_ATTENDUS);
  // La frontière suit la vraie rétention : ce qui a plus de 90 jours est
  // archivé, le reste est encore dans le brut. Elle dépend de la date du jour.
  const seuil = Date.now() - 90 * 86_400_000;
  const archivesAttendues = Array.from({ length: 11 }, (_, i) => dateMois(i))
    .filter((date) => date.getTime() < seuil).length;
  assert.ok(archivesAttendues > 0, "le jeu de test couvre bien la période purgée");
  assert.equal(corps.archive, archivesAttendues, "les mois anciens viennent de l'archive");
  assert.equal(corps.brut, 12 - archivesAttendues, "les mois récents viennent du brut");
  assert.equal(corps.total, 12);
  assert.ok(corps.parMois.every((m) => m.total === 1), "chaque mois est représenté");
  assert.equal(corps.parMois.filter((m) => m.archive === 1).length, archivesAttendues);
});

test("le filtre org accepte un slug et ne mélange pas les organisations", async () => {
  const cible = await lire(`/api/history?from=${FROM}&to=${TO}&org=${cibleSlug}`);
  const autre = await lire(`/api/history?from=${FROM}&to=${TO}&org=${autreId}`);
  assert.equal(cible.total, 12);
  assert.equal(autre.total, 2);
  assert.equal(autre.archive, 1);
  assert.equal(autre.brut, 1);
});

test("les paramètres invalides sont refusés sans interroger l'archive", async () => {
  const mauvaiseDate = await app.inject({ method: "GET", url: "/api/history?from=pas-une-date" });
  assert.equal(mauvaiseDate.statusCode, 400);
  const dateImpossible = await app.inject({ method: "GET", url: "/api/history?from=2026-02-30" });
  assert.equal(dateImpossible.statusCode, 400);
  const moisImpossible = await app.inject({ method: "GET", url: "/api/history?from=2026-13-01" });
  assert.equal(moisImpossible.statusCode, 400);
  const inverse = await app.inject({ method: "GET", url: `/api/history?from=${TO}&to=${FROM}` });
  assert.equal(inverse.statusCode, 400);
  const demesure = await app.inject({ method: "GET", url: "/api/history?from=2000-01-01&to=2026-11-30" });
  assert.equal(demesure.statusCode, 400);
  const sansOrg = await app.inject({ method: "GET", url: "/api/history?org=organisation-inexistante" });
  assert.equal(sansOrg.statusCode, 404);
});

test("une organisation sans fait répond douze mois vides, pas une erreur", async () => {
  const slug = `${TAG}-vide`;
  const org = await query<{ id: number }>(
    "INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'entreprise','33') RETURNING id",
    [`Organisation vide ${TAG}`, slug],
  );
  try {
    const vide = await lire(`/api/history?from=${FROM}&to=${TO}&org=${org.rows[0].id}`);
    assert.equal(vide.total, 0);
    assert.equal(vide.brut, 0);
    assert.equal(vide.archive, 0);
    assert.deepEqual(vide.parMois.map((m) => m.mois), MOIS_ATTENDUS);
    assert.ok(vide.parMois.every((m) => m.total === 0), "tous les mois sont à zéro");
  } finally {
    await query("DELETE FROM org WHERE id = $1", [org.rows[0].id]).catch(() => {});
  }
});
