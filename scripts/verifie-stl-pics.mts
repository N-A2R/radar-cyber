#!/usr/bin/env -S npx tsx
/**
 * Vérificateur du critère « pics de volume par famille ».
 *
 * Rejoue le backtest 180 jours en mémoire depuis la fixture versionnée (même
 * code que la mesure : `runBacktest`), puis contrôle les tables persistées :
 *   - 20 pics annotés ;
 *   - `SELECT avg(delay_days) FROM model_eval WHERE model='stl' AND tp=true;` ;
 *   - la PR-AUC stockée dans `model_metric` face au recalcul.
 *
 * Les deux cibles sont PR-AUC >= 0,75 et délai médian <= 1 jour. Le code de
 * sortie est non nul si l'une manque : un échec doit être visible, jamais
 * arrondi.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-stl-pics.mts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { annotationsOf, fixtureSeries, runBacktest, type StlFixture } from "../apps/api/src/detect/stl-backtest.js";

const FIXTURE_PATH = fileURLToPath(new URL("../bench/stl/serie-180j.json", import.meta.url));

export const TARGET_PR_AUC = 0.75;
export const TARGET_MEDIAN_DELAY_DAYS = 1;
export const EXPECTED_PEAKS = 20;
export const MODEL = "stl";

type MetricRow = {
	model: string;
	window_days: number;
	pr_auc: number;
	pr_auc_trapezoid: number;
	annotated_peaks: number;
	detected_peaks: number;
	false_positives: number;
	median_delay_days: number | null;
	average_delay_days: number | null;
	source: string;
};

async function main(): Promise<void> {
	const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as StlFixture;
	const backtest = runBacktest(fixtureSeries(fixture), annotationsOf(fixture));
	const annotations = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM peak_annotation WHERE model = $1",
		[MODEL],
	);
	const delays = await query<{ average: number | null; detected: number; median: number | null }>(
		`SELECT avg(delay_days)::float8 AS average,
		        count(*)::int AS detected,
		        percentile_cont(0.5) WITHIN GROUP (ORDER BY delay_days)::float8 AS median
		   FROM model_eval
		  WHERE model = $1 AND tp = true`,
		[MODEL],
	);
	const metrics = await query<MetricRow>("SELECT * FROM model_metric WHERE model = $1", [MODEL]);
	const metric = metrics.rows[0];
	const average = delays.rows[0]?.average ?? null;
	const median = delays.rows[0]?.median ?? null;
	const { prAuc, prAucTrapezoid, evaluation } = backtest;

	console.log("=== SÉRIE DU CRITÈRE (fixture 180 jours) ===");
	console.log(
		`famille-jours notés : ${[...backtest.scoredByFamily.values()].reduce((n, days) => n + days.length, 0)} ` +
			`sur ${Object.keys(fixture.families).length} familles × ${fixture.days} jours`,
	);
	console.log("");
	console.log("=== PRÉALABLE : pics annotés ===");
	console.log("SELECT count(*) FROM peak_annotation WHERE model='stl';");
	console.log(`→ ${annotations.rows[0]?.n ?? 0} en base (attendu ${EXPECTED_PEAKS})`);
	console.log("");
	console.log("=== CRITÈRE : PR-AUC sur 180 jours ===");
	console.log(`PR-AUC (average precision) : ${prAuc.toFixed(4)} (cible >= ${TARGET_PR_AUC})`);
	console.log(`PR-AUC (trapèzes)          : ${prAucTrapezoid.toFixed(4)}`);
	console.log(
		`backtest en mémoire        : pics=${evaluation.detected}/${evaluation.annotated} ` +
			`fp=${evaluation.falsePositives} médiane=${evaluation.medianDelayDays} moyen=${evaluation.averageDelayDays}`,
	);
	if (metric) {
		console.log(
			`model_metric               : PR-AUC=${Number(metric.pr_auc).toFixed(4)} ` +
				`pics=${metric.detected_peaks}/${metric.annotated_peaks} fp=${metric.false_positives} ` +
				`médiane=${metric.median_delay_days} source=${metric.source}`,
		);
	}
	console.log("");
	console.log("=== CRITÈRE : SELECT avg(delay_days) FROM model_eval WHERE model='stl' AND tp=true; ===");
	console.log(`avg(delay_days) = ${average ?? "NULL"}  (lignes tp = ${delays.rows[0]?.detected ?? 0})`);
	console.log(`médiane(delay_days) = ${median ?? "NULL"}  (cible <= ${TARGET_MEDIAN_DELAY_DAYS})`);
	console.log("");

	const problems: string[] = [];
	if ((annotations.rows[0]?.n ?? 0) !== EXPECTED_PEAKS) {
		problems.push(`${annotations.rows[0]?.n ?? 0} pics annotés en base au lieu de ${EXPECTED_PEAKS}`);
	}
	if (!(prAuc >= TARGET_PR_AUC)) problems.push(`PR-AUC ${prAuc.toFixed(4)} < ${TARGET_PR_AUC}`);
	if (average === null || !(average <= TARGET_MEDIAN_DELAY_DAYS)) {
		problems.push(`avg(delay_days) ${average ?? "NULL"} > ${TARGET_MEDIAN_DELAY_DAYS}`);
	}
	if (median !== null && median > TARGET_MEDIAN_DELAY_DAYS) {
		problems.push(`médiane des délais ${median} > ${TARGET_MEDIAN_DELAY_DAYS}`);
	}
	if (metric && Math.abs(Number(metric.pr_auc) - prAuc) > 1e-6) {
		problems.push(`model_metric (${metric.pr_auc}) diverge du backtest rejoué (${prAuc})`);
	}

	if (problems.length > 0) {
		console.error("OBJECTIF NON ATTEINT :");
		for (const problem of problems) console.error(`  - ${problem}`);
		process.exitCode = 1;
		return;
	}
	console.log(
		`OBJECTIF ATTEINT : PR-AUC ${prAuc.toFixed(4)} >= ${TARGET_PR_AUC}, ` +
			`avg(delay_days) ${average} <= ${TARGET_MEDIAN_DELAY_DAYS}.`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
