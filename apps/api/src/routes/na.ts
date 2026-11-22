import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { evenementPublicSql } from "../security/tlp.js";

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

/** Une ligne du fil d'événements d'un département : source, date, org, famille. */
type FilRow = {
	id: number;
	title: string;
	family: string;
	observed_at: string | null;
	collected_at: string;
	source: string;
	orgId: number;
	orgName: string;
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
		// Fraîcheur : le dernier passage de collecte, toutes sources confondues.
		// « Dernière collecte il y a X » se calcule côté client à partir de cette
		// date — jamais affirmé sans requête.
		const collecte = await query<{ t: string | null }>(
			`SELECT max(started_at)::text AS t FROM collector_run`,
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
			derniereCollecte: collecte.rows[0]?.t ?? null,
			total: {
				orgs: depts.reduce((a, d) => a + d.orgs, 0),
				orgsAvecEvenement: depts.reduce((a, d) => a + d.orgsAvecEvenement, 0),
				evenements: depts.reduce((a, d) => a + d.evenements, 0),
				deptsSansEvenement: depts.filter((d) => d.evenements === 0).map((d) => d.dept),
			},
		};
	});

	/** Fil d'événements d'un département : lisible, borné, dept en liste blanche. */
	app.get("/na/events", async (req) => {
		const dept = String((req.query as { dept?: string }).dept ?? "");
		if (!DEPTS.includes(dept)) return { dept, events: [] };
		const { rows } = await query<FilRow>(
			`SELECT e.id, e.title, e.family, e.observed_at::text AS observed_at,
			        e.collected_at::text AS collected_at,
			        s.name AS source, o.id AS "orgId", o.name AS "orgName"
			   FROM event e
			   JOIN org o ON e.org_id = o.id
			   JOIN source s ON s.id = e.source_id
			  WHERE o.dept = $1
			    AND ${evenementPublicSql("e")}
			  ORDER BY coalesce(e.observed_at, e.collected_at) DESC
			  LIMIT 50`,
			[dept],
		);
		return {
			dept,
			events: rows.map((r) => ({
				id: r.id,
				title: r.title,
				family: r.family,
				observedAt: r.observed_at,
				collectedAt: r.collected_at,
				source: r.source,
				orgId: r.orgId,
				orgName: r.orgName,
			})),
		};
	});
}
