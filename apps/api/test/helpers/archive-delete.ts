/**
 * Migration 231 : un événement ne peut être supprimé qu'après une copie
 * intégrale dans `archive_event`. Les fixtures de test écrivent et effacent
 * leurs événements : ce helper porte la séquence complète, une seule fois,
 * plutôt que de la dupliquer dans chaque fichier de test.
 *
 * `where` est un prédicat SQL interne aux tests (jamais une entrée utilisateur)
 * et `params` ses paramètres liés. Aucune écriture hors de la base jetable
 * fournie par test/run.ts.
 */
import { query } from "../../src/db.js";

const COLUMNS = `(id, dedup_key, family, assertion_type, title, summary, observed_at, collected_at,
  valid_at, at, severity, confidence, source_id, source_url, evidence, geo_type,
  lat, lon, org_id, asset_id, created_at)`;
const VALUES = `id, dedup_key, family, assertion_type, title, summary, observed_at, collected_at,
  valid_at, at, severity, confidence, source_id, source_url, evidence, geo_type,
  lat, lon, org_id, asset_id, created_at`;

/** Écrit la copie intégrale et renvoie les clés à purger après suppression. */
export async function archiverEvenements(where: string, params: unknown[] = []): Promise<string[]> {
  const copies = await query<{ dedup_key: string }>(
    `INSERT INTO archive_event ${COLUMNS}
       SELECT ${VALUES} FROM event WHERE ${where}
     ON CONFLICT DO NOTHING RETURNING dedup_key`,
    params,
  );
  return copies.rows.map((ligne) => ligne.dedup_key);
}

/** Retire les copies et résumés créés par `archiverEvenements`. */
export async function nettoyerArchives(clefs: string[]): Promise<void> {
  if (clefs.length === 0) return;
  await query("DELETE FROM archive_event WHERE dedup_key = ANY($1::text[])", [clefs]);
  await query("DELETE FROM event_archive WHERE dedup_key = ANY($1::text[])", [clefs]);
}

/** Copie, supprime, puis nettoie les archives en une seule étape de teardown. */
export async function supprimerEvenementsArchivees(where: string, params: unknown[] = []): Promise<void> {
  const clefs = await archiverEvenements(where, params);
  await query(`DELETE FROM event WHERE ${where}`, params);
  await nettoyerArchives(clefs);
}
