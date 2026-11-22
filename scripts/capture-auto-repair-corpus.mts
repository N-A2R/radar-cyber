/**
 * Capture the real Nouvelle-Aquitaine responses used by the auto-repair replay.
 *
 * The population is the versioned catalogue of 1,000 verified NA sources
 * (bench/corpus/sources-na-population.jsonl, 12 departments). Only bodies with
 * a repairable transport defect are stored, so the replay corpus stays small.
 * Emails, phone numbers and long digit runs are stripped before anything is
 * written: no victim personal data is ever captured.
 *
 * Usage (one range per command, each well under 60 seconds):
 *   apps/api/node_modules/.bin/tsx scripts/capture-auto-repair-corpus.mts --offset 0 --limit 250
 *   apps/api/node_modules/.bin/tsx scripts/capture-auto-repair-corpus.mts --offset 250 --limit 250
 */
import { readFile, writeFile } from "node:fs/promises";
import { detectItems } from "../apps/api/src/collectors/generic.js";
import { repairCandidates, repairItems } from "../apps/api/src/collectors/parsers/auto-repair.js";

interface SourceRow {
	id: string;
	name: string;
	url: string;
	department: string;
	family: string;
}

interface CorpusRow {
	id: string;
	name: string;
	url: string;
	department: string;
	contentType: string;
	httpStatus: number;
	capturedAt: string;
	defect: string;
	hasDefect: boolean;
	baselineStrategy: string;
	repaired: boolean;
	repairs: string[];
	itemCount: number;
	body: string;
}

const args = process.argv.slice(2);
function numberArg(name: string, fallback: number): number {
	const index = args.indexOf(`--${name}`);
	if (index < 0) return fallback;
	const value = Number(args[index + 1]);
	return Number.isInteger(value) && value >= 0 ? value : fallback;
}
const offset = numberArg("offset", 0);
const limit = numberArg("limit", 250);

const population = (await readFile("bench/corpus/sources-na-population.jsonl", "utf8"))
	.trim()
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line) as SourceRow)
	.slice(offset, offset + limit);

function stripPersonalData(body: string): string {
	return body
		.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email-redacted]")
		.replace(/(?:\+33|0)[ .-]?\d(?:[ .-]?\d){8,}/g, "[phone-redacted]")
		.replace(/\b\d{9,}\b/g, "[number-redacted]")
		.slice(0, 60_000);
}

async function capture(source: SourceRow): Promise<CorpusRow | null> {
	try {
		const response = await fetch(source.url, {
			redirect: "follow",
			signal: AbortSignal.timeout(3_000),
			headers: { "User-Agent": "RadarCyberNA/0.4 (auto-repair corpus capture)", Accept: "*/*" },
		});
		const body = stripPersonalData(await response.text());
		const contentType = response.headers.get("content-type") ?? "text/html";
		const baseline = detectItems(body, contentType);
		const verdict = repairItems(body, contentType, detectItems, baseline);
		const defect = repairCandidates(body)[0]?.id;
		if (!defect) return null;
		return {
			...source,
			contentType,
			httpStatus: response.status,
			capturedAt: new Date().toISOString(),
			defect,
			hasDefect: true,
			baselineStrategy: baseline.strategy,
			repaired: verdict.repaired,
			repairs: verdict.repairs,
			itemCount: verdict.itemCount,
			body,
		};
	} catch {
		return null;
	}
}

const captured: CorpusRow[] = [];
for (let i = 0; i < population.length; i += 20) {
	captured.push(...(await Promise.all(population.slice(i, i + 20).map(capture))).filter((row) => row !== null));
}

const corpusPath = "bench/corpus/auto-repair-na.jsonl";
let existing: CorpusRow[] = [];
try {
	existing = (await readFile(corpusPath, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as CorpusRow);
} catch {
	// First capture: no corpus yet.
}
const merged = new Map<string, CorpusRow>();
for (const row of existing) merged.set(row.id, row);
for (const row of captured) if (!merged.has(row.id)) merged.set(row.id, row);
await writeFile(corpusPath, [...merged.values()].map((row) => JSON.stringify(row)).join("\n") + "\n");

console.log(`probed ${population.length} sources; ${captured.length} defective bodies captured; corpus ${merged.size} rows; repaired ${[...merged.values()].filter((row) => row.repaired).length}`);
