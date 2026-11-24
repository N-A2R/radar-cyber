import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { etagOu304 } from "../etag.js";
import { evenementPublicSql } from "../security/tlp.js";

/**
 * Écran « Aujourd'hui » — tout ce qu'il faut pour ouvrir l'app et lire les
 * dernières 24 h en un seul appel : deux compteurs en tête (organisations
 * reliées sur 7 j, événements sur 24 h) et le fil d'événements avec ses
 * jointures réelles (organisation, source, département).
 *
 * Lecture seule et anonyme, comme `/na/*` : titres, sources et dates publiques.
 * Seuls les faits TLP:CLEAR sont listés — un titre peut porter un indicateur
 * restreint. Aucun résumé n'est renvoyé ici ; l'inspecteur authentifié reste
 * le chemin vers le détail.
 *
 * La date d'un événement est `COALESCE(observed_at, collected_at)` — la même
 * définition partout (API, compteurs, preuve psql) : un seul moment, un seul
 * chiffre.
 */

type CompteurRow = {
	evenements24h: number;
	organisations7j: number;
	derniereCollecte: string | null;
};

type TodayRow = {
	id: number;
	title: string;
	family: string;
	severity: number;
	observed_at: string | null;
	collected_at: string | null;
	source_id: string;
	source_name: string | null;
	source_url: string | null;
	org_id: number | null;
	org_name: string | null;
	dept: string | null;
};

export default async function (app: FastifyInstance) {
	app.get("/today", async (req, reply) => {
		const q = req.query as Record<string, string | undefined>;

		// Compteurs en tête : en direct, sans rapport avec les filtres — ce sont
		// les chiffres de la situation, pas ceux de la sélection.
		const compteurs = await query<CompteurRow>(
			`SELECT (SELECT count(*)::int FROM event e
			          WHERE COALESCE(e.observed_at, e.collected_at) >= now() - interval '24 hours'
			            AND ${evenementPublicSql("e")}) AS "evenements24h",
			        (SELECT count(DISTINCT org_id)::int FROM event
			          WHERE org_id IS NOT NULL
			            AND COALESCE(observed_at, collected_at) >= now() - interval '7 days') AS "organisations7j",
			        (SELECT max(started_at)::text FROM collector_run) AS "derniereCollecte"`,
		);

		const params: unknown[] = [];
		const where: string[] = [
			"COALESCE(e.observed_at, e.collected_at) >= now() - interval '24 hours'",
			evenementPublicSql("e"),
		];
		if (q.family) { params.push(q.family); where.push(`e.family = $${params.length}`); }
		if (q.dept) { params.push(q.dept); where.push(`o.dept = $${params.length}`); }
		params.push(2000);
		const limitIdx = params.length;

		const rows = await query<TodayRow>(
			`SELECT e.id, e.title, e.family, e.severity,
			        e.observed_at::text AS observed_at, e.collected_at::text AS collected_at,
			        e.source_id, e.source_url,
			        s.name AS "source_name",
			        o.id AS "org_id", o.name AS "org_name", o.dept
			   FROM event e
			   LEFT JOIN org o ON o.id = e.org_id
			   LEFT JOIN source s ON s.id = e.source_id
			  WHERE ${where.join(" AND ")}
			  ORDER BY COALESCE(e.observed_at, e.collected_at) DESC, e.id DESC
			  LIMIT $${limitIdx}`,
			params,
		);

		const corps = {
			compteurs: {
				evenements24h: Number(compteurs.rows[0]?.evenements24h ?? 0),
				organisations7j: Number(compteurs.rows[0]?.organisations7j ?? 0),
				derniereCollecte: compteurs.rows[0]?.derniereCollecte ?? null,
			},
			evenements: rows.rows.map((r) => ({
				id: r.id,
				titre: r.title,
				famille: r.family,
				severite: r.severity,
				date: r.observed_at ?? r.collected_at,
				dateSource: r.observed_at !== null ? "observee" : "collecte",
				source: r.source_name ?? r.source_id,
				url: r.source_url,
				orgId: r.org_id,
				organisation: r.org_name,
				dept: r.dept,
			})),
		};
		if (etagOu304(reply, corps)) return;
		return corps;
	});
}
