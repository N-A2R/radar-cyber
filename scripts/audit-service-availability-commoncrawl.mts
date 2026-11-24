/**
 * Reproducible audit of the raw Common Crawl index for the missing service
 * days. Free, public and bounded: only the captured URL and UTC timestamp of
 * the perimeter URLs are read, never a payload or a personal field.
 *
 *   apps/api/node_modules/.bin/tsx scripts/audit-service-availability-commoncrawl.mts \
 *     --from=2026-11-18 --to=2026-11-20
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import {
	classifyCrawlCaptures,
	perimeterUrls,
	type CrawlCaptureRow,
} from "../apps/api/src/serviceAvailability/crawlProofs.js";
import { normalizeExpositionProofUrl } from "../apps/api/src/serviceAvailability/dbProofs.js";
import { parseObservations } from "../apps/api/src/serviceAvailability/observations.js";
import { readCorpusPerimeter } from "../apps/api/src/serviceAvailability/perimeter.js";

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function* indexLines(source: string): AsyncGenerator<string> {
	if (/^https?:\/\//i.test(source)) {
		const response = await fetch(source);
		if (!response.ok || response.body === null) {
			throw new Error(`index fetch failed: HTTP ${response.status}`);
		}
		const decoder = new TextDecoder();
		let buffered = "";
		for await (const chunk of response.body) {
			buffered += decoder.decode(chunk, { stream: true });
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			for (const line of lines) yield line;
		}
		if (buffered.trim().length > 0) yield buffered;
		return;
	}
	for await (const line of createInterface({
		input: createReadStream(source),
		crlfDelay: Infinity,
	})) yield line;
}

/** Common Crawl SURT `fr,ac-poitiers,etab)/page` back to a full URL. */
export function urlFromSurt(surt: string): string | null {
	const end = surt.indexOf(")/");
	if (end <= 0) return null;
	const host = surt.slice(0, end).split(":")[0]!;
	if (!host.includes(",")) return null;
	return `https://${host.split(",").reverse().join(".")}${surt.slice(end + 1)}`;
}

async function main(): Promise<void> {
	const from = option("from", "2026-11-18");
	const to = option("to", "2026-11-20");
	const index = option("index", "https://data.commoncrawl.org/cc-index/collections/CC-MAIN-2026-47/indexes/cluster.idx");
	const maxLines = Number(option("max-lines", "10000000"));
	if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
		throw new RangeError("expected --from=YYYY-MM-DD and --to=YYYY-MM-DD");
	}
	if (!Number.isFinite(maxLines) || maxLines <= 0) throw new RangeError("invalid --max-lines");

	const services = readCorpusPerimeter(resolve("bench/corpus/institutions-complet.jsonl"));
	const urls = perimeterUrls(services);
	const observationsPath = resolve("bench/results/service-availability-observations.jsonl");
	const observed = new Set(
		(existsSync(observationsPath) ? parseObservations(readFileSync(observationsPath, "utf8")) : [])
			.map((row) => `${row.serviceId}\u0000${row.day}`)
	);

	const captures: CrawlCaptureRow[] = [];
	let lines = 0;
	for await (const line of indexLines(index)) {
		lines += 1;
		if (lines > maxLines) break;
		const first = line.split("\t", 1)[0] ?? "";
		const split = first.lastIndexOf(" ");
		if (split <= 0) continue;
		const url = urlFromSurt(first.slice(0, split));
		if (url === null || !urls.has(normalizeExpositionProofUrl(url))) continue;
		captures.push({ url, timestamp: first.slice(split + 1).trim() });
	}

	const audit = classifyCrawlCaptures(captures, services, from, to);
	const newServiceDays = audit.serviceDayKeys.filter((key) => !observed.has(key)).length;
	console.log(
		`index=${index} lines=${lines} perimeter_urls=${urls.size} ` +
		`window=${from}..${to} rows_in_window=${audit.rowsInWindow} ` +
		`perimeter_rows=${audit.perimeterRows} capturable_service_days=${audit.capturableServiceDays} ` +
		`new_service_days=${newServiceDays} verdict=${audit.perimeterRows === 0 ? "no_captures" : "captures_found"}`
	);
	for (const day of audit.byDay) {
		console.log(`day=${day.day} rows=${day.rows} perimeter_rows=${day.perimeterRows}`);
	}
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
