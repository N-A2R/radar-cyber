/**
 * Reproducible precision measurement for AI-content detection.
 *
 * Read-only on the database; no network call, no paid service.
 *
 *   DATABASE_URL=... tsx scripts/measure-ai-content.mts
 *   DATABASE_URL=... tsx scripts/measure-ai-content.mts --verify
 *
 * Precision is measured on the frozen held-out `test` half of the gold corpus.
 * The `dev` half is published for calibration transparency but is not the
 * reported figure. The real-state counters are read live from the database.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	AI_CONTENT_THRESHOLD,
	detectAiContent,
} from "../apps/api/src/detect/ai-content.js";

const GOLD = "bench/ai-content/gold-v1.json";
const OUTPUT = "bench/results/ai-content-precision.json";
const VERIFY = process.argv.includes("--verify");
const NA_DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

type GoldEntry = {
	id: string;
	split: "dev" | "test";
	label: "ai" | "human";
	department: string;
	sourceKind: "public" | "gray";
	text: string;
};

type Gold = {
	version: number;
	protocol: string;
	database: Record<string, string>;
	effectifs: Record<string, number>;
	entries: GoldEntry[];
};

type Metrics = {
	positives: number;
	flagged: number;
	tp: number;
	fp: number;
	fn: number;
	tn: number;
	precision: number | null;
	precision_ci95: [number, number] | null;
	recall: number | null;
};
/** Wilson interval: honest uncertainty for a precision measured on a small held-out set. */
function wilson(tp: number, total: number): [number, number] {
	if (total === 0) return [0, 0];
	const z = 1.959963984540054;
	const p = tp / total;
	const denominator = 1 + (z * z) / total;
	const centre = (p + (z * z) / (2 * total)) / denominator;
	const half = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
	return [Math.max(0, centre - half), Math.min(1, centre + half)].map(
		(value) => Math.round(value * 10000) / 10000
	) as [number, number];
}

function score(entries: GoldEntry[]): Metrics {
	let tp = 0;
	let fp = 0;
	let fn = 0;
	let tn = 0;
	for (const entry of entries) {
		const flagged = detectAiContent({
			text: entry.text,
			department: entry.department,
			sourceKind: entry.sourceKind,
		}).isAiGenerated;
		if (entry.label === "ai" && flagged) tp += 1;
		else if (entry.label === "ai") fn += 1;
		else if (flagged) fp += 1;
		else tn += 1;
	}
	return {
		positives: tp + fn,
		flagged: tp + fp,
		tp,
		fp,
		fn,
		tn,
		precision: tp + fp > 0 ? Math.round((tp / (tp + fp)) * 10000) / 10000 : null,
		precision_ci95: tp + fp > 0 ? wilson(tp, tp + fp) : null,
		recall: tp + fn > 0 ? Math.round((tp / (tp + fn)) * 10000) / 10000 : null,
	};
}

async function main(): Promise<void> {
	const goldText = readFileSync(GOLD, "utf8");
	const gold = JSON.parse(goldText) as Gold;
	const hash = createHash("sha256").update(goldText).digest("hex");
	const test = score(gold.entries.filter((entry) => entry.split === "test"));
	const dev = score(gold.entries.filter((entry) => entry.split === "dev"));

	const live = await query<{ organisations: string; sources: string; events: string }>(
		`SELECT (SELECT count(*)::text FROM org) AS organisations,
		        (SELECT count(*)::text FROM source) AS sources,
		        (SELECT count(*)::text FROM event) AS events`
	);
	const rows = await query<{ title: string; summary: string | null; department: string }>(
		`SELECT e.title, e.summary, o.dept AS department
		   FROM event e JOIN org o ON o.id = e.org_id
		  WHERE o.dept = ANY($1::text[])`,
		[NA_DEPARTMENTS]
	);
	const realFlags = rows.rows.filter((row) =>
		detectAiContent({
			text: `${row.title ?? ""} ${row.summary ?? ""}`,
			department: row.department,
		}).isAiGenerated
	).length;

	const result = {
		command: `DATABASE_URL=$DATABASE_URL tsx scripts/measure-ai-content.mts${VERIFY ? " --verify" : ""}`,
		date: new Date().toISOString().slice(0, 10),
		threshold: AI_CONTENT_THRESHOLD,
		precision_definition: "TP / (TP + FP) on the held-out test half of the frozen gold corpus",
		gold_sha256: hash,
		database: live.rows[0],
		gold_database: gold.database,
		gold_entries: gold.effectifs,
		real_na_events: rows.rows.length,
		real_na_events_flagged: realFlags,
		dev,
		test,
	};

	if (VERIFY) {
		const stored = JSON.parse(readFileSync(OUTPUT, "utf8")) as typeof result;
		const ok = stored.gold_sha256 === hash && stored.test.precision === test.precision;
		console.log(JSON.stringify({ verified: ok, stored_precision: stored.test.precision, measured_precision: test.precision }));
		if (!ok) process.exitCode = 1;
		return;
	}
	writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
	console.log(JSON.stringify(result, null, 2));
}

try {
	await main();
} finally {
	await closePools();
}
