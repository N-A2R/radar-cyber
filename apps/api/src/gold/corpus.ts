/**
 * Gold corpus of Nouvelle-Aquitaine incidents: pure annotation and validation rules.
 *
 * No database, no network, no French prose in this module: the CLI wrappers in
 * scripts/gold-*.mts own I/O and the French report lives in docs/rapport-gold-500.md.
 */
import { createHash } from "node:crypto";

export const NA_DEPARTMENTS = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

export type NaDepartment = (typeof NA_DEPARTMENTS)[number];

export const INCIDENT_TYPES = [
	"ransomware", "data_leak", "phishing", "intrusion", "service_disruption", "fraud", "other",
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const EVIDENCE_TIERS = ["verified", "reported", "claimed"] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];

export const SOURCE_KINDS = ["official", "press", "grey"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const ANNOTATION_RULES = [
	"curated.verified.v1",
	"event.na-source.v1",
	"event.regional.v1",
	"event.na-org.v1",
	"claim.na-org.v1",
	"claim.human-verified.v1",
] as const;
export type AnnotationRule = (typeof ANNOTATION_RULES)[number];

export type Annotation = {
	rule: AnnotationRule;
	confidence: Confidence;
	reviewedAt: string;
	note: string;
};

export type GoldIncident = {
	id: string;
	sourceRef: string;
	title: string;
	organisation: string;
	department: NaDepartment;
	observedAt: string;
	incidentType: IncidentType;
	evidenceTier: EvidenceTier;
	sourceKind: SourceKind;
	sourceUrl: string;
	sourceLabel: string;
	annotation: Annotation;
};

/** A candidate before the deterministic sample assigns its gold id. */
export type GoldCandidate = Omit<GoldIncident, "id"> & { key: string };

export type ValidationReport = {
	total: number;
	errors: string[];
};

export type CorpusSummary = {
	incidents: number;
	departments: number;
	verified: number;
	reported: number;
	claimed: number;
	official: number;
	press: number;
	grey: number;
	incidentTypes: Record<string, number>;
	sha256: string;
};

const DEPARTMENT_NAMES: Record<string, NaDepartment> = {
	charente: "16",
	"charente-maritime": "17",
	corrèze: "19",
	correze: "19",
	creuse: "23",
	dordogne: "24",
	gironde: "33",
	landes: "40",
	"lot-et-garonne": "47",
	"pyrénées-atlantiques": "64",
	"pyrenees-atlantiques": "64",
	"deux-sèvres": "79",
	"deux-sevres": "79",
	vienne: "86",
	"haute-vienne": "87",
};

/** Accept a two-digit code or a department name, reject everything outside NA. */
export function normaliseDepartment(raw: string | number | null | undefined): NaDepartment | null {
	const value = String(raw ?? "").trim();
	if ((NA_DEPARTMENTS as readonly string[]).includes(value)) return value as NaDepartment;
	const named = DEPARTMENT_NAMES[value.toLocaleLowerCase("fr")];
	return named ?? null;
}

export function isNaDepartment(value: string): boolean {
	return (NA_DEPARTMENTS as readonly string[]).includes(value);
}

/**
 * Conservative redaction: contact details and explicitly named individuals
 * never enter the corpus. Organisation names from the public registry stay.
 */
export function redactPersonalData(text: string): string {
	return text
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
		.replace(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/g, "[phone]")
		.replace(/\b\d{15}\b/g, "[identifier]")
		.replace(/\b(?:Mme?|Monsieur|Madame|Dr|Prof|Victim|Victime)\.?\s+[A-ZÉÀÈ][\wÀ-ÿ'-]+(?:\s+[A-ZÉÀÈ][\wÀ-ÿ'-]+)?/g, "[redacted]");
}

/** True when a registry name looks like a private individual rather than an organisation. */
export function looksLikePersonName(name: string): boolean {
	const legalToken = /\b(SARL|SAS|SASU|SA|SNC|SCI|EURL|GIE|ASSOCIATION|MAIRIE|COMMUNE|COLLEGE|COLLÈGE|LYCEE|LYCÉE|HOPITAL|HÔPITAL|CLINIQUE|BANQUE|SOCIETE|SOCIÉTÉ|GROUP|ETABLISSEMENT|ÉTABLISSEMENT|CABINET|OFFICE|CENTRE|UNION|FEDERATION|FÉDÉRATION)\b/i;
	if (legalToken.test(name)) return false;
	return /^[\p{L}][\p{L}'-]{1,}(?:\s+[\p{L}][\p{L}'-]{1,}){1,2}$/u.test(name);
}

/** Map a title or summary to the incident taxonomy. Order matters: specific first. */
export function classifyIncidentType(text: string): IncidentType {
	const value = text.toLocaleLowerCase("fr");
	if (/ransom|ran.on|cryptolocker|wanna|encrypt|chiffrement/.test(value)) return "ransomware";
	if (/fuite|exfiltr|data breach|leak|vol de donn|données vol|divulgation/.test(value)) return "data_leak";
	if (/phishing|hame.onnage|usurpation|identité usurp/.test(value)) return "phishing";
	if (/fraude|escroquer|arnaque/.test(value)) return "fraud";
	if (/panne|interruption|indisponib|service perturb|perturbation|délai/.test(value)) return "service_disruption";
	if (/intrusion|pirat|compromission|hack|cyberattaque|attaque informatique|malware|virus/.test(value)) return "intrusion";
	return "other";
}

/** Dedup key: protocol, leading www. and trailing slash do not change an evidence URL. */
export function normaliseEvidenceUrl(url: string): string {
	try {
		const parsed = new URL(url.trim());
		const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
		const path = parsed.pathname.replace(/\/+$/, "");
		return `${host}${path}${parsed.search}`;
	} catch {
		return url.trim().toLowerCase();
	}
}

/** Deterministic 32-bit PRNG; the same seed always yields the same sample. */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[copy[i], copy[j]] = [copy[j]!, copy[i]!];
	}
	return copy;
}

/**
 * Stratified sample: 30% verified, 50% reported, 20% claimed. Whenever a tier
 * is short, the deficit moves to the tiers with spare capacity, largest share
 * first. Result is deterministic and has exactly `size` entries.
 */
export function selectGoldSample(
	candidates: readonly GoldCandidate[],
	size: number,
	seed: number,
): GoldCandidate[] {
	if (size < 0) throw new Error("Sample size must not be negative");
	if (candidates.length < size) {
		throw new Error(`Not enough candidates: ${candidates.length} available for ${size} requested`);
	}
	if (size === 0) return [];

	const tiers: EvidenceTier[] = ["verified", "reported", "claimed"];
	const shares: Record<EvidenceTier, number> = { verified: 0.3, reported: 0.5, claimed: 0.2 };
	const available: Record<EvidenceTier, number> = { verified: 0, reported: 0, claimed: 0 };
	for (const candidate of candidates) available[candidate.evidenceTier] += 1;

	const quotas: Record<EvidenceTier, number> = { verified: 0, reported: 0, claimed: 0 };
	for (const tier of tiers) {
		quotas[tier] = Math.min(available[tier], Math.floor(size * shares[tier]));
	}
	let remaining = size - tiers.reduce((sum, tier) => sum + quotas[tier], 0);
	// Largest remainder first: exact size even when shares end in .5.
	const byRemainder = [...tiers].sort((a, b) => {
		const remainder = (tier: EvidenceTier) => size * shares[tier] - Math.floor(size * shares[tier]);
		return remainder(b) - remainder(a) || shares[b] - shares[a];
	});
	for (const tier of byRemainder) {
		while (remaining > 0 && quotas[tier] < available[tier]) {
			quotas[tier] += 1;
			remaining -= 1;
		}
	}
	if (remaining > 0) throw new Error("Unreachable quota distribution");

	const selected: GoldCandidate[] = [];
	for (const tier of tiers) {
		const pool = candidates.filter((candidate) => candidate.evidenceTier === tier);
		// One PRNG per tier keeps changes in one tier from reshuffling the others.
		const tierSeed = seed + tiers.indexOf(tier) * 100_003;
		selected.push(...shuffled(pool, mulberry32(tierSeed)).slice(0, quotas[tier]));
	}
	return selected.sort((a, b) => a.key.localeCompare(b.key));
}

/** Attach stable gold ids after sampling; ids follow the sorted candidate key. */
export function withGoldIds(candidates: readonly GoldCandidate[]): GoldIncident[] {
	return candidates.map((candidate, index) => ({
		id: `gold-na-${String(index + 1).padStart(5, "0")}`,
		sourceRef: candidate.sourceRef,
		title: candidate.title,
		organisation: candidate.organisation,
		department: candidate.department,
		observedAt: candidate.observedAt,
		incidentType: candidate.incidentType,
		evidenceTier: candidate.evidenceTier,
		sourceKind: candidate.sourceKind,
		sourceUrl: candidate.sourceUrl,
		sourceLabel: candidate.sourceLabel,
		annotation: candidate.annotation,
	}));
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function includesValue(values: readonly string[], value: unknown): boolean {
	return typeof value === "string" && (values as readonly string[]).includes(value);
}

/** Reject anything that would break the NA-only, provenance or privacy contract. */
export function validateGoldCorpus(records: readonly unknown[]): ValidationReport {
	const errors: string[] = [];
	const ids = new Set<string>();
	records.forEach((raw, index) => {
		const where = `line ${index + 1}`;
		if (!isObject(raw)) {
			errors.push(`${where}: not an object`);
			return;
		}
		if (typeof raw.id !== "string" || !/^gold-na-\d{5}$/.test(raw.id)) errors.push(`${where}: invalid id`);
		else if (ids.has(raw.id)) errors.push(`${where}: duplicate id ${raw.id}`);
		else ids.add(raw.id);
		if (typeof raw.department !== "string" || !isNaDepartment(raw.department)) {
			errors.push(`${where}: department outside Nouvelle-Aquitaine`);
		}
		if (typeof raw.sourceUrl !== "string" || !/^https?:\/\/\S+$/i.test(raw.sourceUrl)) {
			errors.push(`${where}: missing evidence URL`);
		}
		if (typeof raw.title !== "string" || raw.title.trim().length < 4) errors.push(`${where}: missing title`);
		if (typeof raw.organisation !== "string" || raw.organisation.trim().length < 2) {
			errors.push(`${where}: missing organisation`);
		}
		if (typeof raw.observedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.observedAt)) {
			errors.push(`${where}: invalid observation date`);
		}
		if (!includesValue(INCIDENT_TYPES, raw.incidentType)) errors.push(`${where}: invalid incidentType`);
		if (!includesValue(EVIDENCE_TIERS, raw.evidenceTier)) errors.push(`${where}: invalid evidenceTier`);
		if (!includesValue(SOURCE_KINDS, raw.sourceKind)) errors.push(`${where}: invalid sourceKind`);
		if (typeof raw.sourceLabel !== "string" || raw.sourceLabel.length < 2) {
			errors.push(`${where}: missing sourceLabel`);
		}
		if (!isObject(raw.annotation)) {
			errors.push(`${where}: missing annotation`);
		} else {
			if (!includesValue(ANNOTATION_RULES, raw.annotation.rule)) errors.push(`${where}: invalid annotation rule`);
			if (!includesValue(CONFIDENCE_LEVELS, raw.annotation.confidence)) errors.push(`${where}: invalid confidence`);
			if (typeof raw.annotation.reviewedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.annotation.reviewedAt)) {
				errors.push(`${where}: invalid annotation date`);
			}
			if (typeof raw.annotation.note !== "string" || raw.annotation.note.trim().length < 4) {
				errors.push(`${where}: missing annotation note`);
			}
		}
		for (const field of ["title", "organisation"] as const) {
			const value = raw[field];
			if (typeof value === "string" && redactPersonalData(value) !== value) {
				errors.push(`${where}: personal data in ${field}`);
			}
		}
	});
	return { total: records.length, errors };
}

/** SHA-256 over id-sorted canonical JSON lines; independent of file order. */
export function corpusHash(records: readonly GoldIncident[]): string {
	const lines = [...records]
		.sort((a, b) => a.id.localeCompare(b.id))
		.map((record) => JSON.stringify(record))
		.join("\n");
	return createHash("sha256").update(lines).update("\n").digest("hex");
}

export function summariseGoldCorpus(records: readonly GoldIncident[]): CorpusSummary {
	const incidentTypes: Record<string, number> = {};
	for (const record of records) {
		incidentTypes[record.incidentType] = (incidentTypes[record.incidentType] ?? 0) + 1;
	}
	return {
		incidents: records.length,
		departments: new Set(records.map((record) => record.department)).size,
		verified: records.filter((record) => record.evidenceTier === "verified").length,
		reported: records.filter((record) => record.evidenceTier === "reported").length,
		claimed: records.filter((record) => record.evidenceTier === "claimed").length,
		official: records.filter((record) => record.sourceKind === "official").length,
		press: records.filter((record) => record.sourceKind === "press").length,
		grey: records.filter((record) => record.sourceKind === "grey").length,
		incidentTypes,
		sha256: corpusHash(records),
	};
}

export function parseGoldJsonl(content: string): GoldIncident[] {
	return content
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as GoldIncident);
}

export function toGoldJsonl(records: readonly GoldIncident[]): string {
	return [...records].sort((a, b) => a.id.localeCompare(b.id)).map((record) => JSON.stringify(record)).join("\n") + "\n";
}
