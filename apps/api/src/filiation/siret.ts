/**
 * Parent/child links derived from official SIRENE identifiers.
 *
 * A 14-digit SIRET identifies an establishment of the 9-digit SIREN that
 * prefixes it. Both sides must be current organisations located in
 * Nouvelle-Aquitaine. The rule is deterministic: the codes and the public
 * INSEE dataset are the proof, no paid service or network call is needed.
 */

export const NA_DEPARTMENTS: Readonly<Record<string, true>> = {
	"16": true,
	"17": true,
	"19": true,
	"23": true,
	"24": true,
	"33": true,
	"40": true,
	"47": true,
	"64": true,
	"79": true,
	"86": true,
	"87": true,
};

const SIRET_CODE = /^\d{14}$/;
const SIREN_CODE = /^\d{9}$/;

const DATASET = "insee-stock-etablissement-v3";
const PUBLIC_LOOKUP = "https://annuaire-entreprises.data.gouv.fr/entreprise/";

export type FiliationOrg = {
	id: number;
	entityCode: string | null;
	entitySource: string | null;
	dept: string | null;
	validTo?: string | null;
};

export type FiliationEvidence = {
	method: "siren-prefix";
	source: "insee-sirene";
	childCode: string;
	parentCode: string;
	dataset: string;
	url: string;
};

export type FiliationLink = {
	childId: number;
	parentId: number;
	evidence: FiliationEvidence;
};

function inNa(dept: string | null): boolean {
	return dept != null && NA_DEPARTMENTS[dept] === true;
}

/**
 * Build one link per establishment whose SIREN prefix resolves to an active
 * legal entity in the region. Input order does not change the result.
 */
export function buildFiliationLinks(orgs: readonly FiliationOrg[]): FiliationLink[] {
	const parents = new Map<string, number>();
	for (const org of orgs) {
		const code = org.entityCode;
		if (org.entitySource !== "sirene" || org.validTo != null || !inNa(org.dept)) continue;
		if (code == null || !SIREN_CODE.test(code)) continue;
		parents.set(code, org.id);
	}

	const links: FiliationLink[] = [];
	const seen = new Set<string>();
	for (const org of orgs) {
		if (org.entitySource !== "sirene-site" || org.validTo != null || !inNa(org.dept)) continue;
		const code = org.entityCode;
		if (code == null || !SIRET_CODE.test(code)) continue;
		const parentCode = code.slice(0, 9);
		const parentId = parents.get(parentCode);
		if (parentId == null || parentId === org.id) continue;
		const key = `${org.id}:${parentId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		links.push({
			childId: org.id,
			parentId,
			evidence: {
				method: "siren-prefix",
				source: "insee-sirene",
				childCode: code,
				parentCode,
				dataset: DATASET,
				url: `${PUBLIC_LOOKUP}${parentCode}`,
			},
		});
	}
	return links;
}
