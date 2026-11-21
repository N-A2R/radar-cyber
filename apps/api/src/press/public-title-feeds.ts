/**
 * Public title feeds of the paywalled regional press in Nouvelle-Aquitaine.
 *
 * The frozen corpus (bench/corpus/quotidiens.jsonl) is the registry: every
 * entry was fetched on 2026-11-21 and carries its load proof. Only the public
 * RSS metadata (title, pubDate, URL) is used. No paywall is circumvented, no
 * article body is stored, and no victim-related field exists in this module.
 *
 * Pure functions only: no network, no database, no side effects.
 */
import { readFileSync } from "node:fs";

export const NA_DEPARTMENT_NAMES: Record<string, true> = {
	Charente: true,
	"Charente-Maritime": true,
	"Corrèze": true,
	Creuse: true,
	Dordogne: true,
	Gironde: true,
	Landes: true,
	"Lot-et-Garonne": true,
	"Pyrénées-Atlantiques": true,
	"Deux-Sèvres": true,
	Vienne: true,
	"Haute-Vienne": true,
};

export type FeedProof = {
	http: number;
	items: number;
	verifiedOn: string;
};

export type PublicTitleFeed = {
	id: string;
	name: string;
	feedUrl: string;
	siteUrl: string;
	departments: string[];
	format: string;
	items: number;
	blockage: string;
	workaround: string;
	verifiedOn: string;
	proof: FeedProof;
};

export type SourceRecord = {
	id: string;
	name: string;
	family: string;
	url: string;
	license: string;
	enabled: boolean;
	kind: string;
	format: string;
	parser: Record<string, unknown>;
	intervalSec: number;
	relevance: string;
	description: string;
};

export type IntegrationPlan = {
	inserts: SourceRecord[];
	alreadyIntegrated: string[];
};

type RawFeed = {
	id?: unknown;
	nom?: unknown;
	url_flux?: unknown;
	url_site?: unknown;
	departements_couverts?: unknown;
	format?: unknown;
	items?: unknown;
	blocage?: unknown;
	parade?: unknown;
	verifie_le?: unknown;
	preuve_chargement?: {
		flux_http?: unknown;
		xml_items?: unknown;
		verifie_le?: unknown;
	};
};

function text(value: unknown, field: string, line: number): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`line ${line}: ${field} must be a non-empty string`);
	}
	return value;
}

/** Reads the frozen JSONL corpus into validated records. */
export function parseFeedCorpus(content: string): PublicTitleFeed[] {
	return content
		.split("\n")
		.map((line, index) => ({ line, number: index + 1 }))
		.filter(({ line }) => line.trim().length > 0)
		.map(({ line, number }) => {
			let raw: RawFeed;
			try {
				raw = JSON.parse(line) as RawFeed;
			} catch {
				throw new Error(`line ${number}: invalid JSON`);
			}
			return {
				id: text(raw.id, "id", number),
				name: text(raw.nom, "nom", number),
				feedUrl: text(raw.url_flux, "url_flux", number),
				siteUrl: text(raw.url_site, "url_site", number),
				departments: Array.isArray(raw.departements_couverts)
					? raw.departements_couverts.filter((d): d is string => typeof d === "string")
					: [],
				format: text(raw.format, "format", number),
				items: Number(raw.items),
				blockage: text(raw.blocage, "blocage", number),
				workaround: text(raw.parade, "parade", number),
				verifiedOn: text(raw.verifie_le, "verifie_le", number),
				proof: {
					http: Number(raw.preuve_chargement?.flux_http),
					items: Number(raw.preuve_chargement?.xml_items),
					verifiedOn: text(raw.preuve_chargement?.verifie_le, "preuve_chargement.verifie_le", number),
				},
			};
		});
}

/** Every covered department must belong to one of the twelve NA departments. */
export function isWithinNewAquitaine(feed: PublicTitleFeed): boolean {
	return feed.departments.length > 0 && feed.departments.every((d) => NA_DEPARTMENT_NAMES[d] === true);
}

/** The workaround must explicitly limit the exploitation to RSS metadata. */
export function usesPublicMetadataOnly(feed: PublicTitleFeed): boolean {
	return /m[ée]tadonn[ée]es/i.test(feed.workaround);
}

/** A feed is eligible only with a dated, successful, non-empty load proof. */
export function hasLoadProof(feed: PublicTitleFeed): boolean {
	return (
		feed.format === "rss" &&
		feed.items > 0 &&
		feed.proof.http === 200 &&
		feed.proof.items > 0 &&
		Number.isFinite(Date.parse(feed.verifiedOn)) &&
		feed.verifiedOn === feed.proof.verifiedOn
	);
}

export function isIntegrableFeed(feed: PublicTitleFeed): boolean {
	return isWithinNewAquitaine(feed) && usesPublicMetadataOnly(feed) && hasLoadProof(feed);
}

/** Source rows are gray (`context`) and carry the exploitation policy in parser. */
export function toSourceRecord(feed: PublicTitleFeed): SourceRecord {
	return {
		id: `public-title:${feed.id}`,
		name: `Public title feed — ${feed.name}`,
		family: "presse",
		url: feed.feedUrl,
		license: "public-rss-metadata-only",
		enabled: true,
		kind: "narrative",
		format: "rss",
		parser: {
			publicTitleFeed: true,
			policy: "metadata-only",
			verifiedOn: feed.verifiedOn,
		},
		intervalSec: 1800,
		relevance: "context",
		description: `Public RSS title feed (title, pubDate, URL only). No paywall circumvention, no article body. Verified ${feed.verifiedOn}.`,
	};
}

function normalizeUrl(url: string): string {
	return url.trim().replace(/\/+$/, "");
}

/**
 * Plans the missing sources. An enabled source already pointing at the same
 * URL counts as integrated: never create a duplicate for the same title feed.
 */
export function integrationPlan(
	feeds: PublicTitleFeed[],
	existingUrls: Iterable<string>,
): IntegrationPlan {
	const known = new Set(Array.from(existingUrls, normalizeUrl));
	const inserts: SourceRecord[] = [];
	const alreadyIntegrated: string[] = [];
	for (const feed of feeds) {
		if (!isIntegrableFeed(feed)) continue;
		const url = normalizeUrl(feed.feedUrl);
		if (known.has(url)) {
			alreadyIntegrated.push(feed.id);
			continue;
		}
		known.add(url);
		inserts.push(toSourceRecord(feed));
	}
	return { inserts, alreadyIntegrated };
}

/** Reproducible definition: integrated = eligible corpus feed with an enabled source URL. */
export function countIntegratedFeeds(feeds: PublicTitleFeed[], existingUrls: Iterable<string>): number {
	const known = new Set(Array.from(existingUrls, normalizeUrl));
	return feeds.filter((feed) => isIntegrableFeed(feed) && known.has(normalizeUrl(feed.feedUrl))).length;
}

/** Convenience for the measurement artifact: which feeds are integrated. */
export function integratedFeedIds(feeds: PublicTitleFeed[], existingUrls: Iterable<string>): string[] {
	const known = new Set(Array.from(existingUrls, normalizeUrl));
	return feeds
		.filter((feed) => isIntegrableFeed(feed) && known.has(normalizeUrl(feed.feedUrl)))
		.map((feed) => feed.id);
}

/** Reads the corpus from the repository root. */
export function loadFeedCorpus(path: string): PublicTitleFeed[] {
	return parseFeedCorpus(readFileSync(path, "utf8"));
}
