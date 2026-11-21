/**
 * Link SIRET establishments to the headquarters (siège) of the same legal unit.
 *
 * SIRENE loads keep one org per siège (`entity_source = 'sirene'`, `siren` set)
 * and one org per secondary establishment (`entity_source = 'sirene-site'`,
 * 14-digit SIRET in `entity_code`, no `siren`). The first 9 digits of a SIRET
 * are the SIREN of that legal unit; matching them is an official identifier
 * join, not a guess from names or addresses.
 *
 * Only active headquarters are linked: a closed siège (`sirene-ferme`) cannot
 * be the current parent of an active establishment. Only Nouvelle-Aquitaine
 * establishments are considered. Nothing here reads event, source or victim
 * data — the join stays inside the organisation referential.
 */
import { ingestQuery, query } from "../db.js";

export const NA_DEPARTMENTS: readonly string[] = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
];

/** A SIRET is exactly 14 digits: 9-digit SIREN + 5-digit NIC. */
const SIRET_PATTERN = "^[0-9]{14}$";

const ESTABLISHMENT_FILTER = `
  e.entity_source = 'sirene-site'
  AND e.entity_code ~ '${SIRET_PATTERN}'
  AND e.dept = ANY($1)
  AND e.valid_to IS NULL`;

const ATTACH_SQL = `
UPDATE org AS e
SET parent_org_id = h.id
FROM org AS h
WHERE ${ESTABLISHMENT_FILTER}
  AND e.parent_org_id IS NULL
  AND h.entity_source = 'sirene'
  AND h.valid_to IS NULL
  AND h.siren = substring(e.entity_code from 1 for 9)`;

const COUNT_SQL = `
SELECT count(*)::int AS "siretEstablishments",
       count(*) FILTER (WHERE h.id IS NOT NULL)::int AS "attachedEstablishments",
       count(DISTINCT h.id)::int AS "headquartersWithEstablishments"
FROM org AS e
LEFT JOIN org AS h
  ON h.id = e.parent_org_id
 AND h.entity_source = 'sirene'
 AND h.valid_to IS NULL
WHERE ${ESTABLISHMENT_FILTER}`;

export type SiretEstablishmentCount = {
	siretEstablishments: number;
	attachedEstablishments: number;
	headquartersWithEstablishments: number;
	unmatchedEstablishments: number;
};

/** Idempotent backfill; returns the number of links created by this call. */
export async function attachSiretEstablishments(): Promise<number> {
	const result = await ingestQuery(ATTACH_SQL, [NA_DEPARTMENTS]);
	return result.rowCount ?? 0;
}

/** Count links that really point to an active siège, never a stale parent id. */
export async function countSiretEstablishments(): Promise<SiretEstablishmentCount> {
	const result = await query<Omit<SiretEstablishmentCount, "unmatchedEstablishments">>(
		COUNT_SQL,
		[NA_DEPARTMENTS],
	);
	const row = result.rows[0];
	if (!row) throw new Error("SIRET establishment count returned no row");
	return {
		...row,
		unmatchedEstablishments: row.siretEstablishments - row.attachedEstablishments,
	};
}
