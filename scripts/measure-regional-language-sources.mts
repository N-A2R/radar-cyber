#!/usr/bin/env -S npx tsx
/**
 * Reproducible measure of integrated Occitan/Basque sources in Nouvelle-Aquitaine.
 *
 * The command only reads PostgreSQL and the versioned source corpus. It never
 * writes to the database and never handles victim data.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-regional-language-sources.mts \
 *     --json=bench/results/regional-language-sources.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	checkRegionalSourceEligibility,
	type RegionalSourceRecord,
} from "../apps/api/src/regionalLanguages/index.js";

const argv = process.argv.slice(2);
const JSON_PATH =
	argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ??
	"bench/results/regional-language-sources.json";
const CORPUS_PATH =
	argv.find((a) => a.startsWith("--corpus="))?.slice("--corpus=".length) ??
	"bench/corpus/sources-langues-regionales-na.jsonl";

const COUNT_SQL = `
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE language = 'oc')::int AS occitan,
         count(*) FILTER (WHERE language = 'eu')::int AS basque,
         count(DISTINCT department)::int AS departments
    FROM source
   WHERE language IN ('oc', 'eu')
     AND region = 'nouvelle-aquitaine'
     AND enabled
`;

const BREAKDOWN_SQL = `
  SELECT language, department, count(*)::int AS sources
    FROM source
   WHERE language IN ('oc', 'eu')
     AND region = 'nouvelle-aquitaine'
     AND enabled
   GROUP BY language, department
   ORDER BY language, department
`;

const BASELINE_SQL = `
  SELECT (SELECT count(*)::int FROM org) AS organisations,
         (SELECT count(*)::int FROM source) AS sources,
         (SELECT count(*)::int FROM event) AS events
`;

interface CountRow {
	total: number;
	occitan: number;
	basque: number;
	departments: number;
}

interface BreakdownRow {
	language: string;
	department: string;
	sources: number;
}

interface BaselineRow {
	organisations: number;
	sources: number;
	events: number;
}

function readCorpus(path: string): RegionalSourceRecord[] {
	const lines = readFileSync(path, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"));
	return lines.map((line, index) => {
		const parsed = JSON.parse(line) as RegionalSourceRecord;
		if (!checkRegionalSourceEligibility(parsed).eligible) {
			throw new Error(`corpus line ${index + 1} is not eligible: ${line}`);
		}
		return parsed;
	});
}

async function main(): Promise<void> {
	const [{ rows: counts }, { rows: breakdown }, { rows: baseline }] = await Promise.all([
		query<CountRow>(COUNT_SQL),
		query<BreakdownRow>(BREAKDOWN_SQL),
		query<BaselineRow>(BASELINE_SQL),
	]);
	const measured = counts[0];
	if (!measured) throw new Error("regional-language source count query returned no row");

	const corpus = readCorpus(CORPUS_PATH);
	const corpusIds = new Set(corpus.map((record) => record.id));
	const corpusCount = corpusIds.size;

	const payload = {
		scope: "Nouvelle-Aquitaine (12 departments)",
		languages: { oc: "Occitan", eu: "Basque" },
		rule: "enabled source with language in (oc, eu) and region = nouvelle-aquitaine",
		integratedSources: measured.total,
		occitanSources: measured.occitan,
		basqueSources: measured.basque,
		departmentsCovered: measured.departments,
		byLanguageAndDepartment: breakdown,
		corpusSources: corpusCount,
		corpusMatchesDatabase: corpusCount === measured.total,
		baseline: baseline[0] ?? null,
		sql: { count: COUNT_SQL, breakdown: BREAKDOWN_SQL, baseline: BASELINE_SQL },
	};

	console.log(`integrated regional-language sources: ${measured.total}`);
	console.log(`  Occitan: ${measured.occitan}, Basque: ${measured.basque}`);
	console.log(`  departments covered: ${measured.departments}`);
	console.log(`  corpus entries: ${corpusCount} (match: ${payload.corpusMatchesDatabase})`);

	writeFileSync(JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	console.log(`written: ${JSON_PATH}`);

	if (!payload.corpusMatchesDatabase) {
		throw new Error("corpus and database disagree: migration or corpus is incomplete");
	}
}

try {
	await main();
} finally {
	await closePools();
}
