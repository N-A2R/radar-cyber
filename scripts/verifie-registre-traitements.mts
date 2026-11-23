#!/usr/bin/env -S npx tsx
/**
 * Critère de sortie du chantier « registre des traitements du corpus ».
 *
 * Exécute la requête du juge, mot pour mot, sur la base visée par DATABASE_URL
 * et affiche sa sortie brute. Lecture seule ; sort 0 uniquement si count = 0.
 *
 *   pnpm verify:registre-traitements
 *   DATABASE_URL=postgres://… pnpm verify:registre-traitements
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");

const JUGE = `SELECT count(*) FROM source s LEFT JOIN registre_traitement r ON r.source_id=s.id WHERE s.enabled AND (r.id IS NULL OR r.base_legale IS NULL OR r.duree_jours IS NULL OR r.finalite IS NULL);`;

const url = process.env.DATABASE_URL ?? "postgres://radar:radar@localhost:5432/radar";
const client = new pg.Client({ connectionString: url, application_name: "radar-verifie-registre-traitements" });
await client.connect();

try {
  console.log("--- critère de sortie (requête exécutée telle quelle) ---");
  console.log(JUGE);
  const resultat = await client.query<{ count: string }>(JUGE);
  const count = resultat.rows[0]?.count;
  console.log(`count = ${count}`);

  if (count === "0") {
    console.log("OK : aucune source active n'a de registre incomplet.");
  } else {
    console.error("ÉCHEC : des sources actives ont un registre incomplet.");
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
