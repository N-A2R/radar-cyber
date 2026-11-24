#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Vérifie le critère « exposition des domaines sans données victimes ».
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-stealer-domain-stat.mts
 *
 * La première ligne est le résultat brut de la requête exacte du juge.
 */
import { readFile } from "node:fs/promises";
import { closePools, query } from "../apps/api/src/db.js";
import {
  FIXTURES_HIBP_DOMAIN_SEARCH,
  SOURCE_FIXTURE,
  chargeurLocal,
  collecterStatistiquesFixture,
} from "../apps/api/src/leaks/hibp-domain-search-fixture.js";

const DOSSIER = new URL("../bench/fixtures/hibp-domain-search/", import.meta.url);
const SNAPSHOT = new URL("../bench/fixtures/hibp-domain-search/normalized.snapshot.json", import.meta.url);
const CRITERE = "SELECT count(*) FROM stealer_domain_stat";
const SEUIL = 50;

try {
  const statistiques = await collecterStatistiquesFixture(
    FIXTURES_HIBP_DOMAIN_SEARCH,
    chargeurLocal(DOSSIER),
  );
  const snapshot = JSON.parse(await readFile(SNAPSHOT, "utf8")) as unknown;
  const snapshotIdentique = JSON.stringify(statistiques) === JSON.stringify(snapshot);
  const resultat = await query<{ count: string }>("SELECT count(*)::text AS count FROM stealer_domain_stat");
  const total = Number(resultat.rows[0]?.count ?? 0);
  const parSource = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM stealer_domain_stat WHERE source = $1",
    [SOURCE_FIXTURE],
  );

  const insert = `INSERT INTO stealer_domain_stat
    (domaine, source, occurrences, premiere_vue, derniere_vue)
    VALUES ($1, $2, 1, CURRENT_DATE, CURRENT_DATE)`;
  const refus: Record<string, string> = {};
  for (const [nom, params] of Object.entries({
    courriel: ["victime@example.com", SOURCE_FIXTURE],
    mot_de_passe: ["password.exemple.test", SOURCE_FIXTURE],
  })) {
    try {
      await query(insert, params);
      refus[nom] = "ACCEPTE";
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      refus[nom] = `${e.code ?? "?"}:${e.constraint ?? "?"}`;
    }
  }

  const ok =
    total >= SEUIL &&
    Number(parSource.rows[0]?.n ?? 0) >= SEUIL &&
    snapshotIdentique &&
    Object.values(refus).every((v) => v.startsWith("23514:"));

  console.log(`${CRITERE} = ${total}`);
  console.log(`seuil=${SEUIL}`);
  console.log(`lignes_source_fixture=${parSource.rows[0]?.n ?? 0}`);
  console.log(`fixtures=${FIXTURES_HIBP_DOMAIN_SEARCH.length}`);
  console.log(`lignes_normalisees=${statistiques.length}`);
  console.log(`snapshot=${snapshotIdentique ? "identique" : "different"}`);
  console.log(`refus_courriel=${refus.courriel}`);
  console.log(`refus_mot_de_passe=${refus.mot_de_passe}`);
  console.log(`verdict=${ok ? "ok" : "echec"}`);
  if (!ok) process.exitCode = 1;
} finally {
  await closePools();
}
