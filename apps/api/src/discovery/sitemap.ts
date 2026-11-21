/**
 * Sitemap-based feed discovery (English code, no network I/O here).
 *
 * Every helper is pure so the crawler can be tested one behavior at a time.
 * Only URL-level metadata is ever kept: no article text, no victim names.
 */
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

export const NA_DEPARTMENTS = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

export const SITEMAP_PATHS = [
	"/sitemap.xml",
	"/sitemap_index.xml",
	"/sitemap-index.xml",
	"/wp-sitemap.xml",
	"/sitemap.xml.gz",
] as const;

export const FEED_PATHS = [
	"/feed/",
	"/feed.xml",
	"/rss.xml",
	"/rss/",
	"/atom.xml",
	"/spip.php?page=rss",
] as const;

export const MAX_BODY_CHARS = 512_000;

export type DiscoveredFeed = {
	url: string;
	seedDomain: string;
	orgId: number | null;
	format: "rss" | "atom";
};

export type SourceRecord = {
	id: string;
	name: string;
	family: string;
	url: string;
	license: string | null;
	kind: string;
	format: string;
	parser: Record<string, unknown>;
	intervalSec: number;
	relevance: string;
	description: string;
};

/** Accept only the twelve departments of Nouvelle-Aquitaine as crawl seeds. */
export function isNaDepartment(department: string): boolean {
	return (NA_DEPARTMENTS as readonly string[]).includes(String(department).trim());
}

/** Strip scheme, `www.`, path and port; reject anything that is not a hostname. */
export function normalizeHost(input: string): string | null {
	try {
		const raw = input.trim().toLowerCase();
		if (!raw) return null;
		const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
		const host = parsed.hostname.replace(/\.$/, "").replace(/^www\./, "");
		if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)) return null;
		return host;
	} catch {
		return null;
	}
}

/** A discovered URL stays inside the seed domain or one of its subdomains. */
export function isSameSite(candidate: string, seedDomain: string): boolean {
	const host = normalizeHost(candidate);
	const seed = normalizeHost(seedDomain);
	if (!host || !seed) return false;
	return host === seed || host.endsWith(`.${seed}`);
}

/** Standard sitemap locations, tried in order after robots.txt. */
export function sitemapCandidates(seedDomain: string): string[] {
	const host = normalizeHost(seedDomain);
	return host ? SITEMAP_PATHS.map((path) => `https://${host}${path}`) : [];
}

/** `Sitemap:` directives from robots.txt, kept only when absolute and HTTP(S). */
export function parseRobotsSitemaps(robots: string): string[] {
	const found: string[] = [];
	for (const line of robots.split(/\r?\n/)) {
		const match = /^\s*Sitemap\s*:\s*(\S+)/i.exec(line);
		if (!match) continue;
		try {
			const url = new URL(match[1]!);
			if ((url.protocol === "https:" || url.protocol === "http:") && !found.includes(url.href)) {
				found.push(url.href);
			}
		} catch {
			// Malformed directive: ignore it, keep the other ones.
		}
	}
	return found;
}

function decodeXml(value: string): string {
	return value
		.replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1")
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
		.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ({
			amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
		}[name] ?? name))
		.trim();
}

/** Sitemaps are often gzipped without a Content-Encoding header. */
export function decodeSitemapBody(body: Buffer | string, maxChars = MAX_BODY_CHARS): string {
	const buffer = typeof body === "string" ? Buffer.from(body) : body;
	const zipped = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
	const text = (zipped ? gunzipSync(buffer) : buffer).toString("utf8");
	return text.slice(0, maxChars);
}

function absoluteLoc(raw: string | undefined, base: string): string | null {
	if (!raw) return null;
	try {
		const url = new URL(decodeXml(raw), base);
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		url.hash = "";
		return url.href;
	} catch {
		return null;
	}
}

function locsInside(xml: string, tag: "sitemap" | "url", limit: number): string[] {
	const output: string[] = [];
	const blocks = new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`, "gi");
	let match: RegExpExecArray | null;
	while ((match = blocks.exec(xml)) !== null && output.length < limit) {
		const loc = /<(?:[\w.-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc>/i.exec(match[1] ?? "")?.[1];
		const value = absoluteLoc(loc, "https://sitemap.invalid/");
		if (value && !output.includes(value)) output.push(value);
	}
	return output;
}

/**
 * A sitemap index yields child sitemaps; a urlset yields page URLs.
 * Both are resolved against the sitemap URL so relative `<loc>` values work.
 */
export function parseSitemap(xml: string, base: string, limit = 1000): {
	childSitemaps: string[];
	urls: string[];
} {
	const childSitemaps: string[] = [];
	const urls: string[] = [];
	const blocks = /<(?:[\w.-]+:)?(?:sitemap|url)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?(?:sitemap|url)>/gi;
	let match: RegExpExecArray | null;
	while ((match = blocks.exec(xml)) !== null) {
		const block = match[1] ?? "";
		const target = /<(?:[\w.-]+:)?sitemap\b/i.test(match[0] ?? "") ? childSitemaps : urls;
		if (target.length >= limit) continue;
		const loc = /<(?:[\w.-]+:)?loc\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?loc>/i.exec(block)?.[1];
		const value = absoluteLoc(loc, base);
		if (value && !target.includes(value)) target.push(value);
	}
	return { childSitemaps, urls };
}

/** `<link rel="alternate" type="application/rss+xml">` on a page. */
export function alternateFeedLinks(html: string, base: string): string[] {
	const links: string[] = [];
	const tags = /<link\b[^>]*>/gi;
	let match: RegExpExecArray | null;
	while ((match = tags.exec(html)) !== null) {
		const tag = match[0] ?? "";
		if (!/rel\s*=\s*["'][^"']*alternate[^"']*["']/i.test(tag)) continue;
		if (!/(?:rss|atom)\+xml|application\/xml/i.test(tag)) continue;
		const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
		const value = absoluteLoc(href, base);
		if (value && !links.includes(value)) links.push(value);
	}
	return links;
}

const FEED_HINT = /(?:\/(?:feed|rss|atom|flux|syndication)(?:\/|$|\?))|\.(?:xml|rss|atom)(?:\?|$)|[?&]feed=/i;

/** Feed URLs announced by a sitemap, plus bounded standard paths per site. */
export function feedCandidatesFromUrls(
	urls: string[],
	seedDomain: string,
	pageLimit = 4,
): string[] {
	const candidates: string[] = [];
	const push = (url: string) => {
		if (isSameSite(url, seedDomain) && !candidates.includes(url)) candidates.push(url);
	};
	for (const url of urls) {
		if (FEED_HINT.test(url)) push(url);
	}
	let pages = 0;
	for (const url of urls) {
		if (pages >= pageLimit) break;
		if (FEED_HINT.test(url)) continue;
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			continue;
		}
		pages++;
		for (const path of FEED_PATHS) push(`${parsed.origin}${path}`);
		push(`${url.replace(/\/$/, "")}/feed/`);
	}
	return candidates;
}

/** The first bytes are enough to tell a real RSS/Atom document from an HTML page. */
export function detectFeedFormat(body: string): "rss" | "atom" | null {
	const head = body.slice(0, 20_000);
	if (/<(?:[\w.-]+:)?feed\b/i.test(head)) return "atom";
	if (/<(?:[\w.-]+:)?rss\b|<(?:[\w.-]+:)?rdf\b/i.test(head)) return "rss";
	return null;
}

/** Stable across runs, so a rediscovery never duplicates a feed. */
export function stableFeedId(url: string): string {
	const host = normalizeHost(url)?.replace(/\./g, "-") ?? "unknown";
	const hash = createHash("sha256").update(url).digest("base64url").slice(0, 12);
	return `sitemap:${host}:${hash}`;
}

/**
 * Gray source: registered for context, never for alerts. The provenance lives
 * in `parser` because the schema has no discovery column; no org name, title
 * or personal data is copied from the crawled site.
 */
export function toSourceRecord(feed: DiscoveredFeed, discoveredAt: string): SourceRecord {
	const host = normalizeHost(feed.url) ?? "unknown";
	return {
		id: stableFeedId(feed.url),
		name: `Discovered feed — ${host}`,
		family: "presse",
		url: feed.url,
		license: null,
		kind: "narrative",
		format: "rss",
		parser: {
			discovery: {
				method: "sitemap",
				seedDomain: feed.seedDomain,
				orgId: feed.orgId,
				discoveredAt,
				gray: true,
			},
			detectedFormat: feed.format,
		},
		intervalSec: 3600,
		relevance: "context",
		description: "Feed discovered automatically from a Nouvelle-Aquitaine sitemap (gray, context only).",
	};
}

/** Count distinct feed URLs, the metric published by the measurement script. */
export function countUniqueFeeds(feeds: DiscoveredFeed[]): number {
	return new Set(feeds.map((feed) => feed.url)).size;
}
