import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { MANDATE_ROLES, NA_DEPARTMENTS, type MandateRole } from "../public-mandates/plan.js";

/**
 * Public, read-only view of the role-level public office referential.
 *
 * The projection is a fixed whitelist of office columns: no organisation
 * name, person name, contact detail or victim information is ever selected.
 */
type MandateRow = {
	orgId: number;
	siren: string | null;
	mandateRole: string;
	jurisdictionKind: string;
	jurisdictionCode: string;
	dept: string | null;
	source: string;
	proofUrl: string;
};

const isRole = (value: string): value is MandateRole =>
	(MANDATE_ROLES as readonly string[]).includes(value);

function boundedInteger(raw: unknown, fallback: number, max: number): number {
	const value = typeof raw === "string" ? Number(raw) : fallback;
	return Number.isInteger(value) && value >= 0 ? Math.min(value, max) : fallback;
}

export default async function (app: FastifyInstance) {
	app.get("/public-mandates", async (request) => {
		const params = request.query as Record<string, unknown>;
		const role = typeof params.role === "string" && isRole(params.role) ? params.role : null;
		const dept = typeof params.dept === "string" && NA_DEPARTMENTS[params.dept] === true
			? params.dept
			: null;
		const limit = boundedInteger(params.limit, 50, 500);
		const offset = boundedInteger(params.offset, 0, 100_000);

		const filters: string[] = [];
		const values: unknown[] = [];
		if (role) {
			values.push(role);
			filters.push(`pm.mandate_role = $${values.length}`);
		}
		if (dept) {
			values.push(dept);
			filters.push(`pm.dept = $${values.length}`);
		}
		const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

		const [{ rows: byRoleRows }, { rows: mandateRows }] = await Promise.all([
			query<{ mandateRole: string; n: number }>(
				`SELECT pm.mandate_role AS "mandateRole", count(*)::int AS n
				   FROM public_mandate pm ${where}
				  GROUP BY pm.mandate_role`,
				values,
			),
			query<MandateRow>(
				`SELECT pm.org_id AS "orgId", pm.siren, pm.mandate_role AS "mandateRole",
				        pm.jurisdiction_kind AS "jurisdictionKind",
				        pm.jurisdiction_code AS "jurisdictionCode", pm.dept,
				        pm.source, pm.proof_url AS "proofUrl"
				   FROM public_mandate pm ${where}
				  ORDER BY pm.dept NULLS LAST, pm.jurisdiction_code
				  LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
				[...values, limit, offset],
			),
		]);

		const byRole = Object.fromEntries(MANDATE_ROLES.map((r) => [r, 0])) as Record<MandateRole, number>;
		for (const row of byRoleRows) {
			if (isRole(row.mandateRole)) byRole[row.mandateRole] = Number(row.n);
		}
		return {
			total: Object.values(byRole).reduce((sum, n) => sum + n, 0),
			byRole,
			mandates: mandateRows,
		};
	});
}
