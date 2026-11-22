/**
 * Semantic duplicates of organisations in Nouvelle-Aquitaine.
 *
 * Two rows are candidates when their names carry the same canonical key
 * after accents, case, punctuation, legal forms, institutional synonyms and
 * word order are folded, they sit in the same department and city, and two
 * independent sources corroborate the form. Rows with two different SIRENs
 * are never candidates: homonyms and distinct establishments stay separate.
 * Exact name matches are left to the identity-based deduplication module:
 * this detector only reports semantic variants, and reports without merging.
 *
 * No victim data is read or written: only organisation-level columns are
 * used. The detector is pure so each rule can be tested on its own.
 */
import { createHash } from "node:crypto";
import { normalize } from "../match/core.js";
import { isNaDepartment } from "./org-duplicates.js";

export { NA_DEPARTMENT_CODES } from "./org-duplicates.js";

export type SemanticOrgRow = {
	id: number;
	name: string;
	city: string | null;
	dept: string | null;
	siren: string | null;
	entitySource: string | null;
};

export type SemanticSide = {
	id: number;
	name: string;
	source: string;
	siren: string | null;
};

export type SemanticPair = {
	id: string;
	groupId: string;
	dept: string;
	city: string;
	canonicalKey: string;
	signals: string[];
	left: SemanticSide;
	right: SemanticSide;
};

export type SemanticGroup = {
	id: string;
	dept: string;
	city: string;
	canonicalKey: string;
	memberIds: number[];
	pairIds: string[];
};

export type SemanticDuplicates = {
	pairs: SemanticPair[];
	groups: SemanticGroup[];
	eligibleRows: number;
};

export type Verdict = "same" | "different" | "uncertain";

export type Precision = {
	verified: number;
	truePositive: number;
	falsePositive: number;
	uncertain: number;
	unknownVerdicts: number;
	precision: number;
};

/** Institutional and legal abbreviations that denote the same entity. */
const SYNONYMS: Readonly<Record<string, string>> = {
	chu: "centre hospitalier universitaire",
	ch: "centre hospitalier",
	hopital: "centre hospitalier",
	univ: "universite",
	mairie: "commune",
	ville: "commune",
	selarl: "sarl",
	selas: "sas",
	selurl: "sarl",
	eurl: "sarl",
};

/** Legal forms carry no identity information and never separate two rows. */
const LEGAL_FORMS: Readonly<Record<string, true>> = {
	sa: true, sas: true, sasu: true, sarl: true, eurl: true, sci: true,
	ste: true, societe: true, snc: true, sca: true, gie: true,
	selas: true, selurl: true,
};

const STOP_WORDS: Readonly<Record<string, true>> = {
	de: true, du: true, des: true, la: true, le: true, les: true,
	l: true, d: true, au: true, aux: true, et: true, en: true, sur: true,
};

/**
 * A key must carry a domain marker: a bare place name shared by a city row,
 * a holding company and an establishment is not evidence of a duplicate.
 */
const MARKERS: Readonly<Record<string, true>> = {
	pharmacie: true, ecole: true, college: true, lycee: true, universite: true,
	hopital: true, centre: true, hospitalier: true, universitaire: true,
	clinique: true, mairie: true, commune: true, departement: true,
	region: true, ehpad: true, association: true, musee: true,
	bibliotheque: true, theatre: true, stade: true, institut: true,
	laboratoire: true, banque: true, poste: true, hotel: true, sante: true,
	education: true, maternelle: true, primaire: true, elementaire: true,
	professionnel: true, technique: true, agricole: true, judo: true,
	danse: true, musique: true, cabinet: true, atelier: true, foyer: true,
	residence: true, piscine: true,
};

export const MIN_KEY_TOKENS = 2;

/** Source label used when the ingestion provenance column is empty. */
export function sourceLabel(row: Pick<SemanticOrgRow, "entitySource">): string {
	return row.entitySource?.trim() || "unknown";
}

/**
 * Accent-free, punctuation-free, legal-form-free, order-independent key.
 * Institutional synonyms are expanded so `CHU de Bordeaux` and
 * `Centre Hospitalier Universitaire de Bordeaux` share one key.
 */
export function canonicalKey(name: string): string {
	const tokens: string[] = [];
	for (const token of normalize(name).split(" ").filter(Boolean)) {
		for (const part of (SYNONYMS[token] ?? token).split(" ")) {
			if (LEGAL_FORMS[part] === true || STOP_WORDS[part] === true) continue;
			tokens.push(part);
		}
	}
	return [...new Set(tokens)].sort().join(" ");
}

function fingerprint(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function signalsFor(name: string): string[] {
	const tokens = normalize(name).split(" ").filter(Boolean);
	const signals = ["canonical-key", "cross-source"];
	if (tokens.some((token) => SYNONYMS[token] !== undefined)) signals.push("institutional-synonym");
	if (tokens.some((token) => LEGAL_FORMS[token] === true)) signals.push("legal-form");
	return signals;
}

export type SemanticDetector = {
	add(row: SemanticOrgRow): void;
	result(): SemanticDuplicates;
};

/**
 * Streaming detector: the measurement scans 1.6 M rows without keeping
 * them all in memory. Only rows that pass the blocking rules are retained.
 */
export function createSemanticDetector(): SemanticDetector {
	type Entry = { row: SemanticOrgRow; key: string };
	const buckets = new Map<string, Entry[]>();
	let eligibleRows = 0;

	return {
		add(row): void {
			if (!isNaDepartment(row.dept)) return;
			const city = normalize(row.city ?? "");
			// CEDEX is a shared postal label, not proof that two rows are in one town.
			if (city === "" || city === "cedex") return;
			const key = canonicalKey(row.name);
			const tokens = key === "" ? [] : key.split(" ");
			if (tokens.length < MIN_KEY_TOKENS || !tokens.some((token) => MARKERS[token] === true)) return;
			eligibleRows += 1;
			const bucketKey = `${row.dept!.trim()}\u0000${city}\u0000${key}`;
			const bucket = buckets.get(bucketKey);
			if (bucket) bucket.push({ row, key });
			else buckets.set(bucketKey, [{ row, key }]);
		},

		result(): SemanticDuplicates {
			const pairs: SemanticPair[] = [];
			const groups: SemanticGroup[] = [];

			for (const [bucketKey, entries] of buckets) {
				if (entries.length < 2) continue;
				const [dept, city, canonical] = bucketKey.split("\u0000") as [string, string, string];
				const groupId = `sem-${fingerprint(bucketKey)}`;
				const groupPairIds: string[] = [];
				const memberIds = new Set<number>();

				for (let i = 0; i < entries.length; i += 1) {
					for (let j = i + 1; j < entries.length; j += 1) {
						const first = entries[i]!.row;
						const second = entries[j]!.row;
						// Exact spellings belong to the identity-based detector.
						if (normalize(first.name) === normalize(second.name)) continue;
						// One source alone cannot corroborate a semantic identity.
						if (sourceLabel(first) === sourceLabel(second)) continue;
						// Two registered identifiers that disagree mean two entities.
						if (first.siren && second.siren && first.siren.trim() !== second.siren.trim()) continue;

						// Node order comes from PostgreSQL and is not guaranteed: hash
						// the ordered ids so pair identities survive a scan reorder.
						const left = first.id <= second.id ? first : second;
						const right = first.id <= second.id ? second : first;
						const pairId = `pair-${fingerprint(`${groupId}:${left.id}:${right.id}`)}`;
						const signals = [
							...new Set([...signalsFor(left.name), ...signalsFor(right.name)]),
						].sort();
						pairs.push({
							id: pairId,
							groupId,
							dept,
							city,
							canonicalKey: canonical,
							signals,
							left: { id: left.id, name: left.name, source: sourceLabel(left), siren: left.siren },
							right: { id: right.id, name: right.name, source: sourceLabel(right), siren: right.siren },
						});
						groupPairIds.push(pairId);
						memberIds.add(left.id);
						memberIds.add(right.id);
					}
				}

				if (groupPairIds.length > 0) {
					groups.push({
						id: groupId, dept, city, canonicalKey: canonical,
						memberIds: [...memberIds].sort((a, b) => a - b),
						pairIds: groupPairIds.sort(),
					});
				}
			}

			pairs.sort((a, b) => a.dept.localeCompare(b.dept) || a.city.localeCompare(b.city) || a.id.localeCompare(b.id));
			groups.sort((a, b) => a.id.localeCompare(b.id));
			return { pairs, groups, eligibleRows };
		},
	};
}

/** Batch form used by tests and by callers with a small row set. */
export function detectSemanticDuplicates(rows: readonly SemanticOrgRow[]): SemanticDuplicates {
	const detector = createSemanticDetector();
	for (const row of rows) detector.add(row);
	return detector.result();
}

/** Stable sample: same pairs, seed and size always select the same rows. */
export function samplePairs(pairs: readonly SemanticPair[], size: number, seed: number): SemanticPair[] {
	const shuffled = [...pairs];
	let state = seed >>> 0;
	const random = (): number => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
	for (let i = shuffled.length - 1; i > 0; i -= 1) {
		const j = Math.floor(random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
	}
	return shuffled.slice(0, Math.min(Math.max(0, size), shuffled.length)).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Precision of a hand-verified sample. An uncertain verdict counts as a
 * false positive: only supported duplicates are reported as detections.
 */
export function computePrecision(
	pairs: readonly SemanticPair[],
	verdicts: Readonly<Record<string, Verdict>>,
): Precision {
	const known = new Set(pairs.map((pair) => pair.id));
	let truePositive = 0;
	let falsePositive = 0;
	let uncertain = 0;
	let unknownVerdicts = 0;

	for (const [id, verdict] of Object.entries(verdicts)) {
		if (!known.has(id)) {
			unknownVerdicts += 1;
			continue;
		}
		if (verdict === "same") truePositive += 1;
		else if (verdict === "different") falsePositive += 1;
		else if (verdict === "uncertain") {
			falsePositive += 1;
			uncertain += 1;
		}
	}

	const verified = truePositive + falsePositive;
	return {
		verified,
		truePositive,
		falsePositive,
		uncertain,
		unknownVerdicts,
		precision: verified === 0 ? 0 : Math.round((truePositive / verified) * 10000) / 10000,
	};
}
