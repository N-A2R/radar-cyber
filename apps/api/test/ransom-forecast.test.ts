/**
 * Prévision rançongiciel à 30 jours : critère SQL, non-fuite temporelle et
 * déterminisme de la forêt utilisée pour la mesure.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	buildSamples,
	CLAIM_THRESHOLD,
	evaluateRansomForecast,
	FEATURE_NAMES,
	FOREST_SEEDS,
	HORIZON_DAYS,
	poissonScore,
	trainForestEnsemble,
	type WeeklyClaimRow,
} from "../src/forecast/ransom-forecast.js";

function fixture(weeks: number): WeeklyClaimRow[] {
	return Array.from({ length: weeks }, (_, index) => ({
		week: new Date(Date.UTC(2024, 0, 1 + index * 7)).toISOString().slice(0, 10),
		naClaims: index % 7 === 0 ? 2 : 0,
		allClaims: 100 + index,
		leakEvents: 0,
		ransomwareEvents: 0,
		breaches: index % 5,
		groupClaims4: index,
		groupClaims12: index * 2,
		groupClaims26: index * 3,
		activeGroups12: index % 9,
		newGroups26: index % 4,
		forwardClaims30: index % 7 < 2 ? 1 : 0,
	}));
}

test("la mesure en base porte le critère : PR-AUC >= 0,70 et gain >= 0,10", async () => {
	const rows = await query<{
		pr_auc: number;
		horizon_days: number;
		pr_auc_baseline: number;
		pr_auc_gain: number;
	}>(
		`SELECT pr_auc, horizon_days, pr_auc_baseline, pr_auc_gain
		   FROM model_eval
		  WHERE model = 'ransom_forecast' AND horizon_days = ${HORIZON_DAYS}`,
	);
	assert.equal(rows.rows.length, 1);
	const row = rows.rows[0]!;
	assert.ok(row.pr_auc >= 0.7, `PR-AUC ${row.pr_auc} < 0,70`);
	assert.ok(row.pr_auc_gain >= 0.1, `gain ${row.pr_auc_gain} < 0,10`);
	assert.ok(Math.abs(row.pr_auc_gain - (row.pr_auc - row.pr_auc_baseline)) < 1e-9);
});

test("la table détaillée et la colonne pr_auc existent après migration", async () => {
	const column = await query<{ column_name: string }>(
		`SELECT column_name FROM information_schema.columns
		  WHERE table_schema = 'public' AND table_name = 'model_eval' AND column_name = 'pr_auc'`,
	);
	assert.equal(column.rows.length, 1);
	const table = await query<{ column_name: string }>(
		`SELECT column_name FROM information_schema.columns
		  WHERE table_schema = 'public' AND table_name = 'ransom_forecast_eval'`,
	);
	assert.ok(table.rows.some((row) => row.column_name === "poisson_lambda"));
	assert.ok(table.rows.some((row) => row.column_name === "split"));
});

test("une semaine future ne change ni les caractéristiques ni l'étiquette passées", () => {
	const rows = fixture(60);
	const avant = buildSamples(rows);
	assert.equal(avant[0]?.features.length, FEATURE_NAMES.length);
	assert.equal(avant[1]?.label, rows[1]?.forwardClaims30 >= CLAIM_THRESHOLD);
	const modifiees = fixture(60).map((row, index) =>
		index === 55 ? { ...row, naClaims: 99, forwardClaims30: 99 } : row,
	);
	const apres = buildSamples(modifiees);
	assert.deepEqual(apres[40], avant[40]);
	assert.notDeepEqual(apres[55], avant[55]);
});

test("le score Poisson est croissant et la forêt rejoue le même tirage", () => {
	assert.ok(poissonScore(0) === 0);
	assert.ok(poissonScore(2) > poissonScore(1));
	const rows = fixture(70);
	const samples = buildSamples(rows);
	const params = { trees: 20, mtry: 3, maxDepth: 3, minLeaf: 2, seed: 4 };
	const first = trainForestEnsemble(samples, params, FOREST_SEEDS);
	const second = trainForestEnsemble(samples, params, FOREST_SEEDS);
	const feature = samples[30]!.features;
	assert.equal(first(feature), second(feature));
	assert.ok(first(feature) >= 0 && first(feature) <= 1);
});

test("le protocole temporel est stable d'une exécution à l'autre", () => {
	const rows = fixture(70);
	const params = { trees: 20, mtry: 3, maxDepth: 3, minLeaf: 2, seed: 4 };
	const first = evaluateRansomForecast(rows, params, "2024-02-01", [0, 1]);
	const second = evaluateRansomForecast(rows, params, "2024-02-01", [0, 1]);
	assert.equal(first.prAuc, second.prAuc);
	assert.equal(first.baselinePrAuc, second.baselinePrAuc);
	assert.ok(first.trainCount > 0 && first.testCount > 0);
});

after(async () => {
	await closePools();
});
