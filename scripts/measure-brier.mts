/**
 * Reproducible Brier measurement for the confidence score.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-brier.mts \
 *     --json=bench/results/brier-calibration-2026-11-22.json
 *
 * Labels come from the frozen, human-read corpus `bench/pertinence/corpus-100.json`:
 * 100 real events from Nouvelle-Aquitaine project sources, labelled from the
 * title only, without consulting the confidence score or its four components.
 * The script is read-only; it never changes the database or the labels.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	crossValidatedBrier,
	probabilityFromScore,
	type CalibrationSample,
} from "../apps/api/src/analyse/calibration.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { query, closePools } = await import("../apps/api/src/db.js");

/** Fixed before the first measurement; not overridable on the command line. */
export const TARGET_BRIER = 0.22;
const FOLDS = 5;
const BINS = 4;
const PRIOR_WEIGHT = 1;
const LABEL_PATH = fileURLToPath(new URL("../bench/pertinence/corpus-100.json", import.meta.url));

type LabelItem = { id: number | string; label: string; titre?: string; source?: string };
type ScoreRow = { event_id: string | number; score: number | string; regional?: boolean };

export type BrierReport = {
	generatedAt: string;
	target: { brier: number; direction: "lower is better" };
	method: {
		labels: string;
		labelIndependence: string;
		scope: string;
		folds: number;
		bins: number;
		priorWeight: number;
		databaseReadsOnly: true;
	};
	dataset: {
		labeled: number;
		matched: number;
		missingScores: number;
		positives: number;
		negatives: number;
	};
	results: {
		rawBrier: number;
		calibratedBrier: number;
		baselineBrier: number;
		target: number;
		achieved: boolean;
		improvement: number;
	};
	reliability: {
		lower: number;
		upper: number;
		count: number;
		positives: number;
		meanRawProbability: number;
		observedRate: number;
		calibratedProbability: number;
	}[];
	limitations: string[];
};

export function buildReport(
	labels: readonly LabelItem[],
	rows: readonly ScoreRow[],
	now: Date = new Date(),
): BrierReport {
	const scores = new Map<number, number>();
	for (const row of rows) scores.set(Number(row.event_id), Number(row.score));
	const samples: CalibrationSample[] = [];
	let missingScores = 0;
	for (const item of labels) {
		const score = scores.get(Number(item.id));
		if (score === undefined) {
			missingScores++;
			continue;
		}
		samples.push({ score, label: item.label === "cyber" ? 1 : 0 });
	}
	const result = crossValidatedBrier(samples, FOLDS, BINS, PRIOR_WEIGHT);
	const positives = samples.filter((sample) => sample.label === 1).length;
	return {
		generatedAt: now.toISOString(),
		target: { brier: TARGET_BRIER, direction: "lower is better" },
		method: {
			labels: "bench/pertinence/corpus-100.json (frozen human labels from titles)",
			labelIndependence: "labels assigned from titles without reading the score or its components",
			scope: "events from Nouvelle-Aquitaine project sources (gn-*, presse-*, eco-*)",
			folds: FOLDS,
			bins: BINS,
			priorWeight: PRIOR_WEIGHT,
			databaseReadsOnly: true,
		},
		dataset: {
			labeled: labels.length,
			matched: samples.length,
			missingScores,
			positives,
			negatives: samples.length - positives,
		},
		results: {
			rawBrier: result.rawBrier,
			calibratedBrier: result.calibratedBrier,
			baselineBrier: result.baselineBrier,
			target: TARGET_BRIER,
			achieved: samples.length > 0 && result.calibratedBrier <= TARGET_BRIER,
			improvement: result.rawBrier > 0 ? 1 - result.calibratedBrier / result.rawBrier : 0,
		},
		reliability: result.model.bins.map((bin) => {
			const members = samples.filter(
				(sample) => probabilityFromScore(sample.score) >= bin.lower &&
					probabilityFromScore(sample.score) < (bin.upper === 1 ? 1.000001 : bin.upper),
			);
			return {
				lower: bin.lower,
				upper: bin.upper,
				count: bin.count,
				positives: bin.positives,
				meanRawProbability: members.length === 0 ? 0 :
					members.reduce((sum, sample) => sum + probabilityFromScore(sample.score), 0) / members.length,
				observedRate: bin.count === 0 ? 0 : bin.positives / bin.count,
				calibratedProbability: bin.probability,
			};
		}),
		limitations: [
			"100 human labels: the confidence interval is wide; this is a measurement, not a population estimate.",
			"The label is cyber relevance, not incident truth: corpus-derived incident labels are excluded because they feed the score.",
			"Reliability bins with few samples are smoothed towards the base rate.",
		],
	};
}

async function main(): Promise<void> {
	const raw = JSON.parse(readFileSync(LABEL_PATH, "utf8")) as { items: LabelItem[] };
	const ids = raw.items.map((item) => Number(item.id));
	const result = await query<ScoreRow>(
		"SELECT event_id, score FROM event_confidence WHERE event_id = ANY($1::bigint[])",
		[ids],
	);
	const report = buildReport(raw.items, result.rows);
	const jsonPath = process.argv.find((arg) => arg.startsWith("--json="))?.slice(7) ?? null;
	const fmt = (value: number): string => value.toFixed(4);
	console.log(`Brier measurement — ${report.dataset.matched}/${report.dataset.labeled} labeled events ` +
		`(${report.dataset.positives} cyber, ${report.dataset.negatives} off-topic)`);
	console.log(`Raw: ${fmt(report.results.rawBrier)} | calibrated (${FOLDS}-fold): ${fmt(report.results.calibratedBrier)}` +
		` | base rate: ${fmt(report.results.baselineBrier)} | target: <= ${fmt(report.results.target)}`);
	console.log(`Improvement: ${(report.results.improvement * 100).toFixed(1)}% | achieved: ${report.results.achieved ? "yes" : "no"}`);
	if (jsonPath) {
		writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
		console.log(`report written: ${jsonPath}`);
	}
	if (!report.results.achieved) process.exitCode = 1;
}

const isMain = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
	try {
		await main();
	} catch (error: unknown) {
		console.error(error);
		process.exitCode = 1;
	} finally {
		await closePools();
	}
}
