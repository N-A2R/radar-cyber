/**
 * Copie intégrale avant suppression : depuis migrate-231, le trigger
 * `event_archive_avant_delete` refuse tout DELETE sans cette copie. Les
 * scripts de déduplication suppriment des événements dans la même transaction
 * que leur fusion : ils doivent donc écrire l'archive à cet endroit, avec le
 * même jeu de colonnes que la rétention et le helper de test.
 */
import type { PoolClient } from "pg";

/**
 * Archive les événements désignés par leurs identifiants. À appeler dans la
 * transaction qui porte le DELETE, avant celui-ci. `ON CONFLICT DO NOTHING`
 * garde l'opération idempotente si une clé a déjà été archivée.
 */
export async function archiverEvenements(client: PoolClient, ids: readonly number[]): Promise<number> {
	if (ids.length === 0) return 0;
	const result = await client.query<{ n: number }>(
		`INSERT INTO archive_event
		   (id, dedup_key, family, assertion_type, title, summary,
		    observed_at, collected_at, valid_at, at, severity, confidence,
		    source_id, source_url, evidence, geo_type, lat, lon, org_id, asset_id, created_at)
		 SELECT e.id, e.dedup_key, e.family, e.assertion_type, e.title, e.summary,
		        e.observed_at, e.collected_at, e.valid_at, e.at, e.severity, e.confidence,
		        e.source_id, e.source_url, e.evidence, e.geo_type, e.lat, e.lon,
		        e.org_id, e.asset_id, e.created_at
		   FROM event e
		  WHERE e.id = ANY($1::bigint[])
		 ON CONFLICT (dedup_key) DO NOTHING`,
		[[...ids]],
	);
	return result.rowCount ?? 0;
}
