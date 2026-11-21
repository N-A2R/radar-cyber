#!/usr/bin/env -S npx tsx
/**
 * Idempotent integration of verified public title feeds into `source`.
 *
 * The corpus is the registry; an enabled source already pointing at the same
 * URL is never duplicated. Only RSS metadata is used: no article body, no
 * paywall circumvention, no victim data. No network call is made here.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/integrate-public-title-feeds.mts \
 *     [--dry-run] [--out=bench/results/public-title-feeds-integration.json]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query, withIngestTransaction } from "../apps/api/src/db.js";
import {
	integrationPlan,
	isIntegrableFeed,
	loadFeedCorpus,
} from "../apps/api/src/press/public-title-feeds.js";

const corpusPath = fileURLToPath(new URL("../bench/corpus/quotidiens.jsonl", import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const outArg = args.find((arg) => arg.startsWith("--out="));
const outPath = outArg
	? fileURLToPath(new URL(`../${outArg.slice("--out=".length)}`, import.meta.url))
	: null;

const INSERT = `INSERT INTO source
  (id, name, family, url, license, enabled, kind, format, parser, interval_sec, relevance, description)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
  ON CONFLICT (id) DO NOTHING`;

async function main(): Promise<void> {
	const feeds = loadFeedCorpus(corpusPath);
	const rejected = feeds.filter((feed) => !isIntegrableFeed(feed)).map((feed) => feed.id);
	if (rejected.length > 0) {
		throw new Error(`feeds failing the NA / metadata-only / load-proof checks: ${rejected.join(", ")}`);
	}

	const { rows } = await query<{ url: string }>("SELECT url FROM source WHERE enabled = true");
	const plan = integrationPlan(
		feeds,
		rows.map((row) => row.url),
	);

	if (!dryRun && plan.inserts.length > 0) {
		await withIngestTransaction(async (client) => {
			for (const source of plan.inserts) {
				await client.query(INSERT, [
					source.id,
					source.name,
					source.family,
					source.url,
					source.license,
					source.enabled,
					source.kind,
					source.format,
					JSON.stringify(source.parser),
					source.intervalSec,
					source.relevance,
					source.description,
				]);
			}
		});
	}

	const result = {
		dryRun,
		corpusFeeds: feeds.length,
		alreadyIntegrated: plan.alreadyIntegrated.length,
		inserted: plan.inserts.length,
		insertedIds: plan.inserts.map((source) => source.id),
		integratedAfter: plan.alreadyIntegrated.length + plan.inserts.length,
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
