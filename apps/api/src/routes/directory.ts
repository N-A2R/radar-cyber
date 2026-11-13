import type { FastifyInstance } from "fastify";
import { queryDirectory, type DirectoryDir, type DirectorySort } from "../directory/query.js";

/**
 * Annuaire paginé, facetté et classé.
 *
 * Lecture seule et anonyme, comme `GET /orgs` : le référentiel territorial est
 * de la donnée publique. La fiche détaillée (`/orgs/:id`) reste authentifiée.
 *
 * Tous les paramètres sont validés ici : liste blanche pour le tri et la
 * direction, bornes dures pour la pagination. Rien de la requête n'atteint le
 * SQL sans être passé par un paramètre lié.
 */

const SORTS: readonly DirectorySort[] = ["relevance", "name", "eventCount", "city", "dept"];

type Query = {
	q?: string;
	kind?: string;
	sector?: string;
	dept?: string;
	withEvents?: string;
	withoutEvents?: string;
	sort?: string;
	dir?: string;
	page?: string;
	limit?: string;
};

function boundedInt(raw: string | undefined, fallback: number, max: number): number {
	const value = Number(raw);
	if (!Number.isFinite(value) || value < 0) return fallback;
	return Math.min(max, Math.floor(value));
}

export default async function (app: FastifyInstance) {
	app.get("/directory", async (req, reply) => {
		const q = req.query as Query;
		const sort = SORTS.includes(q.sort as DirectorySort) ? (q.sort as DirectorySort) : undefined;
		const dir: DirectoryDir = q.dir === "desc" ? "desc" : "asc";
		const dept = q.dept?.trim();
		// Un département est un code INSEE de deux ou trois caractères.
		if (dept && !/^[0-9ABab]{2,3}$/.test(dept)) {
			reply.code(400).send({ error: "invalid dept" });
			return;
		}
		const text = q.q?.trim() ?? "";
		if (text.length > 120) {
			reply.code(400).send({ error: "query too long" });
			return;
		}
		return queryDirectory({
			q: text,
			kind: q.kind?.trim() || null,
			sector: q.sector?.trim() || null,
			dept: dept || null,
			withEvents: q.withEvents === "1" || q.withEvents === "true",
			withoutEvents: q.withoutEvents === "1" || q.withoutEvents === "true",
			sort,
			dir,
			page: boundedInt(q.page, 0, 1000),
			limit: boundedInt(q.limit, 50, 200),
		});
	});
}
