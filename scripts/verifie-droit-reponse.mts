#!/usr/bin/env -S npx tsx
/**
 * Critère de sortie du chantier « droit de réponse ».
 *
 * Exécute les deux requêtes du juge, mot pour mot, puis affiche la mesure.
 * Lecture seule. Sort en erreur si l'une des deux n'est pas à zéro.
 *
 *   pnpm verifie:droit-reponse
 *   DATABASE_URL=postgres://… pnpm verifie:droit-reponse
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");

const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const client = new pg.Client({ connectionString: url, application_name: "radar-verifie-droit-reponse" });
await client.connect();

try {
  const retard = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM droit_reponse WHERE created_at<now()-interval '30 days' AND closed_at IS NULL",
  );
  const sansEvenement = await client.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM droit_reponse d WHERE NOT EXISTS (SELECT 1 FROM droit_reponse_evenement e WHERE e.demande_id=d.id)",
  );
  const mesure = await client.query<{
    total: number; ouvertes: number; en_retard: number; closes: number;
    closes_sous_delai: number; delai_moyen_jours: string | null;
    delai_max_jours: string | null; sans_evenement: number;
  }>("SELECT * FROM mesure_droit_reponse()");

  const nRetard = Number(retard.rows[0]?.n ?? 0);
  const nSans = Number(sansEvenement.rows[0]?.n ?? 0);
  const m = mesure.rows[0];

  console.log(`demandes > 30 jours encore ouvertes : ${nRetard} (attendu 0)`);
  console.log(`demandes sans aucun événement         : ${nSans} (attendu 0)`);
  if (m) {
    console.log(
      `mesure : ${m.total} demande(s), ${m.ouvertes} ouverte(s), ${m.en_retard} en retard, ` +
      `${m.closes} close(s) dont ${m.closes_sous_delai} sous délai, ` +
      `délai moyen ${m.delai_moyen_jours ?? "n/a"} j, maximum ${m.delai_max_jours ?? "n/a"} j`,
    );
  }
  const atteint = nRetard === 0 && nSans === 0;
  console.log(atteint ? "OBJECTIF ATTEINT" : "OBJECTIF NON ATTEINT");
  if (!atteint) process.exitCode = 1;
} finally {
  await client.end();
}
