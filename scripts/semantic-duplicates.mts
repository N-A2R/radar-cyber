#!/usr/bin/env -S npx tsx
/**
 * Measure semantic duplicates of organisations in Nouvelle-Aquitaine.
 *
 * Read-only: the script never merges a row and never reads a victim field.
 * It streams the organisation table into the pure detector, then writes a
 * reproducible report (pairs, groups, and optionally a stable sample and
 * the precision computed from a hand-verified verdict file).
 *
 * Usage:
 *   tsx scripts/semantic-duplicates.mts
 *   tsx scripts/semantic-duplicates.mts --json=bench/results/semantic-duplicates.json
 *   tsx scripts/semantic-duplicates.mts --sample=100 --seed=42 \
 *     --precision=bench/results/semantic-duplicates-verdicts.json
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const requireFromApi = createRequire(fileURLToPath(new URL("../apps/api/package.json", import.meta.url)));
const { Query } = requireFromApi("pg") as typeof import("pg");
import { ingestPool } from "../apps/api/src/db.js";
import {
	computePrecision,
	createSemanticDetector,
	NA_DEPARTMENT_CODES,
	samplePairs,
	type SemanticOrgRow,
	type Verdict,
} from "../apps/api/src/dedup/semantic-duplicates.js";

type Options = {
	jsonFile: string | null;
	sample: number;
	seed: number;
	precisionFile: string | null;
};

type RawRow = {
	id: number;
	name: string | null;
	city: string | null;
	dept: string | null;
	siren: string | null;
	entity_source: string | null;
};

function optionsFrom(argv: string[]): Options {
	const value = (flag: string): string | null => {
		const found = argv.find((arg) => arg.startsWith(`--${flag}=`));
		return found === undefined ? null : found.slice(flag.length + 3);
	};
	const sample = Number(value("sample") ?? "0");
	const seed = Number(value("seed") ?? "20261122");
	if (!Number.isInteger(sample) || sample < 0) throw new Error("--sample must be a non-negative integer");
	if (!Number.isInteger(seed)) throw new Error("--seed must be an integer");
	return { jsonFile: value("json"), sample, seed, precisionFile: value("precision") };
}

async function main(): Promise<void> {
	const options = optionsFrom(process.argv.slice(2));
	const client = await ingestPool.connect();
	try {
		// A single scan must stay well below the sixty-second command ceiling.
		await client.query("SET statement_timeout = 55000");
		const totals = await client.query<{ orgs: string; sources: string }>(
			"SELECT (SELECT count(*)::text FROM org) AS orgs, (SELECT count(*)::text FROM source) AS sources",
		);
		const detector = createSemanticDetector();
		const stream = new Query({
			text: `SELECT id, name, city, dept, siren, entity_source
			       FROM org WHERE dept = ANY($1::text[])`,
			values: [NA_DEPARTMENT_CODES],
		});
		let scanned = 0;
		stream.on("row", (raw: RawRow) => {
			scanned += 1;
			const row: SemanticOrgRow = {
				id: Number(raw.id),
				name: raw.name ?? "",
				city: raw.city,
				dept: raw.dept,
				siren: raw.siren,
				entitySource: raw.entity_source,
			};
			detector.add(row);
		});
		const finished = new Promise<void>((resolve, reject) => {
			stream.on("end", resolve);
			stream.on("error", reject);
		});
		client.query(stream);
		await finished;

		const result = detector.result();
		const sample = options.sample > 0 ? samplePairs(result.pairs, options.sample, options.seed) : null;
		const precision = options.precisionFile === null
			? null
			: computePrecision(
				result.pairs,
				JSON.parse(readFileSync(resolve(options.precisionFile), "utf8")) as Record<string, Verdict>,
			);
		const sources = [...new Set(result.pairs.flatMap((pair) => [pair.left.source, pair.right.source]))].sort();
		const report = {
			generatedAt: new Date().toISOString(),
			scope: {
				organisations: Number(totals.rows[0]!.orgs),
				cataloguedSources: Number(totals.rows[0]!.sources),
				departments: NA_DEPARTMENT_CODES.length,
				naOrganisationsScanned: scanned,
				eligibleRows: result.eligibleRows,
				sources,
			},
			detected: { pairs: result.pairs.length, groups: result.groups.length },
			sample: sample === null ? null : { seed: options.seed, size: sample.length, pairs: sample },
			precision,
			pairs: result.pairs,
			groups: result.groups,
		};

		if (options.jsonFile !== null) {
			const path = resolve(options.jsonFile);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
		}
		console.log(JSON.stringify({
			organisations: report.scope.organisations,
			naOrganisationsScanned: scanned,
			eligibleRows: result.eligibleRows,
			detectedPairs: report.detected.pairs,
			detectedGroups: report.detected.groups,
			precision,
		}));
	} finally {
		client.release();
		await ingestPool.end();
	}
}

await main();
