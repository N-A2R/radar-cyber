#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Vérifie le critère « cartographie NIS2 des organisations assujetties ».
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-nis2-classement.mts
 *
 * Les deux requêtes du juge externe sont exécutées telles quelles : leur
 * sortie brute fait foi. Aucune écriture en base.
 */
import { closePools, query } from "../apps/api/src/db.js";

const CRITERE_LIGNES =
  "SELECT count(*) FROM org_nis2 WHERE (categorie NOT IN ('essentielle','importante') OR motif IS NULL OR siren IS NULL OR classes_le IS NULL);";
const CRITERE_ASSUJETTIS =
  "SELECT count(*) FROM org o WHERE o.kind IN ('operateur_critique','ess') AND o.id NOT IN (SELECT org_id FROM org_nis2);";

try {
  const lignes = await query<{ count: string }>(CRITERE_LIGNES);
  const assujettis = await query<{ count: string }>(CRITERE_ASSUJETTIS);
  const total = await query<{ total: string; avec_preuve: string }>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE preuve->>'siren_etabli' = 'true')::text AS avec_preuve
       FROM org_nis2`,
  );

  console.log(`requete_1=${CRITERE_LIGNES}`);
  console.log(`resultat_1=${lignes.rows[0]?.count}`);
  console.log(`requete_2=${CRITERE_ASSUJETTIS}`);
  console.log(`resultat_2=${assujettis.rows[0]?.count}`);
  console.log(`classes=${total.rows[0]?.total}`);
  console.log(`siren_etabli=${total.rows[0]?.avec_preuve}`);
  console.log(`verdict=${lignes.rows[0]?.count === "0" && assujettis.rows[0]?.count === "0" ? "ok" : "echec"}`);

  if (lignes.rows[0]?.count !== "0" || assujettis.rows[0]?.count !== "0") {
    process.exitCode = 1;
  }
} finally {
  await closePools();
}
