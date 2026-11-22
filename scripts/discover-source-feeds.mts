#!/usr/bin/env node
/**
 * Reproducible measurement of RSS/Atom feeds found on catalogue sources that
 * had no feed URL. One run is bounded (default 100 s) and idempotent.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/discover-source-feeds.mts \
 *     --dry-run --json=bench/results/source-feeds-2026-11-22.json
 *
 * Without --dry-run the validated feeds are registered as gray enabled
 * sources; their provenance keeps the original catalogue source id.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

function parseArgs(argv: string[]) {
	const option = (name: string, fallback: string): string => {
		const prefix = `--${name}=`;
		const inline = argv.find((arg) => arg.startsWith(prefix));
		if (inline) return inline.slice(prefix.length) || fallback;
		const index = argv.indexOf(`--${name}`);
		return index >= 0 && argv[index + 1] && !argv[index + 1]!.startsWith("--")
			? argv[index + 1]!
			: fallback;
	};
	return {
		dryRun: argv.includes("--dry-run"),
		limit: Math.max(1, Number(option("limit", "200")) || 200),
		offset: Math.max(0, Number(option("offset", "0")) || 0),
		concurrency: Math.max(1, Number(option("concurrency", "24")) || 24),
		budgetMs: Math.max(1000, Number(option("budget-ms", "100000")) || 100_000),
		maxFeedsPerSource: Math.max(1, Number(option("max-feeds-per-source", "10")) || 10),
		only: option("only", ""),
		fromJson: option("from-json", ""),
		json: resolve(option("json", "bench/results/source-feeds-2026-11-22.json")),
	};
}

function replayCommand(args: ReturnType<typeof parseArgs>): string {
	return [
		"DATABASE_URL=postgres://radar:radar@localhost:5433/radar",
		"apps/api/node_modules/.bin/tsx scripts/discover-source-feeds.mts",
		...(args.dryRun ? ["--dry-run"] : []),
		`--limit=${args.limit}`,
		`--offset=${args.offset}`,
		`--concurrency=${args.concurrency}`,
		...(args.only ? [`--only=${args.only}`] : []),
		...(args.fromJson ? [`--from-json=${args.fromJson.replace(`${process.cwd()}/`, "")}`] : []),
		`--json=${args.json.replace(`${process.cwd()}/`, "")}`,
	].join(" ");
}

const COUNT_SQL = `SELECT count(*)::text AS total,
		                  count(*) FILTER (WHERE format IN ('rss','atom'))::text AS feeds,
		                  count(*) FILTER (WHERE format = 'html')::text AS pages
		             FROM source`;

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const { loadSourcesWithoutFeeds, discoverSourceFeeds, makeSourceFeedFetch, SOURCE_FEED_PATHS, registerSourceFeeds } =
		await import("../apps/api/src/discovery/source-feeds.js");
	const { closePools, query } = await import("../apps/api/src/db.js");
	try {
		const { rows: before } = await query<{ total: string; feeds: string; pages: string }>(COUNT_SQL);
		if (args.fromJson) {
			const measured = JSON.parse(await readFile(args.fromJson, "utf8")) as {
				flux: Array<{
					url: string;
					format: string;
					source_id: string;
					sources_initialises: string[];
					url_initiale: string;
					id_source_enregistree: string;
				}>;
			};
			const feeds = measured.flux.map((entry) => ({
				id: entry.id_source_enregistree,
				url: entry.url,
				format: entry.format as "rss" | "atom",
				items: 1,
				sourceId: entry.source_id,
				sourceUrl: entry.url_initiale,
				sourceIds: entry.sources_initialises,
				name: entry.source_id,
				family: "presse",
				license: null,
				relevance: "context",
			}));
			const registered = await registerSourceFeeds(feeds);
			const { rows: after } = await query<{ total: string; feeds: string; pages: string }>(COUNT_SQL);
			const output = {
				titre: "Flux RSS/Atom validés puis enregistrés depuis la mesure reproductible",
				date: new Date().toISOString(),
				commande: replayCommand(args),
				mesure_source: args.fromJson.replace(`${process.cwd()}/`, ""),
				etat_base_avant: before[0] ?? null,
				etat_base_apres: after[0] ?? null,
				mesure: {
					flux_decouverts: feeds.length,
					flux_enregistres: registered,
					sources_couvertes: new Set(feeds.flatMap((feed) => feed.sourceIds)).size,
				},
				flux: feeds.map((feed) => ({
					url: feed.url,
					format: feed.format,
					source_id: feed.sourceId,
					sources_initialises: feed.sourceIds,
					id_source_enregistree: feed.id,
				})),
			};
			await mkdir(dirname(args.json), { recursive: true });
			await writeFile(args.json, `${JSON.stringify(output, null, 2)}\n`, "utf8");
			console.log(JSON.stringify({ ...output.mesure, json: args.json }, null, 2));
			return;
		}
		const sources = (await loadSourcesWithoutFeeds(args.limit, args.offset))
			.filter((source) => !args.only || args.only.split(",").includes(source.id));
		const { rows: known } = await query<{ url: string }>("SELECT url FROM source WHERE enabled");
		const report = await discoverSourceFeeds({
			sources,
			fetch: makeSourceFeedFetch(),
			dryRun: args.dryRun,
			concurrency: args.concurrency,
			budgetMs: args.budgetMs,
			maxFeedsPerSource: args.maxFeedsPerSource,
			existingUrls: known.map((row) => row.url),
			onLog: (message) => process.stderr.write(`${message}\n`),
		});
		const output = {
			titre: "Flux RSS/Atom découverts sur les sources du catalogue sans flux",
			date: new Date().toISOString(),
			commande: replayCommand(args),
			dry_run: args.dryRun,
			etat_base_avant: before[0] ?? null,
			perimetre: {
				sources_sans_flux: sources.length,
				chemins_testes: [...SOURCE_FEED_PATHS],
				liens_alternates_du_site: true,
				validation: "HTTP 2xx + detectFeedFormat + parseSource avec au moins un item",
				donnees_personnelles: false,
			},
			mesure: {
				sources_scannees: report.sourcesScanned,
				candidats_probes: report.candidatesProbed,
				liens_alternates: report.alternateLinks,
				flux_decouverts: report.feedsFound,
				sources_couvertes: report.sourcesCovered,
				flux_enregistres: report.feedsRegistered,
				erreurs: report.errors,
				duree_ms: report.durationMs,
			},
			flux: report.feeds.map((feed) => ({
				url: feed.url,
				format: feed.format,
				source_id: feed.sourceId,
				sources_initialises: feed.sourceIds,
				url_initiale: feed.sourceUrl,
				id_source_enregistree: feed.id,
			})),
		};
		await mkdir(dirname(args.json), { recursive: true });
		await writeFile(args.json, `${JSON.stringify(output, null, 2)}\n`, "utf8");
		console.log(JSON.stringify({
			...output.mesure,
			json: args.json,
		}, null, 2));
	} finally {
		await closePools();
	}
}

try {
	await main();
} catch (error) {
	process.stderr.write(`discover-source-feeds: ${String(error)}\n`);
	process.exitCode = 1;
}

// Undici keep-alive sockets can outlive the bounded run; exit after reporting.
setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref();
