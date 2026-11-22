/**
 * Role-level referential of public office holders in Nouvelle-Aquitaine.
 *
 * A mandate describes which public office exists on a territorial authority
 * and where it applies. It carries no person-level information at all: no
 * name, contact detail, personal identifier or victim data. Only the office,
 * its jurisdiction and the public source that establishes it are kept.
 */
import type { PlannedOrg, ReferentielPlan } from "../referentiel/plan.js";

export const MANDATE_ROLES = [
	"mayor",
	"epci_president",
	"department_president",
	"region_president",
] as const;
export type MandateRole = (typeof MANDATE_ROLES)[number];

export const JURISDICTION_KINDS = ["commune", "epci", "departement", "region"] as const;
export type JurisdictionKind = (typeof JURISDICTION_KINDS)[number];

/** Exhaustive field list of a plan row, used by the no-personal-data checks. */
export const MANDATE_FIELDS = [
	"orgSlug",
	"siren",
	"mandateRole",
	"jurisdictionKind",
	"jurisdictionCode",
	"dept",
	"source",
	"proofUrl",
] as const;

export type PlannedPublicMandate = {
	orgSlug: string;
	siren: string | null;
	mandateRole: MandateRole;
	jurisdictionKind: JurisdictionKind;
	jurisdictionCode: string;
	dept: string | null;
	source: string;
	proofUrl: string;
};

export type PublicMandateCounts = {
	total: number;
	byRole: Record<MandateRole, number>;
};

export type PublicMandatePlan = {
	mandates: PlannedPublicMandate[];
	counts: PublicMandateCounts;
	warnings: string[];
};

const SOURCE = "etalab/decoupage-administratif@6.0.0";
const PROOF_URL = "https://www.npmjs.com/package/@etalab/decoupage-administratif/v/6.0.0";

export const NA_DEPARTMENTS: Record<string, true> = {
	"16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
	"40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};
export const NA_REGION_CODE = "75";

const OFFICE: Record<string, { role: MandateRole; kind: JurisdictionKind }> = {
	commune: { role: "mayor", kind: "commune" },
	epci: { role: "epci_president", kind: "epci" },
	departement: { role: "department_president", kind: "departement" },
	region: { role: "region_president", kind: "region" },
};

/** Shared marker set by the territorial plan for EPCI centroids. */
const NA_EPCI_GEO_SOURCE = "centroide-pondere-membres";

/** Field names that would turn an office row into a person-level record. */
const PERSONAL_FIELD = /name|nom|prenom|email|mail|phone|tel|contact|address|adresse|person|personne|victim|victime|birth|naissance/i;

/**
 * Reports every personal-data trace in a plan. An empty array means the plan
 * only holds office, jurisdiction and provenance — never an individual.
 */
export function personalDataFindings(mandates: readonly PlannedPublicMandate[]): string[] {
	const findings: string[] = [];
	for (const [index, mandate] of mandates.entries()) {
		const fields = Object.keys(mandate);
		for (const field of fields) {
			if (!MANDATE_FIELDS.includes(field as (typeof MANDATE_FIELDS)[number])) {
				findings.push(`mandate ${index}: unexpected field ${field}`);
			} else if (PERSONAL_FIELD.test(field)) {
				findings.push(`mandate ${index}: personal field ${field}`);
			}
		}
		const valueFields = ["orgSlug", "siren", "jurisdictionCode", "dept"] as const;
		for (const field of valueFields) {
			const value = mandate[field];
			if (typeof value !== "string") continue;
			if (value.includes("@") || /\d{10,}/.test(value) || /victim|victime/i.test(value)) {
				findings.push(`mandate ${index}: personal value in ${field}`);
			}
		}
	}
	return findings;
}

/** Builds one public-office record per territorial authority of the region. */
function build(orgs: readonly PlannedOrg[]): PublicMandatePlan {
	const warnings: string[] = [];
	const mandates: PlannedPublicMandate[] = [];
	const seen = new Set<string>();
	const byRole = Object.fromEntries(MANDATE_ROLES.map((role) => [role, 0])) as Record<
		MandateRole,
		number
	>;

	for (const org of orgs) {
		if (org.kind !== "collectivite") continue;
		const office = OFFICE[org.sector ?? ""];
		if (!office) continue;
		const code = org.entityCode;
		if (!code) {
			warnings.push(`${org.slug}: no jurisdiction code, skipped`);
			continue;
		}

		// Cross-border EPCI have no single department. Their centroid comes
		// from their Nouvelle-Aquitaine member communes, which is enough to
		// keep them in scope without inventing a department code.
		const inScope = office.kind === "region"
			? code === NA_REGION_CODE
			: NA_DEPARTMENTS[org.dept ?? ""] === true
				|| (office.kind === "epci" && org.dept === null && org.geoSource === NA_EPCI_GEO_SOURCE);
		if (!inScope) {
			warnings.push(`${org.slug}: outside Nouvelle-Aquitaine, skipped`);
			continue;
		}

		const key = `${office.kind}:${code}:${office.role}`;
		if (seen.has(key)) {
			warnings.push(`${key}: duplicate office, skipped`);
			continue;
		}
		seen.add(key);

		mandates.push({
			orgSlug: org.slug,
			siren: org.siren ?? null,
			mandateRole: office.role,
			jurisdictionKind: office.kind,
			jurisdictionCode: code,
			dept: org.dept ?? null,
			source: SOURCE,
			proofUrl: PROOF_URL,
		});
		byRole[office.role] += 1;
	}

	return { mandates, counts: { total: mandates.length, byRole }, warnings };
}

export function planPublicMandates(plan: ReferentielPlan): PublicMandatePlan {
	return build(plan.orgs);
}

/** Kept for callers that only have the raw referential dataset. */
export function planPublicMandatesFromOrgs(orgs: readonly PlannedOrg[]): PublicMandatePlan {
	return build(orgs);
}
