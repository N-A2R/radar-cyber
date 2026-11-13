import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { construireDossier, type EtatSysteme } from "../analyse/dossier-reprise.js";

/**
 * GET /api/dossier — le dossier de reprise en JSON, pour le front et l'audit.
 * Chaque chiffre vient d'une requête ; ce qui n'est pas mesuré est écrit
 * « non mesuré » côté analyse/dossier-reprise.ts.
 */
export default async function (app: FastifyInstance) {
	app.get("/dossier", async () => {
		const get = async (sql: string): Promise<number> => {
			try {
				const r = await query<{ n: number }>(sql);
				return r.rows[0]?.n ?? 0;
			} catch {
				return 0;
			}
		};
		const organisations = await get("SELECT count(*)::int AS n FROM org");
		const sources = await get("SELECT count(*)::int AS n FROM source");
		const sourcesActives = await get("SELECT count(*)::int AS n FROM source WHERE enabled IS NOT DISTINCT FROM true");
		let sourcesMuettes = 0;
		try {
			const r = await query<{ n: number }>(
				`SELECT count(*)::int AS n FROM source s
				 WHERE NOT EXISTS (SELECT 1 FROM event e WHERE e.source_id = s.id AND e.created_at >= now() - interval '24 hours')
				   AND s.enabled IS NOT DISTINCT FROM true`,
			);
			sourcesMuettes = r.rows[0]?.n ?? 0;
		} catch {}
		const evenements = await get("SELECT count(*)::int AS n FROM event");
		const evenements30j = await get("SELECT count(*)::int AS n FROM event WHERE created_at >= now() - interval '30 days'");
		const indicateurs = await get("SELECT count(*)::int AS n FROM indicator");
		const alertes = await get("SELECT count(*)::int AS n FROM alert");
		const journalEvenements = await get("SELECT count(*)::int AS n FROM journal");
		const archives = await get("SELECT count(*)::int AS n FROM event_archive");
		const regles = await get("SELECT count(*)::int AS n FROM detection_rule");
		let migrations = 0;
		let derniereMigration: string | null = null;
		try {
			const r = await query<{ n: number; derniere: string | null }>(
				`SELECT (SELECT count(*)::int FROM schema_migrations) AS n,
				        (SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1) AS derniere`,
			);
			migrations = r.rows[0]?.n ?? 0;
			derniereMigration = r.rows[0]?.derniere ?? null;
		} catch {}
		const domainesConnus = await get("SELECT count(*)::int AS n FROM org WHERE domain IS NOT NULL");
		const etat: EtatSysteme = {
			organisations,
			sources,
			sourcesActives,
			sourcesMuettes,
			evenements,
			evenements30j,
			indicateurs,
			alertes,
			journalEvenements,
			archives,
			regles,
			migrations,
			derniereMigration,
			domainesConnus,
		};
		const dossier = construireDossier(etat);
		return { etat, dossier };
	});
}
