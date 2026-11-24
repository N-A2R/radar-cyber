/**
 * Bounded discovery of RSS/Atom feeds for catalogue sources without one.
 *
 * The source page is fetched once for declared alternates, then standard feed
 * paths are probed. A URL is kept only when the production parser agrees that
 * it is a feed with at least one item. No article text or victim data is kept.
 */
import { assertStaticHttpUrl, fetchBounded } from "../security/network.js";
import { createHash } from "node:crypto";
import { ingestQuery, query } from "../db.js";
import { parseSource } from "../collectors/parsers/formats.js";
import {
	alternateFeedLinks,
	decodeSitemapBody,
	detectFeedFormat,
	normalizeHost,
} from "./sitemap.js";

export type HttpProbe = { status: number; text: string; buffer?: Buffer };
export type FetchLike = (url: string) => Promise<HttpProbe>;

export type FeedSource = {
	id: string;
	name: string;
	url: string;
	family: string;
	license: string | null;
	kind: string;
	format: string;
	relevance: string;
};

export type ValidatedFeed = {
	url: string;
	format: "rss" | "atom";
	items: number;
	sourceId: string;
	sourceUrl: string;
};

export type SourceFeed = ValidatedFeed & {
	id: string;
	name: string;
	family: string;
	license: string | null;
	relevance: string;
	sourceIds: string[];
};

export type SourceFeedReport = {
	sourcesScanned: number;
	candidatesProbed: number;
	alternateLinks: number;
	feedsFound: number;
	sourcesCovered: number;
	feedsRegistered: number;
	errors: number;
	durationMs: number;
	feeds: SourceFeed[];
};

export type SourceFeedOptions = {
	sources?: FeedSource[];
	fetch: FetchLike;
	dryRun?: boolean;
	concurrency?: number;
	budgetMs?: number;
	maxFeedsPerSource?: number;
	existingUrls?: string[];
	now?: () => Date;
	onLog?: (message: string) => void;
};

const USER_AGENT = "Mozilla/5.0 (compatible; RadarCyberSourceFeeds/1.0; public OSINT; no personal data)";
const ACCEPT = "application/rss+xml,application/atom+xml,application/xml,text/xml,text/html;q=0.8,*/*;q=0.5";

/** Paths actually used by the CMS families present in the catalogue. */
export const SOURCE_FEED_PATHS = [
	"/feed/",
	"/feed",
	"/rss.xml",
	"/rss",
	"/rss/",
	"/atom.xml",
	"/feed.xml",
	"/?feed=rss2",
	"/?feed=rss",
	"/?feed=atom",
	"/actualites/feed/",
	"/actualites/feed",
	"/actualites/rss",
	"/actualites/rss.xml",
	"/articles/rss.xml",
	"/fr/rss.xml",
	"/en/rss.xml",
	"/flux.xml",
	"/latest.rss",
	"/index.rdf",
	"/feed.rdf",
	"/rss-feed.xml",
	"/blog-feed.xml",
	"/?page=rss",
	"/?rss=1",
	"/?format=feed&type=rss",
	"/index.php?format=feed&type=rss",
	"/spip.php?page=rss",
	"/spip.php?page=backend",
	"/feed/?post_type=post",
	"/feed/?post_type=actualites",
	"/feed/rss2",
	"/feed/rss/",
	"/feed/atom",
	"/feed.rss",
	"/index.rss",
	"/blog/rss.xml",
	"/news/rss.xml",
	"/news/feed/",
	"/blog/feed/",
	"/comments/feed/",
	"/fr/feed/",
] as const;

/** One bounded GET, no retry, at most 512 KB of body. */
export function makeSourceFeedFetch(timeoutMs = 3500): FetchLike {
	return async (url) => {
		const response = await fetchBounded(url, {
			headers: { "User-Agent": USER_AGENT, Accept: ACCEPT },
			timeoutMs,
			maxBytes: 512_000,
			rejectIpLiteral: true,
		});
		return { status: response.status, text: response.buffer.toString("utf8"), buffer: response.buffer };
	};
}

/** Sources whose URL is a web page rather than an already registered feed. */
export async function loadSourcesWithoutFeeds(limit = 200, offset = 0): Promise<FeedSource[]> {
	const { rows } = await query<FeedSource>(
		`SELECT id, name, url, family, license, kind, format, relevance
		   FROM source
		  WHERE url ~* '^https?://'
		    AND url NOT ILIKE '%t.me/%'
		    AND url NOT ILIKE '%.onion%'
		    AND (format = 'html' OR url !~* '(feed|rss|atom|\\.xml|\\.rss|api|json)')
		  ORDER BY id
		  OFFSET $1 LIMIT $2`,
		[offset, limit],
	);
	return rows;
}

/** Trailing slashes do not make two feed URLs different discoveries. */
export function canonicalFeedUrl(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hostname = parsed.hostname.toLowerCase();
		if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
		parsed.hash = "";
		return parsed.toString();
	} catch {
		return url;
	}
}

/** Standard paths plus paths declared by the page, all on the source's site. */
export function candidateFeedUrls(sourceUrl: string, alternateLinks: string[] = []): string[] {
	let parsed: URL;
	try {
		assertStaticHttpUrl(sourceUrl, { rejectIpLiteral: true });
		parsed = new URL(sourceUrl);
	} catch {
		return [];
	}
	if (!/^https?:$/.test(parsed.protocol)) return [];
	const origin = parsed.origin;
	const host = normalizeHost(sourceUrl);
	const out: string[] = [];
	const push = (value: string) => {
		const canonical = canonicalFeedUrl(value);
		if (!out.includes(canonical)) out.push(canonical);
	};
	for (const path of SOURCE_FEED_PATHS) push(`${origin}${path}`);
	const segments = parsed.pathname.split("/").filter(Boolean);
	if (segments.length > 0) {
		const first = segments[0]!;
		push(`${origin}/${first}/feed/`);
		push(`${origin}/${first}/rss.xml`);
		push(`${origin}/${first}/atom.xml`);
		const base = segments.join("/").replace(/\/$/, "");
		push(`${origin}/${base}/feed/`);
		push(`${origin}/${base}/rss.xml`);
	}
	push(`${sourceUrl}${parsed.search ? "&" : "?"}feed=rss2`);
	for (const link of alternateLinks) {
		if (!host || normalizeHost(link) === host || normalizeHost(link)?.endsWith(`.${host}`)) push(link);
	}
	return out;
}

const FEED_LINK_HINT = /(?:\/(?:feed|rss|atom|flux|syndication)(?:\/|$|\?))|\.(?:xml|rss|atom)(?:\?|$)|[?&](?:feed|rss)=/i;

/** Feed links visible in the page body, in addition to `<link rel=alternate>`. */
export function feedLinksFromHtml(html: string, base: string): string[] {
	const links: string[] = [];
	const anchors = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
	let match: RegExpExecArray | null;
	while ((match = anchors.exec(html)) !== null) {
		if (!FEED_LINK_HINT.test(match[1]!)) continue;
		try {
			const absolute = assertStaticHttpUrl(new URL(match[1]!, base).href, { rejectIpLiteral: true }).url.href;
			if (!links.includes(absolute)) links.push(absolute);
		} catch {
			continue;
		}
	}
	return links.slice(0, 8);
}

/** HTTP 2xx + feed root + at least one parser item; HTML pages never pass. */
export async function validateFeed(fetch: FetchLike, url: string): Promise<ValidatedFeed["format"] | null> {
	let probe: HttpProbe;
	try {
		assertStaticHttpUrl(url, { rejectIpLiteral: true });
		probe = await fetch(url);
	} catch {
		return null;
	}
	if (probe.status < 200 || probe.status >= 300) return null;
	const body = decodeSitemapBody(probe.buffer ?? probe.text, 512_000);
	const format = detectFeedFormat(body);
	if (!format) return null;
	const parsed = parseSource(body, { sourceUrl: url, contentType: "" });
	return parsed.items.length > 0 ? format : null;
}

/** Stable across runs; the prefix distinguishes these from sitemap discoveries. */
export function stableSourceFeedId(url: string): string {
	const host = normalizeHost(url)?.replace(/\./g, "-") ?? "unknown";
	const hash = createHash("sha256").update(canonicalFeedUrl(url)).digest("base64url").slice(0, 12);
	return `source-feed:${host}:${hash}`;
}

/** Gray context source, with the catalogue source id kept as provenance. */
export function toSourceRecord(feed: SourceFeed, discoveredAt: string) {
	const host = normalizeHost(feed.url) ?? "unknown";
	return {
		id: feed.id,
		name: `Discovered feed — ${host}`,
		family: feed.family || "presse",
		url: feed.url,
		license: feed.license,
		kind: "narrative",
		format: feed.format,
		parser: {
			discovery: {
				method: "source-paths",
				sourceId: feed.sourceId,
				sourceIds: feed.sourceIds,
				sourceUrl: feed.sourceUrl,
				discoveredAt,
				gray: true,
			},
			detectedFormat: feed.format,
			items: feed.items,
		},
		intervalSec: 3600,
		relevance: "context",
		description: "RSS/Atom feed discovered on an existing catalogue source (gray, context only).",
	};
}

async function persist(feeds: SourceFeed[], dryRun: boolean, now: () => Date): Promise<number> {
	if (dryRun || feeds.length === 0) return 0;
	const discoveredAt = now().toISOString();
	let inserted = 0;
	for (const feed of feeds) {
		const record = toSourceRecord(feed, discoveredAt);
		const result = await ingestQuery(
			`INSERT INTO source (id, name, family, url, license, kind, format, parser,
			                     interval_sec, relevance, description, enabled)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
			 ON CONFLICT (id) DO NOTHING
			 RETURNING id`,
			[
				record.id, record.name, record.family, record.url, record.license,
				record.kind, record.format, JSON.stringify(record.parser), record.intervalSec,
				record.relevance, record.description,
			],
		);
		if (result.rowCount === 1) inserted++;
	}
	return inserted;
}

/** Re-register feeds from a validated measurement artifact, idempotently. */
export async function registerSourceFeeds(feeds: SourceFeed[], now: () => Date = () => new Date()): Promise<number> {
	return persist(feeds, false, now);
}

/** Bounded fan-out: every worker has its own source and its own deadline. */
export async function discoverSourceFeeds(options: SourceFeedOptions): Promise<SourceFeedReport> {
	const now = options.now ?? (() => new Date());
	const startedAt = Date.now();
	const deadline = startedAt + (options.budgetMs ?? 55_000);
	const sources = options.sources ?? await loadSourcesWithoutFeeds();
	const existing = new Set((options.existingUrls ?? []).map(canonicalFeedUrl));
	const report: SourceFeedReport = {
		sourcesScanned: sources.length,
		candidatesProbed: 0,
		alternateLinks: 0,
		feedsFound: 0,
		sourcesCovered: 0,
		feedsRegistered: 0,
		errors: 0,
		durationMs: 0,
		feeds: [],
	};
	const byUrl = new Map<string, SourceFeed>();
	const covered = new Set<string>();
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < sources.length && Date.now() < deadline) {
			const source = sources[next++]!;
			try {
				let alternates: string[] = [];
				try {
					assertStaticHttpUrl(source.url, { rejectIpLiteral: true });
					const page = await options.fetch(source.url);
					if (page.status >= 200 && page.status < 300) {
						const body = decodeSitemapBody(page.buffer ?? page.text, 512_000);
						const declared = detectFeedFormat(body);
						if (declared && parseSource(body, { sourceUrl: source.url }).items.length > 0) continue;
						alternates = [...alternateFeedLinks(body, source.url), ...feedLinksFromHtml(body, source.url)];
						report.alternateLinks += alternates.length;
					}
				} catch {
					report.errors++;
				}
				const candidates = candidateFeedUrls(source.url, alternates);
				const found: ValidatedFeed[] = [];
				for (const url of candidates) {
					if (Date.now() >= deadline) break;
					const canonical = canonicalFeedUrl(url);
					if (existing.has(canonical) || found.some((feed) => canonicalFeedUrl(feed.url) === canonical)) continue;
					report.candidatesProbed++;
					const format = await validateFeed(options.fetch, url);
					if (format) found.push({ url, format, items: 1, sourceId: source.id, sourceUrl: source.url });
				}
				found.sort((a, b) => a.url.length - b.url.length || a.url.localeCompare(b.url));
				const picked: ValidatedFeed[] = [];
				for (const feed of found) {
					if (picked.length >= (options.maxFeedsPerSource ?? 2)) break;
					if (picked.some((other) => other.format === feed.format)) continue;
					picked.push(feed);
				}
				for (const feed of picked) {
					const canonical = canonicalFeedUrl(feed.url);
					const prior = byUrl.get(canonical);
					if (prior) {
						if (!prior.sourceIds.includes(source.id)) prior.sourceIds.push(source.id);
					} else {
						byUrl.set(canonical, {
							...feed,
							id: stableSourceFeedId(feed.url),
							name: source.name,
							family: source.family,
							license: source.license,
							relevance: source.relevance,
							sourceIds: [source.id],
						});
					}
					covered.add(source.id);
				}
				if (picked.length > 0) options.onLog?.(`source feed: ${source.id} → ${picked.map((feed) => feed.url).join(", ")}`);
			} catch (error) {
				report.errors++;
				options.onLog?.(`source feed discovery failed for ${source.id}: ${String(error)}`);
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 12, sources.length || 1) }, worker));
	report.feeds = [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
	report.feedsFound = report.feeds.length;
	report.sourcesCovered = covered.size;
	report.feedsRegistered = await persist(report.feeds, options.dryRun === true, now);
	report.durationMs = Date.now() - startedAt;
	return report;
}
