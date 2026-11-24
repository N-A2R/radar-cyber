/**
 * Vérification reproductible de l'objectif DORA : 10 incidents de test,
 * 10 dossiers EBA Annexe I pré-remplis, horloge 4 h / 72 h respectée.
 *
 *   pnpm verifie:objectif-dora
 *
 * Base jetable créée depuis db/init.sql + toutes les migrations, aucun réseau,
 * aucune donnée réelle. La requête du juge est affichée puis exécutée telle
 * quelle : sa sortie brute fait foi.
 */
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDatabase, dropTestDatabase } from "../apps/api/test/helpers/testdb.js";

const CRITERE =
  "SELECT count(*) FROM export_dora WHERE classified_at IS NULL OR initial_at>classified_at+interval '4 hours' OR intermediate_at>classified_at+interval '72 hours';";
const SUFFIXE = `dora${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SOURCE = `test:${SUFFIXE}:source-nationale`;
const dossier = await mkdtemp(join(tmpdir(), "radar-objectif-dora-"));
const ids: string[] = [];
let db: Awaited<ReturnType<typeof createTestDatabase>> | null = null;
let ok = true;

try {
  db = await createTestDatabase();
  process.env.DATABASE_URL = db.url;
  const { query, closePools } = await import("../apps/api/src/db.js");
  const { exporterDossiersDora, validerDossier } = await import("../apps/api/src/report/export-dora.js");

  await query(
    `INSERT INTO source (id, name, family, url, region, enabled)
     VALUES ($1, 'Source nationale de test', 'vuln', 'https://exemple.invalid/dora', 'national', false)`,
    [SOURCE],
  );
  for (let i = 0; i < 10; i += 1) {
    const classification = new Date(Date.UTC(2026, 10, 20 + (i === 9 ? 1 : 0), 8, i, 0));
    const insere = await query<{ id: string }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, severity, confidence,
                          dept, at, valid_at, observed_at, source_id, source_url, evidence, classified_at)
       VALUES ($1, 'ransomware', 'confirmed_incident', $2, 'Synthétique — aucun récit de victime', 4,
               'B2', '33', now(), $3, $3, $4, 'https://article.example/private',
               '{"run_id":"1"}'::jsonb, $3)
       RETURNING id::text`,
      [`test:${SUFFIXE}:incident-${i}`, `Incident de test ${i} ${SUFFIXE}`, classification.toISOString(), SOURCE],
    );
    const id = insere.rows[0]?.id;
    if (!id) throw new Error("incident de test non inséré");
    ids.push(id);
  }

  // La base jetable contient aussi les incidents backfillés par la migration :
  // la mesure ne porte que sur les dix incidents semés ci-dessus.
  const exports: Awaited<ReturnType<typeof exporterDossiersDora>> = [];
  for (const id of ids) exports.push(...(await exporterDossiersDora({ sourceEventId: id, dossierSortie: dossier })));
  for (const exportDora of exports) validerDossier(exportDora.dossier);
  const fichiers = (await readdir(dossier)).filter((nom) => /^dora_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]+\.json$/.test(nom));

  const brut = await query<{ count: string }>(CRITERE);
  const count = brut.rows[0]?.count ?? "-1";
  console.log(CRITERE);
  console.log(" count ");
  console.log("-------");
  console.log(` ${count}`);
  console.log("-------");
  console.log(`exports EBA Annexe I valides : ${exports.length} / 10`);
  console.log(`fichiers dora_AAAA-MM-JJ_ID.json : ${fichiers.length} / 10`);

  if (exports.length !== 10 || fichiers.length !== 10 || count !== "0") ok = false;
  console.log(`OBJECTIF : ${ok ? "atteint" : "partiel"} — ${exports.length} / 10 exports EBA Annexe I, horloge ${count}`);
  if (!ok) process.exitCode = 1;
  await closePools();
} catch (erreur) {
  console.error(erreur);
  process.exitCode = 1;
} finally {
  if (db) await dropTestDatabase(db);
  await rm(dossier, { recursive: true, force: true });
}
