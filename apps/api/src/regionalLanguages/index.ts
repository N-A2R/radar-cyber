/**
 * Eligibility rules for regional-language sources (Occitan, Basque).
 *
 * Pure module: no database, no network, no cached state. Source metadata only —
 * never victim data. Departments are the twelve departments of Nouvelle-Aquitaine.
 */

export type RegionalLanguage = "oc" | "eu";

/** ISO 639-1 codes of the two regional languages tracked by this workstream. */
export const REGIONAL_LANGUAGES: Readonly<Record<string, true>> = {
	oc: true,
	eu: true,
};

/** INSEE codes of the twelve Nouvelle-Aquitaine departments. */
export const NOUVELLE_AQUITAINE_DEPARTMENTS: Readonly<Record<string, true>> = {
	"16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
	"40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

const LANGUAGE_ALIASES: Readonly<Record<string, RegionalLanguage>> = {
	oc: "oc",
	occitan: "oc",
	"occitan d'aquitaine": "oc",
	eu: "eu",
	basque: "eu",
	euskara: "eu",
	euskera: "eu",
};

/** Canonical code for a language name/code, or null when out of scope. */
export function normaliseLanguageCode(raw: unknown): RegionalLanguage | null {
	if (typeof raw !== "string") return null;
	return LANGUAGE_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/** True when the value describes Occitan or Basque. */
export function isRegionalLanguage(raw: unknown): raw is RegionalLanguage {
	return normaliseLanguageCode(raw) !== null;
}

/** True for a two-digit INSEE department code inside Nouvelle-Aquitaine. */
export function isNouvelleAquitaineDepartment(raw: unknown): boolean {
	if (typeof raw === "number" && Number.isInteger(raw)) {
		return Object.hasOwn(NOUVELLE_AQUITAINE_DEPARTMENTS, String(raw).padStart(2, "0"));
	}
	if (typeof raw !== "string") return false;
	const code = raw.trim();
	return /^\d{2}$/.test(code) && Object.hasOwn(NOUVELLE_AQUITAINE_DEPARTMENTS, code);
}

/** Minimum metadata a source must carry to be integrated and auditable. */
export interface RegionalSourceRecord {
	id: string;
	name: string;
	url: string;
	language: string;
	department: string;
	verifiedOn?: string;
}

export type EligibilityReason =
	| "ok"
	| "language-out-of-scope"
	| "department-outside-na"
	| "invalid-url"
	| "missing-identity"
	| "personal-data";

export interface EligibilityVerdict {
	eligible: boolean;
	reason: EligibilityReason;
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const FRENCH_PHONE = /\b0[1-9](?:[ .-]?\d{2}){4}\b/;

/** True when source metadata contains an email address or a phone number. */
export function containsPersonalData(raw: string): boolean {
	return EMAIL.test(raw) || FRENCH_PHONE.test(raw);
}

function hasSecureUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" && parsed.hostname.includes(".");
	} catch {
		return false;
	}
}

/** Single decision point used by both the importer and the measurement script. */
export function checkRegionalSourceEligibility(
	record: RegionalSourceRecord,
): EligibilityVerdict {
	if (!record.id?.trim() || !record.name?.trim()) {
		return { eligible: false, reason: "missing-identity" };
	}
	if (!isRegionalLanguage(record.language)) {
		return { eligible: false, reason: "language-out-of-scope" };
	}
	if (!isNouvelleAquitaineDepartment(record.department)) {
		return { eligible: false, reason: "department-outside-na" };
	}
	if (!hasSecureUrl(record.url)) {
		return { eligible: false, reason: "invalid-url" };
	}
	if (containsPersonalData(`${record.name} ${record.url}`)) {
		return { eligible: false, reason: "personal-data" };
	}
	return { eligible: true, reason: "ok" };
}

/** Counts distinct eligible sources; duplicate ids count once. */
export function countEligibleRegionalSources(
	records: Iterable<RegionalSourceRecord>,
): number {
	const ids = new Set<string>();
	for (const record of records) {
		if (checkRegionalSourceEligibility(record).eligible) ids.add(record.id);
	}
	return ids.size;
}
