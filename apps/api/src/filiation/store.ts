/**
 * Database access for organisation filiation links.
 *
 * All writes are idempotent and scoped to links carrying the `siren-prefix`
 * proof, so unrelated parent links are never cleared.
 */
import { query, withIngestTransaction } from "../db.js";
import { NA_DEPARTMENTS, type FiliationLink, type FiliationOrg } from "./siret.js";

const DEPTS_SQL = Object.keys(NA_DEPARTMENTS).map((d) => `'${d}'`).join(",");
const SITE_SQL = `c.entity_source = 'sirene-site' AND c.valid_to IS NULL AND c.dept IN (${DEPTS_SQL}) AND c.entity_code ~ '^[0-9]{14}$'`;
const PARENT_SQL = `c.entity_source = 'sirene' AND c.valid_to IS NULL AND c.dept IN (${DEPTS_SQL})`;

export const FILIATION_QUERIES = {
	candidates: `SELECT count(*)::text AS n FROM org c JOIN org p
		ON p.entity_source = 'sirene' AND p.entity_code = left(c.entity_code, 9)
		AND p.valid_to IS NULL AND p.dept IN (${DEPTS_SQL})
		WHERE ${SITE_SQL}`,
	established: `SELECT count(*)::text AS n FROM org c JOIN org p ON p.id = c.parent_org_id
		WHERE c.parent_evidence->>'method' = 'siren-prefix'
		AND c.valid_to IS NULL AND p.valid_to IS NULL
		AND c.dept IN (${DEPTS_SQL}) AND p.dept IN (${DEPTS_SQL})`,
	byDepartment: `SELECT c.dept, count(*)::text AS n FROM org c JOIN org p ON p.id = c.parent_org_id
		WHERE c.parent_evidence->>'method' = 'siren-prefix'
		AND c.valid_to IS NULL AND p.valid_to IS NULL
		AND c.dept IN (${DEPTS_SQL}) AND p.dept IN (${DEPTS_SQL})
		GROUP BY c.dept ORDER BY c.dept`,
} as const;

export type FiliationMeasure = {
	candidates: number;
	established: number;
	byDepartment: Record<string, number>;
};

/** Fetch the two sides of every possible link, without loading the whole org table. */
export async function fetchFiliationCandidates(): Promise<FiliationOrg[]> {
	const sites = await query<FiliationOrg>(
		`SELECT id, entity_code AS "entityCode", entity_source AS "entitySource",
		        dept, valid_to AS "validTo"
		 FROM org c WHERE ${SITE_SQL}`,
	);
	const parentCodes = [...new Set(sites.rows.map((row) => row.entityCode?.slice(0, 9)).filter(Boolean))];
	if (parentCodes.length === 0) return sites.rows;

	const parents = await query<FiliationOrg>(
		`SELECT id, entity_code AS "entityCode", entity_source AS "entitySource",
		        dept, valid_to AS "validTo"
		 FROM org c WHERE ${PARENT_SQL} AND c.entity_code = ANY($1::text[])`,
		[parentCodes],
	);
	return [...parents.rows, ...sites.rows];
}

/** Store links and their proof. Returns the number of rows actually changed. */
export async function applyFiliationLinks(links: readonly FiliationLink[]): Promise<number> {
	if (links.length === 0) return 0;
	const childIds = links.map((link) => link.childId);
	const parentIds = links.map((link) => link.parentId);
	const evidences = links.map((link) => JSON.stringify(link.evidence));

	let changed = 0;
	await withIngestTransaction(async (client) => {
		await client.query(
			`UPDATE org SET parent_org_id = NULL, parent_evidence = NULL
			 WHERE parent_org_id IS NOT NULL
			   AND parent_evidence IS NOT NULL
			   AND parent_evidence->>'method' = 'siren-prefix'
			   AND NOT (id = ANY($1::int[]))`,
			[childIds],
		);
		const result = await client.query(
			`UPDATE org AS c
			    SET parent_org_id = v.parent_id,
			        parent_evidence = v.evidence::jsonb
			   FROM unnest($1::int[], $2::int[], $3::text[]) AS v(child_id, parent_id, evidence)
			  WHERE c.id = v.child_id
			    AND (c.parent_org_id IS DISTINCT FROM v.parent_id
			         OR c.parent_evidence IS DISTINCT FROM v.evidence::jsonb)`,
			[childIds, parentIds, evidences],
		);
		changed = result.rowCount ?? 0;
	});
	return changed;
}

/** Reproducible measurement: raw candidates and links actually carrying proof. */
export async function measureFiliation(): Promise<FiliationMeasure> {
	const [candidates, established, byDept] = await Promise.all([
		query<{ n: string }>(FILIATION_QUERIES.candidates),
		query<{ n: string }>(FILIATION_QUERIES.established),
		query<{ dept: string; n: string }>(FILIATION_QUERIES.byDepartment),
	]);
	return {
		candidates: Number(candidates.rows[0]?.n ?? 0),
		established: Number(established.rows[0]?.n ?? 0),
		byDepartment: Object.fromEntries(byDept.rows.map((row) => [row.dept, Number(row.n)])),
	};
}
