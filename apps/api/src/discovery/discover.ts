/**
 * Bounded sitemap crawler: NA organization domains in, validated feed URLs out.
 * Each stage is time-boxed so a whole run stays well under 60 seconds.
 */
import { assertStaticHttpUrl, fetchBounded } from "../security/network.js";
import { ingestQuery, query } from "../db.js";
import { parseSource } from "../collectors/parsers/formats.js";
import {
	alternateFeedLinks,
	countUniqueFeeds,
	decodeSitemapBody,
	detectFeedFormat,
	feedCandidatesFromUrls,
	isSameSite,
	normalizeHost,
	parseRobotsSitemaps,
	parseSitemap,
	sitemapCandidates,
	toSourceRecord,
	type DiscoveredFeed,
} from "./sitemap.js";

export type Seed = { domain: string; orgId: number | null };
export type HttpProbe = { status: number; text: string; buffer?: Buffer };
export type FetchLike = (url: string) => Promise<HttpProbe>;

export type DiscoveryOptions = {
	seeds: Seed[];
	fetch: FetchLike;
	dryRun?: boolean;
	concurrency?: number;
	budgetMs?: number;
	maxSitemapsPerSeed?: number;
	maxPagesPerSeed?: number;
	maxCandidatesPerSeed?: number;
	onLog?: (message: string) => void;
	now?: () => Date;
};

export type DiscoveryReport = {
	seeds: number;
	sitemapsFetched: number;
	urlsScanned: number;
	candidatesProbed: number;
	feedsDiscovered: number;
	sourcesInserted: number;
	outsideNaSkipped: number;
	errors: number;
	durationMs: number;
};

const USER_AGENT = "RadarCyberSitemapDiscovery/1.0 (+public OSINT; no personal data)";
const ACCEPT = "application/xml,text/xml,application/rss+xml,application/atom+xml,text/html;q=0.5";

/** Plain bounded GET: no retries, no backoff, no body larger than 512 KB. */
export function makeFetch(timeoutMs = 4000): FetchLike {
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

/**
 * Seeds come from organizations with a NA department and a domain.
 * One row per normalized domain; `offset` makes repeatable batches possible.
 */
export async function loadSeeds(limit = 40, offset = 0): Promise<Seed[]> {
	const { rows } = await query<{ domain: string; org_id: number }>(
		`SELECT lower(btrim(domain)) AS domain, MIN(id) AS org_id
		   FROM org
		  WHERE dept = ANY($1::text[])
		    AND domain IS NOT NULL
		    AND btrim(domain) <> ''
		  GROUP BY lower(btrim(domain))
		  ORDER BY domain
		  OFFSET $2 LIMIT $3`,
		[
			["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
			offset,
			limit,
		],
	);
	const seen = new Set<string>();
	const seeds: Seed[] = [];
	for (const row of rows) {
		const domain = normalizeHost(row.domain);
		if (!domain || seen.has(domain)) continue;
		seen.add(domain);
		seeds.push({ domain, orgId: row.org_id ?? null });
	}
	return seeds;
}

type Stage = {
	report: DiscoveryReport;
	deadline: number;
	now: () => Date;
	fetch: FetchLike;
};

async function probe(stage: Stage, url: string): Promise<HttpProbe | null> {
	if (Date.now() >= stage.deadline) return null;
	try {
		assertStaticHttpUrl(url, { rejectIpLiteral: true });
		const result = await stage.fetch(url);
		return result.status >= 200 && result.status < 300 ? result : null;
	} catch {
		stage.report.errors++;
		return null;
	}
}

/** Stage 1-2: robots.txt directives, sitemap paths and their child sitemaps. */
async function collectSitemapUrls(
	stage: Stage,
	seed: Seed,
	maxSitemaps: number,
): Promise<string[]> {
	const robots = await probe(stage, `https://${seed.domain}/robots.txt`);
	const declared = robots
		? parseRobotsSitemaps(robots.text).filter((url) => isSameSite(url, seed.domain))
		: [];
	const queue = [...new Set([...declared, ...sitemapCandidates(seed.domain)])];
	const visited = new Set<string>();
	const urls: string[] = [];
	while (queue.length > 0 && visited.size < maxSitemaps && Date.now() < stage.deadline) {
		const url = queue.shift()!;
		const response = await probe(stage, url);
		if (!response) continue;
		visited.add(url);
		stage.report.sitemapsFetched++;
		const parsed = parseSitemap(decodeSitemapBody(response.buffer ?? response.text, 512_000), url);
		for (const child of parsed.childSitemaps) {
			if (!isSameSite(child, seed.domain)) {
				stage.report.outsideNaSkipped++;
			} else if (!queue.includes(child) && !visited.has(child)) {
				queue.push(child);
			}
		}
		for (const found of parsed.urls) {
			if (isSameSite(found, seed.domain) && !urls.includes(found)) urls.push(found);
		}
	}
	return urls;
}

/** Stage 3: page URLs from the sitemaps, plus their declared alternate feeds. */
async function discoverUrls(
	stage: Stage,
	seed: Seed,
	maxSitemaps: number,
	maxPages: number,
): Promise<string[]> {
	const urls = await collectSitemapUrls(stage, seed, maxSitemaps);
	stage.report.urlsScanned += urls.length;
	const pages = urls
		.filter((url) => !/\.(?:pdf|jpe?g|png|gif|svg|webp|zip)(?:$|\?)/i.test(url))
		.slice(0, maxPages);
	for (const page of pages) {
		if (Date.now() >= stage.deadline) break;
		const response = await probe(stage, page);
		if (!response) continue;
		for (const link of alternateFeedLinks(response.text, page)) {
			if (isSameSite(link, seed.domain) && !urls.includes(link)) urls.push(link);
		}
	}
	return urls;
}

/** Stage 4: HTTP + real parser agreement is required before registering a feed. */
async function validateFeed(stage: Stage, url: string): Promise<"rss" | "atom" | null> {
	const response = await probe(stage, url);
	if (!response) return null;
	const body = decodeSitemapBody(response.buffer ?? response.text, 512_000);
	const format = detectFeedFormat(body);
	if (!format) return null;
	return parseSource(body, { sourceUrl: url, contentType: response.text.slice(0, 200) }).items.length > 0
		? format
		: null;
}

async function persist(feeds: DiscoveredFeed[], dryRun: boolean, now: () => Date): Promise<number> {
	if (dryRun || feeds.length === 0) return 0;
	const discoveredAt = now().toISOString();
	let inserted = 0;
	for (const feed of feeds) {
		const record = toSourceRecord(feed, discoveredAt);
		const result = await ingestQuery(
			`INSERT INTO source (id, name, family, url, license, kind, format, parser, interval_sec, relevance, description)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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

/** Run all stages over the seeds with a bounded worker pool. */
export async function discoverFeeds(options: DiscoveryOptions): Promise<DiscoveryReport> {
	const now = options.now ?? (() => new Date());
	const startedAt = Date.now();
	const deadline = startedAt + (options.budgetMs ?? 45_000);
	const report: DiscoveryReport = {
		seeds: options.seeds.length,
		sitemapsFetched: 0,
		urlsScanned: 0,
		candidatesProbed: 0,
		feedsDiscovered: 0,
		sourcesInserted: 0,
		outsideNaSkipped: 0,
		errors: 0,
		durationMs: 0,
	};
	const stage: Stage = { report, deadline, now, fetch: options.fetch };
	const feeds = new Map<string, DiscoveredFeed>();
	let next = 0;
	const worker = async (): Promise<void> => {
		while (next < options.seeds.length && Date.now() < deadline) {
			const seed = options.seeds[next++]!;
			try {
				const urls = await discoverUrls(stage, seed, options.maxSitemapsPerSeed ?? 6, options.maxPagesPerSeed ?? 3);
				const candidates = feedCandidatesFromUrls(urls, seed.domain);
				for (const url of candidates.slice(0, options.maxCandidatesPerSeed ?? 10)) {
					if (Date.now() >= deadline) break;
					if (feeds.has(url) || !isSameSite(url, seed.domain)) {
						if (!isSameSite(url, seed.domain)) report.outsideNaSkipped++;
						continue;
					}
					report.candidatesProbed++;
					const format = await validateFeed(stage, url);
					if (format) {
						feeds.set(url, { url, seedDomain: seed.domain, orgId: seed.orgId, format });
						options.onLog?.(`feed discovered: ${url}`);
					}
				}
			} catch (error) {
				report.errors++;
				options.onLog?.(`discovery failed for ${seed.domain}: ${String(error)}`);
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(options.concurrency ?? 6, options.seeds.length || 1) }, worker));
	const found = [...feeds.values()];
	report.feedsDiscovered = countUniqueFeeds(found);
	report.sourcesInserted = await persist(found, options.dryRun === true, now);
	report.durationMs = Date.now() - startedAt;
	return report;
}

const MIN_INTERVAL_MS = 24 * 3600_000;
let lastScheduledRunAt = 0;

/** Called by the collection cycle; one bounded pass per process per day. */
export async function runScheduledDiscovery(log: (message: string) => void): Promise<void> {
	if (process.env.RADAR_SITEMAP_DISCOVERY === "0") return;
	const now = Date.now();
	if (now - lastScheduledRunAt < MIN_INTERVAL_MS) return;
	lastScheduledRunAt = now;
	const seeds = await loadSeeds(40, 0);
	const report = await discoverFeeds({
		seeds,
		fetch: makeFetch(),
		budgetMs: 40_000,
		onLog: log,
	});
	log(`sitemap discovery: ${report.feedsDiscovered} feed(s) found, ${report.sourcesInserted} registered in ${report.durationMs} ms`);
}
