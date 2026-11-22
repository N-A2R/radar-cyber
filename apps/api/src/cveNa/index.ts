/**
 * Relevance rule for recent CVEs and the technologies observed in Nouvelle-Aquitaine.
 *
 * Pure module: no database, no network, no cached state. It only handles public
 * technical metadata (NVD CPE product names and aggregated technology counts).
 * Never feed IP addresses or any victim-identifying field into this module.
 *
 * A CVE is relevant when at least one CPE product declared vulnerable by NVD
 * matches, after normalisation, a technology observed for a Nouvelle-Aquitaine
 * organisation. Matching is exact on the product token: no substring matching,
 * no vendor guessing, no CVSS threshold.
 */
import { isNouvelleAquitaineDepartment } from "../regionalLanguages/index.js";

export interface NvdCveRecord {
	id: string;
	published?: string;
	/** Raw CPE product tokens from vulnerable configurations / affected data. */
	products: string[];
	cvss: number | null;
}

export interface TechnologyObservation {
	technology: string;
	organisations: number;
}

export interface RelevanceVerdict {
	relevant: boolean;
	/** Raw technology names that matched at least one CPE product. */
	matches: string[];
}

/** Department names as stored alongside INSEE codes in the organisation table. */
const NA_DEPARTMENT_NAMES: Readonly<Record<string, true>> = {
	charente: true,
	"charente-maritime": true,
	correze: true,
	creuse: true,
	dordogne: true,
	gironde: true,
	landes: true,
	"lot-et-garonne": true,
	"pyrenees-atlantiques": true,
	"deux-sevres": true,
	vienne: true,
	"haute-vienne": true,
	"nouvelle-aquitaine": true,
};

/** Exact department labels stored in the organisation table (codes and names). */
export const NA_DEPARTMENT_SQL_LABELS: readonly string[] = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
	"Charente", "Charente-Maritime", "Corrèze", "correze", "Creuse", "Dordogne",
	"Gironde", "Landes", "Lot-et-Garonne", "Pyrénées-Atlantiques",
	"pyrenees-atlantiques", "Deux-Sèvres", "deux-sevres", "Vienne", "Haute-Vienne",
	"Nouvelle-Aquitaine",
];

/**
 * Generic protocol/port labels are not product identifiers. They cannot match
 * a CPE product, otherwise `http` or `port-8080` would inflate the count.
 */
const GENERIC_TECHNOLOGIES: Readonly<Record<string, true>> = {
	http: true,
	https: true,
	"http-server": true,
	"http-alt": true,
	ftp: true,
	dns: true,
	ipsec: true,
	"ipsec-nat": true,
};

/**
 * Alternate CPE product spellings for an observed technology label, after
 * normalisation. Example: Shodan reports `varnish_cache`, NVD uses `varnish`.
 */
const PRODUCT_ALIASES: Readonly<Record<string, readonly string[]>> = {
	"varnish-cache": ["varnish-cache", "varnish"],
	"pure-ftpd": ["pure-ftpd", "pureftpd"],
};

/** Lowercase, strip diacritics, fold separators to a single hyphen. */
export function normaliseToken(raw: unknown): string {
	if (typeof raw !== "string") return "";
	return raw
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/** True for an INSEE code or a department/regional label inside Nouvelle-Aquitaine. */
export function isNouvelleAquitaineLabel(raw: unknown): boolean {
	if (isNouvelleAquitaineDepartment(raw)) return true;
	return Object.hasOwn(NA_DEPARTMENT_NAMES, normaliseToken(raw));
}

/** Comparable keys for an observed technology; empty for generic labels. */
export function technologyKeys(raw: unknown): string[] {
	const key = normaliseToken(raw);
	if (!key || /^port-\d+$/.test(key) || Object.hasOwn(GENERIC_TECHNOLOGIES, key)) return [];
	const aliases = PRODUCT_ALIASES[key];
	return aliases ? [...aliases] : [key];
}

/** NVD 2.3/2.2 CPE product token (field 4), or undefined when absent. */
export function cpeProduct(criteria: unknown): string | undefined {
	if (typeof criteria !== "string") return undefined;
	const match = /^cpe:2\.[23]:[^:]+:[^:]+:([^:]+):/.exec(criteria);
	if (!match) return undefined;
	const product = match[1];
	return product && product !== "*" && product !== "-" ? product : undefined;
}

interface CpeContainer {
	configurations?: {
		nodes?: { cpeMatch?: { vulnerable?: boolean; criteria?: string }[] }[];
	}[];
	affected?: { affectedData?: { cpes?: string[] }[] }[];
}

/** Distinct CPE product names declared for a CVE by NVD. */
export function extractCpeProducts(cve: CpeContainer): string[] {
	const products = new Set<string>();
	for (const config of cve.configurations ?? []) {
		for (const node of config.nodes ?? []) {
			for (const entry of node.cpeMatch ?? []) {
				if (entry.vulnerable !== true) continue;
				const product = cpeProduct(entry.criteria);
				if (product) products.add(product);
			}
		}
	}
	for (const group of cve.affected ?? []) {
		for (const entry of group.affectedData ?? []) {
			for (const criteria of entry.cpes ?? []) {
				const product = cpeProduct(criteria);
				if (product) products.add(product);
			}
		}
	}
	return [...products];
}

/** Decide whether a CVE touches at least one observed NA technology. */
export function checkCveRelevance(
	cve: Pick<NvdCveRecord, "products">,
	technologies: readonly TechnologyObservation[],
): RelevanceVerdict {
	const keys = new Map<string, string>();
	for (const observation of technologies) {
		for (const key of technologyKeys(observation.technology)) {
			if (!keys.has(key)) keys.set(key, observation.technology);
		}
	}
	const matches = new Set<string>();
	for (const product of cve.products) {
		const matched = keys.get(normaliseToken(product));
		if (matched) matches.add(matched);
	}
	return { relevant: matches.size > 0, matches: [...matches].sort() };
}

/**
 * Second admission path: a CVE named by an official CERT-FR avis whose title
 * explicitly names an observed NA technology. Whole normalised tokens only,
 * so "F5 NGINX" matches nginx but "Oracle Java SE" does not match a fictitious
 * java observation hidden inside another word.
 */
export function alertNamesTechnology(
	title: string,
	technologies: readonly TechnologyObservation[],
): string[] {
	const tokens = new Set(normaliseToken(title).split("-").filter(Boolean));
	const matches = new Set<string>();
	for (const observation of technologies) {
		for (const key of technologyKeys(observation.technology)) {
			if (tokens.has(key)) matches.add(observation.technology);
		}
	}
	return [...matches].sort();
}

/** Count relevant CVEs once per identifier, even if the source repeats an id. */
export function countRelevantCves(
	cves: readonly NvdCveRecord[],
	technologies: readonly TechnologyObservation[],
): number {
	const ids = new Set<string>();
	for (const cve of cves) {
		if (checkCveRelevance(cve, technologies).relevant) ids.add(cve.id);
	}
	return ids.size;
}
