/**
 * Exposition des domaines régionaux sans donnée victime.
 *
 * - cinq réponses HIBP domain search enregistrées, cinquante statistiques ;
 * - aucun appel réseau, aucune donnée personnelle dans le contrat de sortie ;
 * - la table semée par `db/migrate-217-stealer-domain-stat.sql` contient
 *   cinquante lignes et accepte une réécriture idempotente ;
 * - les contraintes SQL refusent, même en INSERT direct, un courriel ou un
 *   mot de passe.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { closePools, query } from "../src/db.js";
import {
  type StatistiqueDomaine,
  FIXTURES_HIBP_DOMAIN_SEARCH,
  SOURCE_FIXTURE,
  StatistiqueDomaineSchema,
  chargeurLocal,
  collecterStatistiquesFixture,
  enregistrerStatistiquesDomaines,
} from "../src/leaks/hibp-domain-search-fixture.js";

const DOSSIER = new URL("../../../bench/fixtures/hibp-domain-search/", import.meta.url);
const SNAPSHOT = new URL("../../../bench/fixtures/hibp-domain-search/normalized.snapshot.json", import.meta.url);

after(async () => {
  await closePools();
});

/** Collecte avec un `fetch` qui échoue : tout appel réseau casse le test. */
async function statistiquesSansReseau(): Promise<StatistiqueDomaine[]> {
  const fetchOriginal = globalThis.fetch;
  let appels = 0;
  globalThis.fetch = (async () => {
    appels += 1;
    throw new Error("appel réseau interdit dans les tests de fixture");
  }) as typeof fetch;
  try {
    const statistiques = await collecterStatistiquesFixture(
      FIXTURES_HIBP_DOMAIN_SEARCH,
      chargeurLocal(DOSSIER),
    );
    assert.equal(appels, 0, "aucun appel réseau");
    return statistiques;
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}

/** Vérifie le refus SQL et renvoie le nom de la contrainte violée. */
async function refusContrainte(texte: string, params: unknown[]): Promise<string> {
  try {
    await query(texte, params);
  } catch (err) {
    const e = err as { code?: string; constraint?: string };
    assert.equal(e.code, "23514", `code SQL attendu 23514, reçu ${String(e.code)}`);
    return e.constraint ?? "";
  }
  assert.fail("INSERT accepté alors qu'il devait être refusé");
}

test("cinq fixtures HIBP domain search donnent 50 statistiques conformes au snapshot", async () => {
  const statistiques = await statistiquesSansReseau();
  assert.equal(FIXTURES_HIBP_DOMAIN_SEARCH.length, 5);
  assert.equal(statistiques.length, 50);
  assert.deepEqual(StatistiqueDomaineSchema.array().parse(statistiques), statistiques);
  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8")) as unknown;
  assert.deepEqual(statistiques, snapshot);
});

test("aucune donnée victime ni secret ne sort du connecteur", async () => {
  const brut = await readFile(new URL(FIXTURES_HIBP_DOMAIN_SEARCH[0]!, DOSSIER), "utf8");
  assert.match(brut, /"PwnCount"/, "la fixture brute porte des champs à écarter");
  const sortie = JSON.stringify(await statistiquesSansReseau());
  assert.doesNotMatch(sortie, /@|password|passwd|mdp|secret|mot[-_ ]?de[-_ ]?passe|hunter2/i);
  assert.doesNotMatch(sortie, /"name"|"pwnCount"|"email"|"password"|"ip"/i);
});

test("la table contient les cinq colonnes et 50 lignes, réécrites de façon idempotente", async () => {
  const colonnes = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'stealer_domain_stat'
     ORDER BY ordinal_position`,
  );
  assert.deepEqual(
    colonnes.rows.map((r) => r.column_name),
    ["domaine", "source", "occurrences", "premiere_vue", "derniere_vue"],
  );

  const avant = await query<{ n: string }>("SELECT count(*)::text AS n FROM stealer_domain_stat");
  assert.equal(Number(avant.rows[0]?.n), 50, "migration : cinquante domaines déjà présents");

  const statistiques = await statistiquesSansReseau();
  assert.equal(await enregistrerStatistiquesDomaines(statistiques), 50);
  const apres = await query<{ n: string }>("SELECT count(*)::text AS n FROM stealer_domain_stat");
  assert.equal(Number(apres.rows[0]?.n), 50, "réécriture idempotente : toujours cinquante domaines");

  const { rows } = await query<{
    domaine: string;
    source: string;
    occurrences: number;
    premiere_vue: string;
    derniere_vue: string;
  }>(
    `SELECT domaine, source, occurrences, premiere_vue::text AS premiere_vue,
            derniere_vue::text AS derniere_vue
     FROM stealer_domain_stat ORDER BY domaine`,
  );
  const attendu = statistiques
    .slice()
    .sort((a, b) => a.domaine.localeCompare(b.domaine, "en"))
    .map((s) => ({
      domaine: s.domaine,
      source: SOURCE_FIXTURE,
      occurrences: s.occurrences,
      premiere_vue: s.premiereVue,
      derniere_vue: s.derniereVue,
    }));
  assert.deepEqual(rows, attendu);
});

test("un INSERT SQL direct refuse courriels et mots de passe", async () => {
  const insert = `INSERT INTO stealer_domain_stat
    (domaine, source, occurrences, premiere_vue, derniere_vue)
    VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE)`;
  const avant = await query<{ n: string }>("SELECT count(*)::text AS n FROM stealer_domain_stat");

  const email = await refusContrainte(insert, ["victime@example.com", SOURCE_FIXTURE]);
  assert.equal(email, "stealer_domain_stat_domaine_dns");

  const motDePasse = await refusContrainte(insert, ["password.exemple.test", SOURCE_FIXTURE]);
  assert.equal(motDePasse, "stealer_domain_stat_sans_secret");

  const sourceEmail = await refusContrainte(insert, ["etab-refus.exemple.test", "victime@example.com"]);
  assert.equal(sourceEmail, "stealer_domain_stat_source_permise");

  const apres = await query<{ n: string }>("SELECT count(*)::text AS n FROM stealer_domain_stat");
  assert.equal(apres.rows[0]?.n, avant.rows[0]?.n, "aucune ligne ajoutée par un INSERT refusé");
});
