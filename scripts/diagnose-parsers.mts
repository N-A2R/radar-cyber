/**
 * Pourquoi 300 sources répondent-elles en 200 sans produire d'item ?
 *
 * Le script tire un échantillon de sources vivantes mais muettes (`last_items
 * = 0`), télécharge chacune une fois (10 s, 1 req/s, User-Agent explicite) et
 * fait tourner `detectItems` (collectors/generic.ts) sur le corps obtenu.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/diagnose-parsers.mts
 *   apps/api/node_modules/.bin/tsx scripts/diagnose-parsers.mts --limit 10
 *   apps/api/node_modules/.bin/tsx scripts/diagnose-parsers.mts --json
 *
 * Lecture seule : aucune insertion, aucun UPDATE, aucune désactivation.
 */
import { closePools, query } from "../apps/api/src/db.js";
import { detectItems, type DetectionStrategy } from "../apps/api/src/collectors/generic.js";

const USER_AGENT = "radar-cyber-parser-diagnose/1.0 (+https://radar-cyber.local; parser audit)";
const ACCEPT = "application/json, application/rss+xml, application/atom+xml, text/xml, text/csv, text/html;q=0.9, */*;q=0.5";
const TIMEOUT_MS = 10_000;
const SPACING_MS = 1000;
const MAX_BYTES = 10 * 1024 * 1024;

interface CandidateRow {
	id: string;
	name: string;
	url: string;
	format: string;
	kind: string;
	parser: Record<string, unknown> | null;
}

interface RowResult {
	source: string;
	contentType: string;
	strategy: DetectionStrategy;
	items: number;
	note: string;
}

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith("--limit"));
const limit = limitArg ? Number(limitArg.split("=")[1] ?? limitArg.split(" ")[1]) : 25;
const asJson = args.includes("--json");

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(url: string): Promise<{ body: string; contentType: string; note: string }> {
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": USER_AGENT, Accept: ACCEPT },
			signal: AbortSignal.timeout(TIMEOUT_MS),
			redirect: "follow",
		});
		const contentType = res.headers.get("content-type") ?? "";
		if (!res.ok) {
			await res.body?.cancel();
			return { body: "", contentType, note: `HTTP ${res.status}` };
		}
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length > MAX_BYTES) return { body: "", contentType, note: `trop gros (${buf.length} o)` };
		return { body: buf.toString("utf8"), contentType, note: "" };
	} catch (e) {
		const err = e as Error;
		return { body: "", contentType: "", note: err.name === "TimeoutError" ? "timeout" : err.message.slice(0, 60) };
	}
}

async function sample(): Promise<CandidateRow[]> {
	const buckets: { label: string; where: string; count: number }[] = [
		{ label: "estorides", where: "id LIKE 'estorides:%'", count: 10 },
		{ label: "feed", where: "id LIKE 'feed:%'", count: 10 },
		{ label: "autres", where: "id NOT LIKE 'feed:%' AND id NOT LIKE 'estorides:%'", count: Math.max(0, limit - 20) },
	];
	const rows: CandidateRow[] = [];
	for (const bucket of buckets) {
		const { rows: picked } = await query<CandidateRow>(
			`SELECT id, name, url, format, kind, parser FROM source
			 WHERE enabled AND kind <> 'quarantine' AND coalesce(last_items, 0) = 0
			   AND last_ok_at IS NOT NULL AND ${bucket.where}
			 ORDER BY random() LIMIT ${bucket.count}`,
		);
		rows.push(...picked.map((r) => ({ ...r, parser: r.parser ?? {} })));
	}
	return rows;
}

function pad(text: string, width: number): string {
	return text.length > width ? `${text.slice(0, width - 1)}…` : text.padEnd(width);
}

async function main(): Promise<void> {
	const rows = await sample();
	console.log(`${rows.length} sources muettes sondées (1 req/s, timeout ${TIMEOUT_MS / 1000} s)\n`);
	const results: RowResult[] = [];
	for (const row of rows) {
		const fetched = await fetchOnce(row.url);
		const detection = detectItems(fetched.body, fetched.contentType);
		results.push({
			source: row.id,
			contentType: fetched.contentType.split(";")[0] || "—",
			strategy: detection.strategy,
			items: detection.items.length,
			note: fetched.note,
		});
		await sleep(SPACING_MS);
	}

	if (asJson) {
		console.log(JSON.stringify(results, null, 2));
	} else {
		console.log(`| source | content-type | stratégie | items |`);
		console.log(`| --- | --- | --- | ---: |`);
		for (const r of results) {
			const suffix = r.note ? ` (${r.note})` : "";
			console.log(`| ${pad(r.source, 44)} | ${pad(r.contentType, 28)} | ${r.strategy}${suffix} | ${r.items} |`);
		}
	}

	const byStrategy = new Map<DetectionStrategy, number>();
	for (const r of results) byStrategy.set(r.strategy, (byStrategy.get(r.strategy) ?? 0) + 1);
	const recov = results.filter((r) => r.strategy !== "none").length;
	console.log(`\nRécapitulatif : ${recov}/${results.length} récupérables · strat. ${JSON.stringify(Object.fromEntries(byStrategy))}`);
	await closePools();
}

main().catch(async (e: unknown) => {
	console.error(e);
	await closePools();
	process.exitCode = 1;
});
