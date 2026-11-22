#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of integrated public title feeds.
 *
 * A feed is integrated when the frozen corpus entry is eligible (NA only,
 * public metadata only, dated successful load proof) and the database has an
 * enabled source whose URL matches the feed URL. Read-only, no network call.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-public-title-feeds.mts \
 *     --out=bench/results/public-title-feeds.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	countIntegratedFeeds,
	integratedFeedIds,
	isIntegrableFeed,
	loadFeedCorpus,
} from "../apps/api/src/press/public-title-feeds.js";

const corpusPath = fileURLToPath(new URL("../bench/corpus/quotidiens.jsonl", import.meta.url));
const args = process.argv.slice(2);
const outArg = args.find((arg) => arg.startsWith("--out="));
const outPath = outArg
	? fileURLToPath(new URL(`../${outArg.slice("--out=".length)}`, import.meta.url))
	: null;

async function main(): Promise<void> {
	const feeds = loadFeedCorpus(corpusPath);
	const { rows } = await query<{ url: string }>("SELECT url FROM source WHERE enabled = true");
	const enabledUrls = rows.map((row) => row.url);
	const { rows: prefixRows } = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM source WHERE id LIKE 'public-title:%' AND enabled = true",
	);

	const integrated = countIntegratedFeeds(feeds, enabledUrls);
	const result = {
		measuredAt: new Date().toISOString(),
		definition:
			"eligible corpus feeds (Nouvelle-Aquitaine, public RSS metadata only, dated HTTP 200 load proof) with an enabled source URL in the database",
		corpusFeeds: feeds.length,
		eligibleFeeds: feeds.filter(isIntegrableFeed).length,
		integratedFeeds: integrated,
		integratedFeedIds: integratedFeedIds(feeds, enabledUrls),
		paywalledPublisherFeeds: feeds.filter((feed) => /paywall/i.test(feed.blockage)).length,
		googleNewsFallbackFeeds: feeds.filter((feed) => new URL(feed.feedUrl).hostname === "news.google.com")
			.length,
		enabledSourceRows: enabledUrls.length,
		registeredPublicTitleSourceRows: prefixRows[0]?.n ?? 0,
	};

	console.log(JSON.stringify(result, null, 2));
	if (outPath) {
		mkdirSync(dirname(outPath), { recursive: true });
		writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
		console.log(`written: ${outPath}`);
	}
}

try {
	await main();
} finally {
	await closePools();
}
