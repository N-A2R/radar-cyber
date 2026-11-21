import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

/**
 * Départements présents dans le fil « Aujourd'hui » (GET /today), avec leur
 * nombre d'événements sur 24 h. Lecture seule et anonyme, comme `/stats` :
 * seules des données publiques déjà exposées par `/today` sont agrégées.
 *
 * On ne renvoie que les départements qui ont au moins un événement rattaché
 * sur la période : proposer un département dont le filtre donnerait une liste
 * vide serait un piège, pas une information.
 */

type DeptRow = {
	dept: string;
	evenements: number;
	organisations: number;
};

export default async function (app: FastifyInstance) {
	app.get("/stats/departements", async () => {
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
