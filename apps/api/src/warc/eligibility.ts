/**
 * WARC proof scope: Nouvelle-Aquitaine only.
 *
 * A fact is eligible when its public URL can be captured, the fact belongs to
 * the region (NA organisation or explicit department index) and it carries no
 * victim data (TLP RED/AMBER, `leaks` family). Grey sources remain eligible:
 * there is no publisher allow-list.
 */
import { DEPT_LABELS } from "../collectors/relevance.js";
import { query } from "../db.js";

export const NA_DEPARTMENTS: readonly string[] = Object.keys(DEPT_LABELS);
const EXCLUDED_FAMILIES = ["leaks"] as const;
const EXCLUDED_TLP = ["RED", "AMBER"] as const;

export type EligibleFact = {
	id: number;
	sourceUrl: string;
	family: string;
	dept: string | null;
	regional: boolean;
	/** Payload collected with the fact; used to resolve a live replacement URL. */
	evidence: unknown;
};

/** Scope clause shared by selection and measurement. */
export function scopeWhere(e = "e", o = "o"): string {
	return `${e}.source_url ~ '^https?://'
	  AND (${o}.dept = ANY($1::text[]) OR ${e}.regional = true)
	  AND (${e}.tlp IS NULL OR upper(${e}.tlp) <> ALL($2::text[]))
	  AND ${e}.family <> ALL($3::text[])`;
}

export function scopeParams(): unknown[] {
	return [[...NA_DEPARTMENTS], [...EXCLUDED_TLP], [...EXCLUDED_FAMILIES]];
}

export const BASE_SQL = `
	SELECT e.id, e.source_url AS "sourceUrl", e.family, o.dept, e.regional, e.evidence
	FROM event e
	LEFT JOIN org o ON o.id = e.org_id
	WHERE ${scopeWhere()}
`;

export const ELIGIBLE_SQL = `${BASE_SQL} ORDER BY e.id`;

/** Proofs whose fact is still in the NA scope at measurement time. */
export const PROOF_SQL = `
	SELECT wp.*, e.family, o.dept, e.regional
	FROM warc_proof wp
	JOIN event e ON e.id = wp.event_id
	LEFT JOIN org o ON o.id = e.org_id
	WHERE ${scopeWhere()}
`;

export async function eligibleFacts(limit?: number, offset = 0): Promise<EligibleFact[]> {
	const params = scopeParams();
	let sql = ELIGIBLE_SQL;
	if (limit !== undefined) {
		sql += ` LIMIT $4 OFFSET $5`;
		params.push(limit, offset);
	}
	const { rows } = await query<EligibleFact>(sql, params);
	return rows;
}

/** Eligible fact without a WARC proof, ordered by identifier. */
export async function pendingFacts(limit: number): Promise<EligibleFact[]> {
	const { rows } = await query<EligibleFact>(
		`${BASE_SQL}
		   AND NOT EXISTS (SELECT 1 FROM warc_proof wp WHERE wp.event_id = e.id)
		 ORDER BY e.id LIMIT $4`,
		[...scopeParams(), limit],
	);
	return rows;
}
