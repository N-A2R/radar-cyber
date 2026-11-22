/**
 * Connecteur DeHashed en mode fixture : cinq réponses, un contrat, un snapshot.
 *
 * Aucun appel réseau : le chargeur injecté lit des fichiers locaux et `fetch`
 * est remplacé par une fonction qui échoue pendant le test. Les données
 * personnelles présentes dans les réponses brutes sont vérifiées comme
 * écartées, puis les cinq métadonnées sont comparées à la table peuplée par
 * la migration `db/migrate-200-dehashed-fixture.sql`.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { closePools, query } from "../src/db.js";
import {
  type ReponseNormalisee,
  SOURCE_FIXTURE,
  FIXTURES_DEHASHED,
  ReponseNormaliseeSchema,
  chargeurLocal,
  collecterReponsesFixture,
  enregistrerReponsesFixture,
} from "../src/leaks/dehashed-fixture.js";

const DOSSIER = new URL("../../../bench/fixtures/dehashed-fixture/", import.meta.url);
const SNAPSHOT = new URL("../../../bench/fixtures/dehashed-fixture/normalized.snapshot.json", import.meta.url);

after(async () => {
  await closePools();
});

/** Collecte avec un `fetch` qui échoue : tout appel réseau casse le test. */
async function reponsesSansReseau(): Promise<ReponseNormalisee[]> {
  const fetchOriginal = globalThis.fetch;
  let appels = 0;
  globalThis.fetch = (async () => {
    appels += 1;
    throw new Error("appel réseau interdit dans les tests de fixture");
  }) as typeof fetch;
  try {
    const reponses = await collecterReponsesFixture(FIXTURES_DEHASHED, chargeurLocal(DOSSIER));
    assert.equal(appels, 0, "aucun appel réseau");
    return reponses;
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}

test("cinq fixtures validées par le contrat, conformes au snapshot", async () => {
  const reponses = await reponsesSansReseau();
  assert.equal(reponses.length, 5);
  assert.deepEqual(ReponseNormaliseeSchema.array().parse(reponses), reponses);
  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8")) as unknown;
  assert.deepEqual(reponses, snapshot);
});

test("les données personnelles des réponses brutes n'atteignent jamais la sortie", async () => {
  const brut = await readFile(new URL(FIXTURES_DEHASHED[0]!, DOSSIER), "utf8");
  assert.match(brut, /mot-de-passe-fictif/);
  const sortie = JSON.stringify(await reponsesSansReseau());
  assert.doesNotMatch(sortie, /mot-de-passe-fictif|utilisateur-fictif|203\.0\.113/);
  assert.doesNotMatch(sortie, /"email"|"password"|"ip"/);
});

test("la migration et l'adaptateur donnent exactement cinq références dehashed-fixture", async () => {
  const avant = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM fuite_reference WHERE source = $1",
    [SOURCE_FIXTURE],
  );
  assert.equal(Number(avant.rows[0]?.n), 5, "migration : cinq références déjà présentes");

  const reponses = await reponsesSansReseau();
  assert.equal(await enregistrerReponsesFixture(reponses), 5);

  const apres = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM fuite_reference WHERE source = $1",
    [SOURCE_FIXTURE],
  );
  assert.equal(Number(apres.rows[0]?.n), 5, "réécriture idempotente : toujours cinq références");

  const { rows } = await query<{ id: string; source_url: string }>(
    `SELECT id, source_url FROM fuite_reference WHERE source = $1 ORDER BY id`,
    [SOURCE_FIXTURE],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    reponses.map((r) => r.reference.id).sort((a, b) => a.localeCompare(b)),
  );
  assert.equal(
    rows.every((r) => r.source_url.startsWith("https://example.invalid/dehashed-fixture/")),
    true,
  );
});
