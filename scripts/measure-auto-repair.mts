/**
 * Reproducible measurement of sources repaired without human intervention.
 *
 * Reads the versioned corpus of real Nouvelle-Aquitaine bodies captured from
 * the live web (bench/corpus/auto-repair-na.jsonl) and runs the exact repair
 * path used by the collector, then counts distinct sources whose defective
 * body becomes readable. Offline, deterministic, well under 60 seconds.
 *
 * Usage:
 *   apps/api/node_modules/.bin/tsx scripts/measure-auto-repair.mts
 *   apps/api/node_modules/.bin/tsx scripts/measure-auto-repair.mts --json
 */
import { readFile, writeFile } from "node:fs/promises";
import { detectItems } from "../apps/api/src/collectors/generic.js";
import { repairItems } from "../apps/api/src/collectors/parsers/auto-repair.js";

interface CorpusRow {
	id: string;
	body: string;
	contentType: string;
	hasDefect: boolean;
}

const population = (await readFile("bench/corpus/sources-na-population.jsonl", "utf8"))
	.trim()
	.split("\n")
	.filter(Boolean);

const rows = (await readFile("bench/corpus/auto-repair-na.jsonl", "utf8"))
	.trim()
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line) as CorpusRow);

const repairedIds = new Set<string>();
const labels: Record<string, number> = {};
for (const row of rows) {
	const verdict = repairItems(row.body, row.contentType, detectItems);
	if (!verdict.repaired) continue;
	repairedIds.add(row.id);
	for (const label of verdict.repairs) labels[label] = (labels[label] ?? 0) + 1;
}

const result = {
	generatedAt: new Date().toISOString(),
	metric: "sources repaired without human intervention",
	scope: "Nouvelle-Aquitaine",
	referenceState: {
		organisations: 1_673_151,
		sources: 312,
		events: 26_719,
		source: "docs/agents-cpu.md:4, docs/couverture-mesuree.md:28",
		observedAt: "2026-11-21",
	},
	population: "bench/corpus/sources-na-population.jsonl",
	corpus: "bench/corpus/auto-repair-na.jsonl",
	sourcesProbed: population.length,
	sourcesWithDefect: rows.filter((row) => row.hasDefect).length,
	repairedSources: repairedIds.size,
	repairs: labels,
	repairedIds: [...repairedIds].sort(),
};

await writeFile("bench/results/auto-repair-na.json", JSON.stringify(result, null, 2) + "\n");
if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
else console.log(`repaired sources: ${result.repairedSources}`);
