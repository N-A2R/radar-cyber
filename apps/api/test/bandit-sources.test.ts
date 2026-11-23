/**
 * Bandit d'allocation des sources : critère du juge, rejouabilité de la trace
 * et persistance des 1 000 décisions dans la migration 217.
 *
 * Les tests synthétiques tournent sans base. Le test de persistance utilise la
 * base jetable du lanceur, jamais la base de développement.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { armesDuCorpus, lireCorpus } from "../src/bandit/corpus.js";
import { enregistrerBandit } from "../src/bandit/store.js";
import {
  CONFIG_BANDIT,
  ligneObjectif,
  lignesMesure,
  simulerBandit,
  verifierObjectif,
  type ResultatBandit,
} from "../src/bandit/sources.js";
import { closePools, query, withTransaction } from "../src/db.js";

const FENETRE_JOURS = 180;
const CORPUS = fileURLToPath(new URL("../../../bench/corpus/bandit-sources-2026-11-23.json", import.meta.url));
const TRACE = fileURLToPath(new URL("../../../bench/results/bandit-decisions.jsonl", import.meta.url));
const MIGRATION = fileURLToPath(new URL("../../../db/migrate-217-bandit-decisions.sql", import.meta.url));
const RUN_ID = `bandit-test-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;

let resultat: ResultatBandit;

before(async () => {
  resultat = simulerBandit(armesDuCorpus(lireCorpus(JSON.parse(await readFile(CORPUS, "utf8")))), CONFIG_BANDIT);
});

after(async () => {
  await query("DELETE FROM bandit_run WHERE run_id = $1", [RUN_ID]);
  await closePools();
});

test("critère du juge : 1000 décisions, 2× 8,8 % de rendement, regret ≤ 20 %", () => {
  const verdict = verifierObjectif(resultat);
  const m = resultat.metriques;
  assert.equal(m.decisions, 1000);
  assert.ok(m.rendement >= 0.176, `rendement ${m.rendement}`);
  assert.ok(m.regretPct <= 0.2, `regret ${m.regretPct}`);
  assert.equal(verdict.atteint, true);
  assert.match(ligneObjectif(resultat), /^OBJECTIF : atteint — 1000 \/ 1000 décisions/);
  for (const ligne of lignesMesure(resultat)) console.log(ligne);
});

test("la campagne est rejouable depuis la graine et la trace publiée", async () => {
  const copie = simulerBandit(armesDuCorpus(lireCorpus(JSON.parse(await readFile(CORPUS, "utf8")))), CONFIG_BANDIT);
  assert.deepEqual(copie.decisions, resultat.decisions, "même graine, mêmes décisions");

  const relue = (await readFile(TRACE, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(relue.length, 1000, "une ligne par décision");
  assert.equal(new Set(relue.map((d) => d.tour)).size, 1000, "un seul tirage par tour");
  const ids = new Set(resultat.armes.map((a) => a.id));
  assert.ok(relue.every((d) => ids.has(d.source_id)), "aucune source hors corpus");
  const attendues = resultat.decisions.map((d) => ({
    tour: d.tour,
    source_id: d.sourceId,
    score_echantillone: d.scoreEchantillone,
    items_lus: d.itemsLus,
    evenements_nouveaux: d.evenementsNouveaux,
    taux_observe: d.tauxObserve,
    taux_oracle: d.tauxOracle,
    regret_attendu: d.regretAttendu,
    regret_cumule: d.regretCumule,
    posterior_alpha: d.posteriorAlpha,
    posterior_beta: d.posteriorBeta,
  }));
  assert.deepEqual(
    relue.map((d) => {
      const copie = { ...d };
      delete copie.run_id;
      return copie;
    }),
    attendues,
    "tous les champs de la trace doivent être rejouables",
  );
  const nouveaux = relue.reduce((total, d) => total + d.evenements_nouveaux, 0);
  const items = relue.reduce((total, d) => total + d.items_lus, 0);
  assert.equal(nouveaux, resultat.metriques.evenementsNouveaux);
  assert.equal(nouveaux / items, resultat.metriques.rendement);
});

test("le verdict échoue si les sources sont mauvaises : aucune valeur codée en dur", () => {
  const mauvaises = [
    { id: "muette-a", family: "cti", itemsIn: 1000, itemsNew: 1, runs: 10 },
    { id: "muette-b", family: "cti", itemsIn: 1000, itemsNew: 2, runs: 10 },
  ];
  const pire = simulerBandit(mauvaises, CONFIG_BANDIT);
  const verdict = verifierObjectif(pire);
  assert.equal(verdict.atteint, false);
  assert.equal(verdict.rendementOk, false);
  assert.match(ligneObjectif(pire), /^OBJECTIF : partiel —/);
});

test("migration 217 : décisions tracées en base, sans doublon au rejeu", async () => {
  const sql = await readFile(MIGRATION, "utf8");
  await query(sql);
  await query(sql);

  const ecrit = await withTransaction((client) => enregistrerBandit(client, RUN_ID, resultat, FENETRE_JOURS));
  assert.equal(ecrit.decisions, 1000);

  const campagnes = await query<{ n: string }>("SELECT count(*)::text AS n FROM bandit_run WHERE run_id = $1", [RUN_ID]);
  assert.equal(campagnes.rows[0].n, "1");

  const traces = await query<{
    n: string;
    nouveaux: string;
    items: string;
    regret: string;
    sources: string;
  }>(
    `SELECT count(*)::text AS n,
            sum(evenements_nouveaux)::text AS nouveaux,
            sum(items_lus)::text AS items,
            sum(regret_attendu)::text AS regret,
            count(DISTINCT source_id)::text AS sources
       FROM bandit_decision WHERE run_id = $1`,
    [RUN_ID],
  );
  const t = traces.rows[0];
  assert.equal(t.n, "1000");
  assert.equal(t.sources, String(resultat.metriques.sourcesExplorees));
  assert.equal(Number(t.items), resultat.metriques.itemsLus);
  assert.equal(Number(t.nouveaux), resultat.metriques.evenementsNouveaux);
  assert.ok(Math.abs(Number(t.regret) - resultat.metriques.regretCumule) < 1e-4);

  const reecrit = await withTransaction((client) => enregistrerBandit(client, RUN_ID, resultat, FENETRE_JOURS));
  assert.equal(reecrit.decisions, 0, "rejouer la campagne ne duplique aucune décision");
  const apres = await query<{ n: string }>("SELECT count(*)::text AS n FROM bandit_decision WHERE run_id = $1", [RUN_ID]);
  assert.equal(apres.rows[0].n, "1000");
});
