#!/usr/bin/env -S npx tsx
/**
 * Vérifie la mesure des changements de régime contre la fixture rejouée.
 *
 * Le script rejoue `bench/changepoints/serie-460j.json`, compare chaque ligne
 * à `changepoint_eval` / `changepoint_metric`, puis exécute la requête exacte
 * du critère. Sortie brute, code de sortie non nul au premier écart.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-changements-regime.mts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { CHANGEPOINT_MAX_DELAY_DAYS, runChangepointBacktest, type ChangepointFixture } from "../apps/api/src/analyse/changepoint-backtest.js";

const FIXTURE_PATH = fileURLToPath(new URL("../bench/changepoints/serie-460j.json", import.meta.url));
const MODEL = "weekly-z@1";
const SOURCE = "benchmark-changepoints-460j";

type EvalRow = {
	family: string;
	annotated_day: Date | string;
	direction: "up" | "down";
	detected: boolean;
	detected_on: Date | string | null;
	delay_days: number | null;
	score: number | null;
};

type MetricRow = {
	annotated: number;
	detected_within_7: number;
	detection_rate: number;
	false_positives: number;
	false_positives_per_year: number;
	late_detections: number;
	median_delay_days: number | null;
	average_delay_days: number | null;
};

function isoDay(value: Date | string | null): string | null {
	if (value === null) return null;
	if (value instanceof Date) {
		const year = value.getFullYear();
		const month = String(value.getMonth() + 1).padStart(2, "0");
		const day = String(value.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}
	return String(value).slice(0, 10);
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
	if (actual !== expected) {
		throw new Error(`${label} : attendu ${String(expected)}, trouvé ${String(actual)}`);
	}
}

function assertClose(label: string, actual: number, expected: number | null, tolerance = 1e-6): void {
	if (expected === null || Math.abs(actual - expected) > tolerance) {
		throw new Error(`${label} : attendu ${String(expected)}, trouvé ${String(actual)}`);
	}
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ChangepointFixture;
const replay = runChangepointBacktest(fixture);

try {
	const evalRows = await query<EvalRow>(
		`SELECT family, annotated_day, direction, detected, detected_on, delay_days, score
		   FROM changepoint_eval
		  WHERE model = $1 AND source = $2
		  ORDER BY annotated_day, family`,
		[MODEL, SOURCE],
	);
	assertEqual("nombre de lignes changepoint_eval", evalRows.rows.length, replay.rows.length);

	for (const expected of replay.rows) {
		const stored = evalRows.rows.find(
			(row) => row.family === expected.family && isoDay(row.annotated_day) === expected.annotatedDay,
		);
		if (!stored) throw new Error(`ligne absente : ${expected.family} ${expected.annotatedDay}`);
		assertEqual(`${expected.family} ${expected.annotatedDay} detected`, stored.detected, expected.detected);
		assertEqual(`${expected.family} ${expected.annotatedDay} detected_on`, isoDay(stored.detected_on), expected.detectedOn);
		assertEqual(`${expected.family} ${expected.annotatedDay} delay`, stored.delay_days, expected.delayDays);
		if (expected.score !== null) {
			assertEqual(`${expected.family} ${expected.annotatedDay} score`, Number(stored.score), expected.score);
		}
	}

	const metricRows = await query<MetricRow>(
		`SELECT annotated, detected_within_7, detection_rate, false_positives,
		        false_positives_per_year, late_detections, median_delay_days, average_delay_days
		   FROM changepoint_metric
		  WHERE model = $1`,
		[MODEL],
	);
	const metric = metricRows.rows[0];
	if (!metric) throw new Error("changepoint_metric absente");
	assertEqual("annotated", Number(metric.annotated), replay.metrics.annotated);
	assertEqual("detected_within_7", Number(metric.detected_within_7), replay.metrics.detectedWithin7);
	assertClose("detection_rate", Number(metric.detection_rate), replay.metrics.detectionRate, 1e-3);
	assertEqual("false_positives", Number(metric.false_positives), replay.metrics.falsePositives);
	assertClose("false_positives_per_year", Number(metric.false_positives_per_year), replay.metrics.falsePositivesPerYear, 1e-3);
	assertEqual("late_detections", Number(metric.late_detections), replay.metrics.lateDetections);
	assertClose("median_delay_days", Number(metric.median_delay_days), replay.metrics.medianDelayDays);
	assertClose("average_delay_days", Number(metric.average_delay_days), replay.metrics.averageDelayDays, 1e-3);

	const criterion = await query<{ rate: number | null; detected: string; total: string }>(
		`SELECT count(*) FILTER (WHERE detected AND delay_days <= $2)::float / count(*) AS rate,
		        count(*) FILTER (WHERE detected AND delay_days <= $2)::text AS detected,
		        count(*)::text AS total
		   FROM changepoint_eval
		  WHERE model = $1`,
		[MODEL, CHANGEPOINT_MAX_DELAY_DAYS],
	);
	const row = criterion.rows[0];
	const rate = Number(row?.rate ?? 0);
	if (!(rate >= 0.8)) throw new Error(`critère manqué : ${rate} < 0,80`);
	if (!(replay.metrics.falsePositivesPerYear <= 2)) {
		throw new Error(`faux positifs par an : ${replay.metrics.falsePositivesPerYear} > 2`);
	}

	console.log(`modèle                    : ${MODEL}`);
	console.log(`annotations               : ${replay.metrics.annotated}`);
	console.log(`détections ≤ 7 jours      : ${row?.detected} / ${row?.total}`);
	console.log(`critère SQL               : ${rate}`);
	console.log(`faux positifs             : ${replay.metrics.falsePositives} (${replay.metrics.falsePositivesPerYear.toFixed(2)}/an)`);
	console.log(`détections tardives       : ${replay.metrics.lateDetections}`);
	console.log(`délai médian / moyen      : ${replay.metrics.medianDelayDays} / ${replay.metrics.averageDelayDays} jours`);
	console.log("rejeu fixture             : identique à la base");
} finally {
	await closePools();
}
