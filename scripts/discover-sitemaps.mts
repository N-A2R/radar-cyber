#!/usr/bin/env node
/**
 * Reproducible measurement of feeds discovered automatically from sitemaps.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/discover-sitemaps.mts \
 *     --dry-run --limit=40 --json=bench/results/sitemap-discovery-2026-11-21.json
 *
 * One run is bounded to 45 s of crawling; add `--offset=N` for another batch.
 */
import { mkdir, writeFile } from "node:fs/promises";
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
		limit: Math.max(1, Number(option("limit", "40")) || 40),
		offset: Math.max(0, Number(option("offset", "0")) || 0),
		concurrency: Math.max(1, Number(option("concurrency", "8")) || 8),
		budgetMs: Math.max(1000, Number(option("budget-ms", "45000")) || 45_000),
		json: resolve(option("json", "bench/results/sitemap-discovery-2026-11-21.json")),
	};
}

function replayCommand(args: ReturnType<typeof parseArgs>): string {
	return [
		"DATABASE_URL=postgres://radar:radar@localhost:5433/radar",
		"apps/api/node_modules/.bin/tsx scripts/discover-sitemaps.mts",
		...(args.dryRun ? ["--dry-run"] : []),
		`--limit=${args.limit}`,
		`--offset=${args.offset}`,
		`--json=${args.json.replace(`${process.cwd()}/`, "")}`,
	].join(" ");
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const { loadSeeds, discoverFeeds, makeFetch } = await import("../apps/api/src/discovery/discover.js");
	const { closePools, query } = await import("../apps/api/src/db.js");
	try {
		const { rows } = await query<{
			organisations: string;
			sources: string;
			evenements: string;
		}>(
			`SELECT (SELECT count(*) FROM org)::text AS organisations,
			        (SELECT count(*) FROM source)::text AS sources,
			        (SELECT count(*) FROM event)::text AS evenements`,
		);
		const seeds = await loadSeeds(args.limit, args.offset);
		const report = await discoverFeeds({
			seeds,
			fetch: makeFetch(),
			dryRun: args.dryRun,
			concurrency: args.concurrency,
			budgetMs: args.budgetMs,
		});
		const output = {
			titre: "Flux découverts automatiquement par crawl de sitemaps (Nouvelle-Aquitaine)",
			date: new Date().toISOString(),
			commande: replayCommand(args),
			etat_base: rows[0] ?? null,
			perimetre: {
				region: "Nouvelle-Aquitaine (12 départements)",
				seeds: "organisations du référentiel avec un domaine, département NA",
				sources_grises: true,
				donnees_personnelles_victimes: false,
			},
			mesure: report,
			methode: [
				"robots.txt : directives Sitemap",
				"sitemaps standards (y compris index et .gz)",
				"liens RSS/Atom alternates sur un nombre borné de pages",
				"validation HTTP 2xx + parseSource() avec au moins un item",
				"id stable : redécouverte sans doublon",
			],
		};
		await mkdir(dirname(args.json), { recursive: true });
		await writeFile(args.json, `${JSON.stringify(output, null, 2)}\n`, "utf8");
		console.log(JSON.stringify({
			seeds: report.seeds,
			sitemaps_fetched: report.sitemapsFetched,
			urls_scanned: report.urlsScanned,
			candidates_probed: report.candidatesProbed,
			feeds_discovered: report.feedsDiscovered,
			sources_registered: report.sourcesInserted,
			duration_ms: report.durationMs,
			json: args.json,
		}, null, 2));
	} finally {
		await closePools();
	}
}

try {
	await main();
} catch (error) {
	process.stderr.write(`discover-sitemaps: ${String(error)}\n`);
	process.exitCode = 1;
}
