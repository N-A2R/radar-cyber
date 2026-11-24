#!/usr/bin/env -S npx tsx
/**
 * Critère de sortie du chantier « registre des violations de données ».
 *
 * Exécute la requête du juge mot pour mot, affiche sa sortie brute, puis
 * rejoue l'export mensuel : une ligne par violation du mois et une empreinte
 * SHA-256 calculée sur les octets exacts du fichier `violations_AAAA-MM.csv`.
 * Lecture seule ; sort 0 uniquement si les deux contrôles passent.
 *
 *   pnpm verifie:violations-rgpd
 *   pnpm verifie:violations-rgpd --mois=2026-11
 *   DATABASE_URL=postgres://… pnpm verifie:violations-rgpd
 */
import { createRequire } from "node:module";
import { bornesMois, construireExport, moisCourant, verifierMois } from "../apps/api/src/export/violations-rgpd.js";
import { closePools, query } from "../apps/api/src/db.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");

const JUGE = `SELECT count(*) FROM violation_rgpd WHERE date_prise_connaissance IS NULL OR echeance_72h IS NULL OR statut IS NULL OR (statut='notifiee' AND date_notification IS NULL);`;

const arg = process.argv.find((a) => a.startsWith("--mois="));
const mois = verifierMois(arg ? arg.slice("--mois=".length) : moisCourant());
const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const client = new pg.Client({ connectionString: url, application_name: "radar-verifie-violations-rgpd" });

try {
  console.log("--- critère de sortie (requête exécutée telle quelle) ---");
  console.log(JUGE);
  await client.connect();
  const resultat = await client.query<{ count: string }>(JUGE);
  const count = resultat.rows[0]?.count;
  console.log(`count = ${count}`);

  console.log("--- export mensuel (une ligne par violation, empreinte du fichier) ---");
  const [debut, fin] = bornesMois(mois);
  const attendu = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM violation_rgpd
      WHERE date_prise_connaissance >= $1::timestamptz
        AND date_prise_connaissance < $2::timestamptz`,
    [debut, fin],
  );
  const exportMois = await construireExport(mois);
  console.log(`fichier = ${exportMois.fichier}`);
  console.log(`lignes = ${exportMois.lignes}`);
  console.log(`sha256 = ${exportMois.sha256}`);
  console.log(`attendu = ${attendu.rows[0]?.n ?? "0"}`);

  const ok = count === "0"
    && exportMois.lignes === Number(attendu.rows[0]?.n ?? 0)
    && /^[0-9a-f]{64}$/.test(exportMois.sha256);
  if (ok) {
    console.log(`OK : 0 violation incomplète, ${exportMois.lignes} ligne(s) dans ${exportMois.fichier}, empreinte SHA-256 ${exportMois.sha256}.`);
  } else {
    console.error("ÉCHEC : critère de complétude ou export mensuel non conforme.");
    process.exitCode = 1;
  }
} finally {
  await client.end().catch(() => {});
  await closePools();
}
