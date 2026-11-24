/**
 * GET /api/certificat-ignorance — état explicite de ce que le radar ignore.
 *
 * Lecture seule, sans donnée personnelle : identifiant public de l'org,
 * champ inconnu, raison et date du contrôle. La portée est répétée dans la
 * réponse pour éviter de transformer une absence de preuve en affirmation
 * sur le monde.
 */
import type { FastifyInstance } from "fastify";
import { badRequest } from "../errors.js";
import { query } from "../db.js";
import {
	CRITERE_ORG_UNKNOWN_SQL,
	PORTEE_CERTIFICAT,
	type OrgUnknownField,
} from "../orgs/unknown-certificate.js";

type Row = {
	org_id: number;
	org_slug: string;
	unknown_field: OrgUnknownField;
	reason: string;
	checked_at: string;
};

export default async function certificatIgnoranceRoute(app: FastifyInstance) {
	app.get("/certificat-ignorance", async (req) => {
		const q = req.query as Record<string, string | undefined>;
		const limit = q.limit === undefined ? 100 : Number(q.limit);
		if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
			throw badRequest("limit doit être un entier entre 1 et 500");
		}
		const orgId = q.orgId === undefined ? null : Number(q.orgId);
		if (orgId !== null && (!Number.isInteger(orgId) || orgId <= 0)) {
			throw badRequest("orgId doit être un entier positif");
		}

		const params: unknown[] = [];
		const clauses: string[] = ["u.unknown_field IS NOT NULL", "u.checked_at IS NOT NULL"];
		if (orgId !== null) {
			params.push(orgId);
			clauses.push(`u.org_id = $${params.length}`);
		}
		params.push(limit);

		const rows = await query<Row>(
			`SELECT u.org_id, o.slug AS org_slug, u.unknown_field, u.reason, u.checked_at
			   FROM org_unknown u
			   JOIN org o ON o.id = u.org_id
			  WHERE ${clauses.join(" AND ")}
			  ORDER BY u.checked_at DESC, u.org_id, u.unknown_field
			  LIMIT $${params.length}`,
			params,
		);
		const total = await query<{ n: string }>(CRITERE_ORG_UNKNOWN_SQL);

		return {
			portee: PORTEE_CERTIFICAT,
			methode: "unknown-field-scan-v1",
			total: Number(total.rows[0]?.n ?? 0),
			count: rows.rows.length,
			ignorances: rows.rows.map((row) => ({
				orgId: row.org_id,
				orgSlug: row.org_slug,
				unknownField: row.unknown_field,
				reason: row.reason,
				checkedAt: new Date(row.checked_at).toISOString(),
			})),
		};
	});
}
