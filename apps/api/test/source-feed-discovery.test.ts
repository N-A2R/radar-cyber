/**
 * Source-page feed discovery — one named test per behavior.
 * No network: every HTTP response is injected and the production parser is pure.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	canonicalFeedUrl,
	candidateFeedUrls,
	discoverSourceFeeds,
	feedLinksFromHtml,
	stableSourceFeedId,
	toSourceRecord,
	validateFeed,
	type FetchLike,
	type FeedSource,
	type HttpProbe,
} from "../src/discovery/source-feeds.js";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Local news</title><link>https://ville-exemple.fr/</link>
<description>Local news</description><item><title>Event</title>
<link>https://ville-exemple.fr/event</link><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate>
<description>Brief</description></item></channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Local</title><id>https://ville-exemple.fr/</id>
<updated>2026-11-20T10:00:00Z</updated><entry><title>Event</title><id>urn:1</id>
<link href="https://ville-exemple.fr/event"/><updated>2026-11-20T10:00:00Z</updated></entry></feed>`;

const PAGE = `<html><head>
<link rel="alternate" type="application/rss+xml" href="/rss.xml"/>
</head><body><a href="/actualites/feed/">Le fil</a></body></html>`;

const source: FeedSource = {
	id: "ville-exemple",
	name: "Ville exemple",
	url: "https://ville-exemple.fr/actualites",
	family: "presse",
	license: null,
	kind: "narrative",
	format: "html",
	relevance: "context",
};

function probe(body: string, status = 200): HttpProbe {
	return { status, text: body, buffer: Buffer.from(body) };
}

function fakeFetch(extra: Record<string, HttpProbe> = {}): FetchLike {
	return async (url) => extra[url] ?? probe("<html><body>Not a feed</body></html>", 404);
}

test("paths: standard, deep and declared feed URLs are all probed once", () => {
	const candidates = candidateFeedUrls(source.url, [
		"https://ville-exemple.fr/rss.xml",
		"https://autre.fr/feed/",
	]);
	assert.equal(candidates[0], "https://ville-exemple.fr/feed");
	assert.equal(candidates.includes("https://ville-exemple.fr/actualites/feed"), true);
	assert.equal(candidates.includes("https://ville-exemple.fr/actualites?feed=rss2"), true);
	assert.equal(candidates.includes("https://ville-exemple.fr/rss.xml"), true);
	assert.equal(candidates.includes("https://autre.fr/feed"), false);
	assert.equal(new Set(candidates).size, candidates.length);
	assert.equal(canonicalFeedUrl("https://ville-exemple.fr/feed/"), "https://ville-exemple.fr/feed");
});

test("paths: feed links visible in the page are collected too", () => {
	assert.deepEqual(feedLinksFromHtml(PAGE, source.url), [
		"https://ville-exemple.fr/actualites/feed/",
	]);
});

test("validation: HTML, empty XML and HTTP errors are rejected", async () => {
	const fetch = fakeFetch({
		"https://ville-exemple.fr/rss.xml": probe("<html><body>accueil</body></html>"),
		"https://ville-exemple.fr/atom.xml": probe("<rss><channel><title>vide</title></channel></rss>"),
	});
	assert.equal(await validateFeed(fetch, "https://ville-exemple.fr/rss.xml"), null);
	assert.equal(await validateFeed(fetch, "https://ville-exemple.fr/atom.xml"), null);
	assert.equal(await validateFeed(fetch, "https://ville-exemple.fr/absent.xml"), null);
});

test("validation: a real RSS or Atom body with items is accepted", async () => {
	const fetch = fakeFetch({
		"https://ville-exemple.fr/rss.xml": probe(RSS),
		"https://ville-exemple.fr/atom.xml": probe(ATOM),
	});
	assert.equal(await validateFeed(fetch, "https://ville-exemple.fr/rss.xml"), "rss");
	assert.equal(await validateFeed(fetch, "https://ville-exemple.fr/atom.xml"), "atom");
});

test("identity: the id is stable across runs and distinct per URL", () => {
	assert.equal(stableSourceFeedId("https://ville-exemple.fr/feed/"), stableSourceFeedId("https://ville-exemple.fr/feed/"));
	assert.notEqual(stableSourceFeedId("https://ville-exemple.fr/feed"), stableSourceFeedId("https://ville-exemple.fr/atom.xml"));
});

test("record: provenance keeps the original source without copying article data", () => {
	const record = toSourceRecord({
		...source,
		url: "https://ville-exemple.fr/rss.xml",
		format: "rss",
		items: 1,
		sourceId: source.id,
		sourceUrl: source.url,
		id: stableSourceFeedId("https://ville-exemple.fr/rss.xml"),
		sourceIds: [source.id],
	}, "2026-11-22T00:00:00.000Z");
	assert.equal(record.id, stableSourceFeedId(record.url));
	assert.equal(record.format, "rss");
	assert.equal(record.kind, "narrative");
	assert.equal(record.relevance, "context");
	assert.equal(record.url, "https://ville-exemple.fr/rss.xml");
});

test("discovery: one RSS and one Atom are picked, existing URLs are skipped", async () => {
	const fetch = fakeFetch({
		[source.url]: probe(PAGE),
		"https://ville-exemple.fr/feed": probe(RSS),
		"https://ville-exemple.fr/rss.xml": probe(RSS),
		"https://ville-exemple.fr/atom.xml": probe(ATOM),
	});
	const report = await discoverSourceFeeds({
		sources: [source],
		fetch,
		dryRun: true,
		concurrency: 1,
		budgetMs: 5000,
		maxFeedsPerSource: 2,
		existingUrls: ["https://ville-exemple.fr/rss.xml"],
	});
	assert.equal(report.feedsFound, 2);
	assert.equal(report.sourcesCovered, 1);
	assert.equal(report.feedsRegistered, 0);
	assert.deepEqual(report.feeds.map((feed) => feed.format).sort(), ["atom", "rss"]);
	assert.equal(report.feeds.some((feed) => feed.url.endsWith("/rss.xml")), false);
	assert.equal(report.feeds[0]?.sourceIds[0], source.id);
});

test("discovery: two sources sharing one feed are counted once with both provenance ids", async () => {
	const other: FeedSource = { ...source, id: "ville-exemple-agenda", url: "https://ville-exemple.fr/agenda" };
	const fetch = fakeFetch({
		[source.url]: probe(PAGE),
		[other.url]: probe(PAGE),
		"https://ville-exemple.fr/feed": probe(RSS),
	});
	const report = await discoverSourceFeeds({
		sources: [source, other],
		fetch,
		dryRun: true,
		concurrency: 2,
		budgetMs: 5000,
		maxFeedsPerSource: 1,
	});
	assert.equal(report.feedsFound, 1);
	assert.equal(report.sourcesCovered, 2);
	assert.deepEqual(report.feeds[0]?.sourceIds, [source.id, other.id]);
});
