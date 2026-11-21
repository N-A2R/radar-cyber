/**
 * Contracts for the public title feed integration. One behavior per test.
 * Pure functions only: no database, no network, frozen corpus from 2026-11-21.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	countIntegratedFeeds,
	hasLoadProof,
	integrationPlan,
	isIntegrableFeed,
	isWithinNewAquitaine,
	parseFeedCorpus,
	toSourceRecord,
	usesPublicMetadataOnly,
	type PublicTitleFeed,
} from "../src/press/public-title-feeds.js";

const corpusPath = fileURLToPath(
	new URL("../../../bench/corpus/quotidiens.jsonl", import.meta.url),
);
const feeds = parseFeedCorpus(readFileSync(corpusPath, "utf8"));
const first = feeds[0]!;

function feedWith(override: Partial<PublicTitleFeed>): PublicTitleFeed {
	return { ...first, ...override };
}

describe("public title feeds", () => {
	it("parses the 17 verified feeds with a dated load proof", () => {
		assert.equal(feeds.length, 17);
		assert.equal(new Set(feeds.map((feed) => feed.id)).size, 17);
		for (const feed of feeds) {
			assert.equal(feed.proof.http, 200, feed.id);
			assert.ok(feed.proof.items > 0, feed.id);
			assert.equal(feed.verifiedOn, "2026-11-21", feed.id);
		}
	});

	it("rejects a covered department outside Nouvelle-Aquitaine", () => {
		assert.equal(isWithinNewAquitaine(feedWith({ departments: ["Gironde"] })), true);
		assert.equal(isWithinNewAquitaine(feedWith({ departments: [] })), false);
		assert.equal(isWithinNewAquitaine(feedWith({ departments: ["Loire-Atlantique"] })), false);
		assert.equal(
			isWithinNewAquitaine(feedWith({ departments: ["Charente", "Corrèze"] })),
			true,
		);
	});

	it("rejects a workaround that does not limit itself to RSS metadata", () => {
		assert.equal(usesPublicMetadataOnly(first), true);
		assert.equal(
			usesPublicMetadataOnly(feedWith({ workaround: "Abonnement payant partagé" })),
			false,
		);
	});

	it("requires a successful, dated, non-empty load proof", () => {
		assert.equal(hasLoadProof(first), true);
		assert.equal(hasLoadProof(feedWith({ proof: { ...first.proof, http: 403 } })), false);
		assert.equal(hasLoadProof(feedWith({ items: 0 })), false);
		assert.equal(
			hasLoadProof(feedWith({ proof: { ...first.proof, verifiedOn: "2026-11-20" } })),
			false,
		);
	});

	it("writes only the metadata policy columns in a source record", () => {
		const record = toSourceRecord(first);
		assert.deepEqual(Object.keys(record).sort(), [
			"description",
			"enabled",
			"family",
			"format",
			"id",
			"intervalSec",
			"kind",
			"license",
			"name",
			"parser",
			"relevance",
			"url",
		]);
		assert.equal(record.id, "public-title:na-quotidien-001");
		assert.equal(record.relevance, "context");
		assert.equal(record.url, first.feedUrl);
		assert.equal(record.enabled, true);
		assert.deepEqual(record.parser, {
			publicTitleFeed: true,
			policy: "metadata-only",
			verifiedOn: first.verifiedOn,
		});
		assert.equal(toSourceRecord(first).id, record.id);
	});

	it("counts a feed only when an enabled source URL matches", () => {
		assert.equal(countIntegratedFeeds(feeds, []), 0);
		assert.equal(countIntegratedFeeds(feeds, [first.feedUrl]), 1);
		assert.equal(countIntegratedFeeds(feeds, [`${first.feedUrl}/`]), 1);
		assert.equal(countIntegratedFeeds(feeds, ["https://example.org/not-a-feed"]), 0);
	});

	it("does not duplicate a source for an already integrated feed", () => {
		const plan = integrationPlan(feeds, feeds.map((feed) => feed.feedUrl));
		assert.equal(plan.inserts.length, 0);
		assert.equal(plan.alreadyIntegrated.length, 17);
	});

	it("plans exactly the four missing feeds and stays idempotent", () => {
		const missing: Record<string, true> = {
			"na-quotidien-012": true,
			"na-quotidien-015": true,
			"na-quotidien-016": true,
			"na-quotidien-017": true,
		};
		const existing = feeds.filter((feed) => !missing[feed.id]).map((feed) => feed.feedUrl);
		const plan = integrationPlan(feeds, existing);
		assert.equal(plan.alreadyIntegrated.length, 13);
		assert.deepEqual(
			plan.inserts.map((source) => source.id),
			Object.keys(missing).map((id) => `public-title:${id}`),
		);
		const second = integrationPlan(feeds, [
			...existing,
			...plan.inserts.map((source) => source.url),
		]);
		assert.equal(second.inserts.length, 0);
	});

	it("keeps paywalled publisher feeds on public metadata only", () => {
		const direct = feeds.filter((feed) => new URL(feed.feedUrl).hostname !== "news.google.com");
		assert.equal(direct.length, 15);
		for (const feed of direct) {
			assert.match(feed.blockage, /paywall/i, feed.id);
			assert.equal(isIntegrableFeed(feed), true, feed.id);
		}
	});

	it("keeps Google News fallbacks only when filtered by publisher site", () => {
		const viaGoogle = feeds.filter(
			(feed) => new URL(feed.feedUrl).hostname === "news.google.com",
		);
		assert.equal(viaGoogle.length, 2);
		for (const feed of viaGoogle) {
			assert.match(feed.feedUrl, /site(%3A|:)/i, feed.id);
			assert.equal(isIntegrableFeed(feed), true, feed.id);
		}
	});

	it("never writes article bodies or victim data into source rows", () => {
		const serialized = feeds.map((feed) => JSON.stringify(toSourceRecord(feed))).join("\n");
		for (const term of ["victim", "excerpt", "articleBody", "exemple_titre_recent"]) {
			assert.equal(serialized.includes(term), false, term);
		}
	});
});
