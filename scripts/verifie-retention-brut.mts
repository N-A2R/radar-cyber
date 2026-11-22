#!/usr/bin/env -S npx tsx
/**
 * Contrôle reproductible de la rétention déclarée des données brutes.
 *
 * Crée une base temporaire (jamais la base applicative), y insère du brut
 * périmé pour deux sources aux durées différentes, lance la vraie rétention,
 * puis exécute telle quelle la requête du juge externe et affiche les traces
 * de purge datées par source. La base est détruite dans tous les cas.
 *
 *   pnpm exec tsx scripts/verifie-retention-brut.mts
 */
import { randomBytes } from "node:crypto";
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const JUGE = `SELECT count(*) FROM quarantine_raw q JOIN registre_traitement r ON r.source_id=q.source_id WHERE q.collected_at < now()-(r.duree_jours||' days')::interval;`;

const db = await createTestDatabase();
process.env.DATABASE_URL = db.url;
// Les modules lisent DATABASE_URL à l'import : ils ne doivent être chargés
// qu'après le rattachement à la base temporaire.
const { query, closePools } = await import("../apps/api/src/db.js");
const { runRetention } = await import("../apps/api/src/maintenance/retention.js");

const marque = `verif${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const sourceA = `${marque}-a`;
const sourceB = `${marque}-b`;
const ilYA = (jours: number): string => new Date(Date.now() - jours * 86_400_000).toISOString();

try {
  await query(
    "INSERT INTO source (id, name, family, url) VALUES ($1,$2,'cti',$3), ($4,$5,'cti',$6)",
    [sourceA, `Vérification A ${marque}`, `https://exemple.invalid/${marque}/a`,
     sourceB, `Vérification B ${marque}`, `https://exemple.invalid/${marque}/b`],
  );
  await query(
    "INSERT INTO registre_traitement (source_id, duree_jours) VALUES ($1, 90), ($2, 30)",
    [sourceA, sourceB],
  );
  await query(
    `INSERT INTO quarantine_raw (source, source_url, content_hash, received_at)
     VALUES ($1,$2,$3,$4), ($1,$2,$5,$6), ($7,$8,$9,$10), ($7,$8,$11,$12)`,
    [sourceA, `https://exemple.invalid/${marque}/a`, `${marque}:a:120j`, ilYA(120),
     `${marque}:a:neuf`, ilYA(2),
     sourceB, `https://exemple.invalid/${marque}/b`, `${marque}:b:40j`, ilYA(40),
     `${marque}:b:neuf`, ilYA(2)],
  );

  const avant = await query<{ count: string }>(JUGE);
  console.log(`brut périmé avant purge : ${avant.rows[0]?.count}`);

  const resultat = await runRetention(() => {}, { tables: ["quarantine_raw"] });
  console.log(`purge : ${resultat.rawRows} ligne(s), ${resultat.rawSources} source(s)`);

  console.log("--- critère de sortie (requête exécutée telle quelle) ---");
  console.log(JUGE);
  const apres = await query<{ count: string }>(JUGE);
  console.log(`count = ${apres.rows[0]?.count}`);

  console.log("--- traces de purge datées par source (dernier trimestre) ---");
  const traces = await query<{ subject: string; summary: string; recorded_at: string }>(
    `SELECT subject, summary, recorded_at FROM journal
      WHERE kind = 'event.purge' AND subject = ANY($1::text[])
        AND recorded_at >= now() - interval '3 months'
      ORDER BY subject`,
    [[sourceA, sourceB]],
  );
  for (const trace of traces.rows) {
    console.log(`${trace.subject} | ${trace.recorded_at} | ${trace.summary}`);
  }

  if (apres.rows[0]?.count !== "0" || traces.rows.length !== 2) {
    console.error("ÉCHEC : la rétention déclarée n'est pas respectée.");
    process.exitCode = 1;
  } else {
    console.log("OK : 0 ligne périmée, 2 traces datées.");
  }
} finally {
  await closePools().catch(() => undefined);
  await dropTestDatabase(db);
}
