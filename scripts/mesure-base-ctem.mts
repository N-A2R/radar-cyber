#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Mesure de base CTEM : couverture des organisations avec actif, ports exposés
 * et fraîcheur. La dernière ligne reproduit exactement la requête du critère.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-base-ctem.mts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { closePools, query } from "../apps/api/src/db.js";
import { measureCtemBaseline } from "../apps/api/src/exposition/ctem-baseline.js";

const CRITERE =
  "SELECT count(DISTINCT org_id) FILTER (WHERE consulted_at > now()-interval '7 days')::float/count(DISTINCT org_id) FROM exposition_service;";
const CRITERE_ALIAS =
  "SELECT count(DISTINCT org_id) FILTER (WHERE consulted_at > now()-interval '7 days')::float/count(DISTINCT org_id) AS taux FROM exposition_service";
const jsonArg = process.argv.slice(2).find((arg) => arg.startsWith("--json="));
const sortie = jsonArg?.slice(7);

try {
  const mesure = await measureCtemBaseline();
  const fraicheur = await query<{ taux: number | null }>(CRITERE_ALIAS);
  const tauxJuge = fraicheur.rows[0]?.taux ?? null;

  console.log(`requete=${CRITERE}`);
  console.log(`resultat=${tauxJuge}`);
  console.log(`organisations_avec_actif=${mesure.organisations_avec_actif}`);
  console.log(`organisations_exposees=${mesure.organisations_exposees}`);
  console.log(`couverture=${mesure.couverture.toFixed(4)}`);
  console.log(`age_median_jours=${mesure.age_median_jours.toFixed(2)}`);
  console.log(`organisations_fraiches=${mesure.organisations_fraiches}`);
  console.log(`services=${mesure.services}`);
  console.log(`ports_distincts=${mesure.ports_distincts}`);
  console.log(
    `verdict=${mesure.couverture >= 0.8 && mesure.age_median_jours <= 7 && (tauxJuge ?? 0) >= 0.8 ? "ok" : "echec"}`,
  );

  if (sortie) {
    await mkdir(dirname(sortie), { recursive: true });
    await writeFile(sortie, `${JSON.stringify({ ...mesure, taux_juge: tauxJuge, critere: CRITERE }, null, 2)}\n`);
  }
} finally {
  await closePools();
}
