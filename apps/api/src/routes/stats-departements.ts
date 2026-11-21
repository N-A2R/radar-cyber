import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

/**
 * Départements du fil « Aujourd'hui » (GET /today), avec leurs événements sur
 * 24 h. Lecture seule et anonyme, comme `/today` : seules des données publiques
 * déjà exposées par le fil sont agrégées.
 *
 * On ne renvoie que les départements qui ont au moins un événement rattaché
 * sur la période : proposer un département dont le filtre donnerait une liste
 * vide serait un piège, pas une information.
 *
 * URL dédiée : `/api/stats/departements` est réservé aux statistiques 7 jours
 * de `routes/stats.ts` (organisations, événements, sources actives). Les deux
 * plugins sont enregistrés dans `server.ts` ; un même chemin ferait échouer le
 * démarrage avec `FST_ERR_DUPLICATED_ROUTE`.
 */

type DeptRow = {
	dept: string;
	evenements: number;
	organisations: number;
};

export default async function (app: FastifyInstance) {
	app.get("/today/departements", async () => {
		const { rows } = await query<DeptRow>(
			`SELECT o.dept,
			        count(*)::int AS evenements,
			        count(DISTINCT o.id)::int AS organisations
			   FROM event e
			   JOIN org o ON o.id = e.org_id
			  WHERE o.dept IS NOT NULL AND o.dept <> ''
			    AND COALESCE(e.observed_at, e.collected_at) >= now() - interval '24 hours'
			  GROUP BY o.dept
			  ORDER BY evenements DESC, o.dept ASC`,
		);
		return {
			departements: rows.map((r) => ({
				dept: r.dept,
				evenements: Number(r.evenements),
				organisations: Number(r.organisations),
			})),
		};
	});
}
