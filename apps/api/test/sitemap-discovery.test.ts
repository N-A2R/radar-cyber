/**
 * Sitemap feed discovery — one named test per behavior.
 * No network: all HTTP responses are injected, all parsers are pure.
 */
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { discoverFeeds, type HttpProbe } from "../src/discovery/discover.js";
import {
	alternateFeedLinks,
	countUniqueFeeds,
	decodeSitemapBody,
	detectFeedFormat,
	feedCandidatesFromUrls,
	isNaDepartment,
	isSameSite,
	normalizeHost,
	parseRobotsSitemaps,
	parseSitemap,
	sitemapCandidates,
	stableFeedId,
	toSourceRecord,
} from "../src/discovery/sitemap.js";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Local news</title><link>https://ville-exemple.fr/</link>
<description>Local news</description><item><title>Event</title>
<link>https://ville-exemple.fr/event</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate>
<description>Brief</description></item></channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Local</title><id>https://ville-exemple.fr/</id>
<updated>2026-11-20T10:00:00Z</updated><entry><title>Event</title><id>urn:1</id>
<link href="https://ville-exemple.fr/event"/><updated>2026-11-20T10:00:00Z</updated></entry></feed>`;

test("scope: only the twelve Nouvelle-Aquitaine departments are seeds", () => {
	assert.equal(isNaDepartment("33"), true);
	assert.equal(isNaDepartment("87"), true);
	assert.equal(isNaDepartment("75"), false);
	assert.equal(isNaDepartment("16 "), true);
});

test("scope: hosts are normalized and cannot escape the seed domain", () => {
	assert.equal(normalizeHost("HTTPS://WWW.Ville-Exemple.FR:443/actualites"), "ville-exemple.fr");
	assert.equal(normalizeHost("not a host"), null);
	assert.equal(isSameSite("https://news.ville-exemple.fr/feed", "ville-exemple.fr"), true);
	assert.equal(isSameSite("https://autre.fr/feed", "ville-exemple.fr"), false);
});

test("stage 1: robots.txt Sitemap directives are read before standard paths", () => {
	const robots = "User-agent: *\nDisallow: /private\nSitemap: https://ville-exemple.fr/sitemap-custom.xml\nSitemap: /relative.xml\nSitemap: http://autre.fr/sitemap.xml\n";
	assert.deepEqual(parseRobotsSitemaps(robots), [
		"https://ville-exemple.fr/sitemap-custom.xml",
		"http://autre.fr/sitemap.xml",
	]);
	assert.equal(sitemapCandidates("ville-exemple.fr")[0], "https://ville-exemple.fr/sitemap.xml");
	assert.equal(sitemapCandidates("ville-exemple.fr").length, 5);
});

test("stage 1: gzipped sitemaps are decoded without relying on HTTP headers", () => {
	const xml = '<urlset><url><loc>https://ville-exemple.fr/</loc></url></urlset>';
	assert.equal(decodeSitemapBody(gzipSync(xml)), xml);
	assert.equal(decodeSitemapBody(xml).includes("ville-exemple.fr"), true);
});

test("stage 2: sitemap indexes and urlsets are both parsed, entities decoded", () => {
	const index = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
	<sitemap><loc>https://ville-exemple.fr/sitemap-1.xml</loc></sitemap>
	<sitemap><loc>https://ville-exemple.fr/sitemap-2.xml</loc></sitemap></sitemapindex>`;
	const parsedIndex = parseSitemap(index, "https://ville-exemple.fr/sitemap.xml");
	assert.deepEqual(parsedIndex.childSitemaps, [
		"https://ville-exemple.fr/sitemap-1.xml",
		"https://ville-exemple.fr/sitemap-2.xml",
	]);
	assert.deepEqual(parsedIndex.urls, []);
	const set = '<urlset><url><loc>https://ville-exemple.fr/a?x=1&amp;y=2</loc></url></urlset>';
	assert.deepEqual(parseSitemap(set, "https://ville-exemple.fr/sitemap-1.xml").urls, [
		"https://ville-exemple.fr/a?x=1&y=2",
	]);
});

test("stage 3: only declared alternate RSS/Atom links are extracted", () => {
	const html = `<html><head>
	<link rel="alternate" type="application/rss+xml" href="/feed/" title="RSS">
	<link rel="alternate" type="application/atom+xml" href="https://ville-exemple.fr/atom.xml">
	<link rel="stylesheet" href="/style.css">
	</head></html>`;
	assert.deepEqual(alternateFeedLinks(html, "https://ville-exemple.fr/actualites"), [
		"https://ville-exemple.fr/feed/",
		"https://ville-exemple.fr/atom.xml",
	]);
});

test("stage 3: feed-shaped URLs lead, cross-domain URLs are dropped", () => {
	const urls = [
		"https://ville-exemple.fr/actualites",
		"https://ville-exemple.fr/rss.xml",
		"https://autre.fr/feed/",
	];
	const candidates = feedCandidatesFromUrls(urls, "ville-exemple.fr");
	assert.equal(candidates[0], "https://ville-exemple.fr/rss.xml");
	assert.equal(candidates.some((url) => url.includes("autre.fr")), false);
	assert.equal(new Set(candidates).size, candidates.length);
});

test("stage 4: feed detection accepts RSS and Atom but refuses an HTML page", () => {
	assert.equal(detectFeedFormat(RSS), "rss");
	assert.equal(detectFeedFormat(ATOM), "atom");
	assert.equal(detectFeedFormat("<!doctype html><html><body>News</body></html>"), null);
});

test("registration: ids are stable and records carry gray provenance only", () => {
	const feed = {
		url: "https://ville-exemple.fr/feed/",
		seedDomain: "ville-exemple.fr",
		orgId: 42,
		format: "rss" as const,
	};
	const record = toSourceRecord(feed, "2026-11-21T00:00:00.000Z");
	assert.equal(stableFeedId(feed.url), record.id);
	assert.equal(stableFeedId(feed.url), stableFeedId(feed.url));
	const discovery = record.parser.discovery;
	assert.ok(discovery && typeof discovery === "object" && "gray" in discovery);
	assert.equal(discovery.gray, true);
	assert.equal(record.relevance, "context");
	assert.equal(record.kind, "narrative");
	assert.equal(JSON.stringify(record).includes("victim"), false);
	assert.equal(countUniqueFeeds([feed, feed]), 1);
});

test("run: index, alternate link and validation yield two distinct feeds", async () => {
	const pages: Record<string, string> = {
		"https://ville-exemple.fr/robots.txt": "Sitemap: https://ville-exemple.fr/sitemap_index.xml",
		"https://ville-exemple.fr/sitemap_index.xml": `<sitemapindex><sitemap><loc>https://ville-exemple.fr/sitemap-1.xml</loc></sitemap><sitemap><loc>https://autre.fr/sitemap.xml</loc></sitemap></sitemapindex>`,
		"https://ville-exemple.fr/sitemap-1.xml": `<urlset><url><loc>https://ville-exemple.fr/actualites</loc></url><url><loc>https://ville-exemple.fr/rss.xml</loc></url></urlset>`,
		"https://ville-exemple.fr/actualites": '<link rel="alternate" type="application/rss+xml" href="/feed/">',
		"https://ville-exemple.fr/rss.xml": RSS,
		"https://ville-exemple.fr/feed/": ATOM,
	};
	const fetcher = async (url: string): Promise<HttpProbe> => ({
		status: pages[url] ? 200 : 404,
		text: pages[url] ?? "not found",
	});
	const report = await discoverFeeds({
		seeds: [{ domain: "ville-exemple.fr", orgId: 42 }],
		fetch: fetcher,
		dryRun: true,
		concurrency: 1,
	});
	assert.equal(report.feedsDiscovered, 2);
	assert.equal(report.sourcesInserted, 0, "dry run never writes sources");
	assert.equal(report.sitemapsFetched, 2);
	assert.equal(report.outsideNaSkipped, 1, "foreign sitemap is refused");
	assert.equal(report.errors, 0);
});
