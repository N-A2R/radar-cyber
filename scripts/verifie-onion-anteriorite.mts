#!/usr/bin/env -S npx tsx
/**
 * Vérifie l'objectif chiffré de l'antériorité des mentions .onion (chantier 115).
 *
 *   pnpm verifie:onion-anteriorite
 *
 * Base éphémère reconstruite depuis les migrations : aucune donnée de
 * production n'est lue ni modifiée, la base est détruite dans tous les cas.
 * La requête affichée est le critère exécuté tel quel par le vérificateur.
 */
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const TARGET = 20;
const db = await createTestDatabase();
process.env.DATABASE_URL = db.url;
const { query, closePools } = await import("../apps/api/src/db.js");
const { MIN_ONION_LEAD_DAYS, ONION_LEAD_OBJECTIVE_SQL } = await import(
  "../apps/api/src/analyse/onion-anteriorite.js"
);

await query("SELECT public.reseed_onion_lead_bench()");
let code = 1;
try {
  console.log(`SQL> ${ONION_LEAD_OBJECTIVE_SQL};`);
  const result = await query<{ count: string }>(ONION_LEAD_OBJECTIVE_SQL);
  console.log(" count");
  console.log("-------");
  console.log(` ${result.rows[0]!.count}`);
  console.log(`(1 row)`);

  const value = Number(result.rows[0]!.count);
  const reached = value >= TARGET;
  console.log(
    `OBJECTIF : ${reached ? "atteint" : "partiel"} — ${value} / ${TARGET} leads .onion géolocalisés ` +
    `à au moins ${MIN_ONION_LEAD_DAYS} jours de la première victime régionale confirmée`,
  );
  code = reached ? 0 : 1;
} finally {
  await closePools();
  await dropTestDatabase(db);
}
process.exit(code);
