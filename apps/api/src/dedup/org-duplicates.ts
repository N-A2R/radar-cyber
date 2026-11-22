/**
 * Duplicate organisations: identity-based detection, no name-only merges.
 *
 * The referential deliberately keeps homonyms distinct (see
 * docs/research/referentiel-na.md): two rows are duplicates only when they
 * carry the same SIREN and the same normalized name in the same department,
 * with two independent ingestion shapes confirming the identity:
 *
 *   - a row with an explicit 9-digit SIREN (`org.siren`) ;
 *   - a row whose slug ends with a 14-digit SIRET (whose first 9 digits are
 *     the SIREN).
 *
 * SIRET-only neighbours are separate establishments of one company and are
 * NOT merged. FINESS codes are a different namespace and never used here.
 */
import { createHash } from "node:crypto";
import { DEPT_LABELS } from "../collectors/relevance.js";
import { normalize } from "../match/core.js";

export type IdentityOrigin = "siren" | "siret" | "slug-siren";

export type OrgIdentityRow = {
	id: number;
	name: string;
	slug: string;
	dept: string | null;
	siren: string | null;
	entity_code: string | null;
	entity_source: string | null;
};

export type OrgIdentity = { siren: string; origin: IdentityOrigin };

export type DuplicateGroup = {
	id: string;
	siren: string;
	dept: string;
	nameKey: string;
	memberIds: number[];
};

const SIREN = /^\d{9}$/;

/** Department codes, not the labels used by the textual territorial matcher. */
export const NA_DEPARTMENT_CODES: readonly string[] = Object.keys(DEPT_LABELS);

/** True for the twelve departments of Nouvelle-Aquitaine. */
export function isNaDepartment(dept: string | null | undefined): boolean {
	return dept != null && (NA_DEPARTMENT_CODES as readonly string[]).includes(dept.trim());
}

/**
 * Registered identifier of an organisation, never a FINESS code.
 * SIRET = SIREN + 5-digit establishment code.
 */
export function extractSiren(row: OrgIdentityRow): OrgIdentity | null {
	if (row.siren && SIREN.test(row.siren.trim())) {
		return { siren: row.siren.trim(), origin: "siren" };
	}
	const source = row.entity_source?.trim().toLowerCase() ?? "";
	if (!source.startsWith("sirene")) return null;

	const siret = row.slug.match(/-(\d{14})$/);
	if (siret) return { siren: siret[1]!.slice(0, 9), origin: "siret" };
	const slugSiren = row.slug.match(/-(\d{9})$/);
	if (slugSiren) return { siren: slugSiren[1]!, origin: "slug-siren" };
	return null;
}

/**
 * Groups candidate rows into mergeable duplicate groups.
 * Every group needs the two independent identity shapes: without an explicit
 * SIREN row, several SIRETs are just distinct establishments.
 */
export function buildDuplicateGroups(rows: readonly OrgIdentityRow[]): DuplicateGroup[] {
	const buckets = new Map<string, { row: OrgIdentityRow; identity: OrgIdentity }[]>();

	for (const row of rows) {
		if (!isNaDepartment(row.dept)) continue;
		const identity = extractSiren(row);
		if (identity === null) continue;
		const nameKey = normalize(row.name);
		if (nameKey === "") continue;
		const dept = row.dept!.trim();
		const key = `${dept}|${identity.siren}|${nameKey}`;
		const members = buckets.get(key);
		if (members) members.push({ row, identity });
		else buckets.set(key, [{ row, identity }]);
	}

	const groups: DuplicateGroup[] = [];
	for (const [key, members] of buckets) {
		if (members.length < 2) continue;
		const hasSiren = members.some((m) => m.identity.origin === "siren");
		const hasSiret = members.some((m) => m.identity.origin === "siret");
		if (!hasSiren || !hasSiret) continue;
		const [dept, siren, nameKey] = key.split("|") as [string, string, string];
		const memberIds = members.map((m) => m.row.id).sort((a, b) => a - b);
		const fingerprint = createHash("sha256").update(key).digest("hex").slice(0, 12);
		groups.push({ id: `org-${siren}-${fingerprint}`, siren, dept, nameKey, memberIds });
	}
	groups.sort((a, b) => a.memberIds[0]! - b.memberIds[0]!);
	return groups;
}
