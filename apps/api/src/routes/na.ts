import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

/**
 * Vue Nouvelle-Aquitaine — agrégats par département, un seul appel.
 *
 * Lecture seule et anonyme, comme `/directory` : le référentiel territorial est
 * de la donnée publique. Le JSON est borné aux douze départements de la région ;
 * aucun paramètre de requête n'atteint le SQL sans être passé par une liste
 * blanche.
 */

const DEPTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

type DeptRow = {
	dept: string | null;
	orgs: string;
	orgsAvecEvenement: string;
	evenements: string;
};

export default async function (app: FastifyInstance) {
	app.get("/na/overview", async () => {
		const dansNA = DEPTS.map((d) => `'${d}'`).join(",");
		const { rows } = await query<DeptRow>(
			`SELECT o.dept,
			        count(DISTINCT o.id)::text AS orgs,
			        count(DISTINCT e.org_id)::text AS "orgsAvecEvenement",
			        count(e.id)::text AS evenements
			   FROM org o
			  LEFT JOIN event e ON e.org_id = o.id
			  WHERE o.dept IN (${dansNA})
			  GROUP BY o.dept`,
		);
		const parDept = new Map(rows.map((r) => [r.dept ?? "", r]));
		const depts = DEPTS.map((code) => {
			const r = parDept.get(code);
			return {
				dept: code,
				orgs: Number(r?.orgs ?? 0),
				orgsAvecEvenement: Number(r?.orgsAvecEvenement ?? 0),
				evenements: Number(r?.evenements ?? 0),
			};
		});
		return {
			depts,
			total: {
				orgs: depts.reduce((a, d) => a + d.orgs, 0),
				orgsAvecEvenement: depts.reduce((a, d) => a + d.orgsAvecEvenement, 0),
				evenements: depts.reduce((a, d) => a + d.evenements, 0),
				deptsSansEvenement: depts.filter((d) => d.evenements === 0).map((d) => d.dept),
			},
		};
	});
}
