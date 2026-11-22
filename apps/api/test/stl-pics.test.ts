/**
 * Pics de volume par famille : mathématiques STL, garde-fou de fraîcheur,
 * average precision, budget de délai, et contenu de la mesure livrée.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closePools, query } from "../src/db.js";
import { stl } from "../src/detect/stl.js";
import {
	DEFAULT_THRESHOLD,
	FRESHNESS_PENALTY,
	addDays,
	averagePrecision,
	evaluatePeaks,
	precisionRecallAuc,
	scoreFamilySeries,
	type PeakAnnotation,
	type ScoredDay,
	type SeriesPoint,
} from "../src/detect/stl-peaks.js";
import { annotationsOf, fixtureSeries, runBacktest, type StlFixture } from "../src/detect/stl-backtest.js";

const FIXTURE = JSON.parse(
	readFileSync(new URL("../../../bench/stl/serie-180j.json", import.meta.url), "utf8"),
) as StlFixture;
const JOUR_MS = 86_400_000;

test("STL retrouve une saison hebdomadaire et laisse un reste plat", () => {
	const values = Array.from({ length: 56 }, (_, i) => 10 + 0.05 * i + 3 * Math.sin((2 * Math.PI * i) / 7));
	const decomposition = stl(values, { period: 7, seasonalWindow: 13, trendWindow: 21 });
	const phaseMeans = Array.from({ length: 7 }, (_, phase) => {
		const phaseValues = decomposition.seasonal.filter((_, i) => i % 7 === phase);
		return phaseValues.reduce((sum, v) => sum + v, 0) / phaseValues.length;
	});
	assert.ok(Math.max(...phaseMeans) - Math.min(...phaseMeans) > 4, "la saison doit porter l'onde de période 7");
	const maxRemainder = Math.max(...decomposition.remainder.map(Math.abs));
	assert.ok(maxRemainder < 1.2, `reste attendu < 1,2, obtenu ${maxRemainder.toFixed(2)}`);
	assert.ok(decomposition.trend[55]! > decomposition.trend[0]!, "la tendance doit monter");
});

function serieStable(length: number, base = 5): SeriesPoint[] {
	return Array.from({ length }, (_, i) => ({
		day: addDays("2026-01-01", i),
		count: base + (i % 7 === 5 ? -2 : i % 7 === 6 ? -3 : 0),
		fresh: base,
	}));
}

test("un pic franc est noté au-dessus du seuil, une série stable non", () => {
	const stable = serieStable(60);
	const pic = stable.map((point, i) => (i === 59 ? { ...point, count: 60, fresh: 60 } : point));
	const stableScores = scoreFamilySeries("vuln", stable, { windowDays: 35 });
	const picScores = scoreFamilySeries("vuln", pic, { windowDays: 35 });
	assert.ok((stableScores.at(-1)?.score ?? 0) < 1, "une série stable ne doit pas produire de pic");
	assert.ok((picScores.at(-1)?.score ?? 0) >= DEFAULT_THRESHOLD, "le pic doit franchir le seuil");
});

test("un import historique perd son rang d'alerte sans disparaître", () => {
	const pic = serieStable(60).map((point, i) => (i === 59 ? { ...point, count: 60, fresh: 60 } : point));
	const importe = pic.map((point, i) => (i === 59 ? { ...point, fresh: 0 } : point));
	const frais = scoreFamilySeries("vuln", pic, { windowDays: 35 }).at(-1)!;
	const garde = scoreFamilySeries("vuln", importe, { windowDays: 35 }).at(-1)!;
	assert.equal(garde.guarded, true);
	assert.equal(garde.score, frais.score * FRESHNESS_PENALTY);
	assert.ok(garde.score < DEFAULT_THRESHOLD, "l'import ne doit pas passer le seuil");
});

test("une série plus courte que la fenêtre ne reçoit aucun score", () => {
	assert.deepEqual(scoreFamilySeries("vuln", serieStable(30), { windowDays: 35 }), []);
	assert.throws(() => scoreFamilySeries("vuln", serieStable(40), { windowDays: 10 }), RangeError);
});

test("average precision : classement parfait, inversé, et cas sans positif", () => {
	assert.equal(averagePrecision([true, true, false, false], [4, 3, 2, 1]), 1);
	assert.ok(Math.abs(averagePrecision([false, false, true, true], [4, 3, 2, 1]) - (1 / 3 + 2 / 4) / 2) < 1e-12);
	assert.equal(averagePrecision([false, false], [2, 1]), 0);
	assert.ok(Math.abs(precisionRecallAuc([true, true, false, false], [4, 3, 2, 1]) - 1) < 1e-12);
});

function scored(family: string, day: string, score: number): ScoredDay {
	return { family, day, count: 10, score, remainder: score, scale: 1, freshShare: 1, guarded: false };
}

test("le délai d'un pic est compté depuis le passage quotidien suivant", () => {
	const annotation: PeakAnnotation = { family: "cti", day: "2026-03-10" };
	const sameDay = evaluatePeaks(
		new Map([["cti", [scored("cti", "2026-03-10", 6)]]]),
		[annotation],
		{ threshold: 4.5, maxDelayDays: 1 },
	);
	assert.equal(sameDay.rows[0]?.tp, true);
	assert.equal(sameDay.rows[0]?.detectedOn, "2026-03-11");
	assert.equal(sameDay.rows[0]?.delayDays, 1);

	const lendemain = evaluatePeaks(
		new Map([["cti", [scored("cti", "2026-03-11", 6)]]]),
		[annotation],
		{ threshold: 4.5, maxDelayDays: 1 },
	);
	assert.equal(lendemain.rows[0]?.tp, false, "un pic vu le lendemain dépasse le budget d'un jour");
	assert.equal(lendemain.medianDelayDays, null);
	assert.equal(lendemain.falsePositives, 0, "l'alerte du lendemain ne compte pas comme faux positif");

	const jamais = evaluatePeaks(
		new Map([["cti", [scored("cti", "2026-03-12", 1)]]]),
		[annotation],
		{ threshold: 4.5, maxDelayDays: 1 },
	);
	assert.equal(jamais.detected, 0);
	assert.equal(jamais.medianDelayDays, null);
});

test("la fixture porte 180 jours, 20 pics annotés et des imports non annotés", () => {
	assert.equal(FIXTURE.days, 180);
	assert.equal(FIXTURE.peaks.length, 20);
	assert.equal(FIXTURE.batch.length, 4);
	for (const peak of FIXTURE.peaks) {
		assert.ok(peak.day >= FIXTURE.start, `${peak.family}/${peak.day} hors fenêtre`);
		assert.ok(peak.day <= addDays(FIXTURE.start, FIXTURE.days - 1), `${peak.family}/${peak.day} hors fenêtre`);
	}
	const annotated = new Set(FIXTURE.peaks.map((peak) => `${peak.family}\u0000${peak.day}`));
	for (const batch of FIXTURE.batch) {
		assert.equal(annotated.has(`${batch.family}\u0000${batch.day}`), false, "un import ne doit pas être annoté");
	}
});

test("le backtest 180 jours atteint les cibles et la mesure en base les reprend", async () => {
	const backtest = runBacktest(fixtureSeries(FIXTURE), annotationsOf(FIXTURE));
	assert.ok(backtest.prAuc >= 0.75, `PR-AUC ${backtest.prAuc} < 0,75`);
	assert.ok(backtest.evaluation.detected >= 15);
	assert.ok((backtest.evaluation.medianDelayDays ?? Infinity) <= 1);

	const annotations = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM peak_annotation WHERE model = 'stl'",
	);
	assert.equal(annotations.rows[0]?.n, 20);

	const metric = await query<{ pr_auc: number; median_delay_days: number | null }>(
		"SELECT pr_auc, median_delay_days FROM model_metric WHERE model = 'stl'",
	);
	assert.ok(Math.abs(Number(metric.rows[0]?.pr_auc) - backtest.prAuc) < 1e-6);
	assert.ok((metric.rows[0]?.median_delay_days ?? Infinity) <= 1);

	const delays = await query<{ average: number | null; detected: number }>(
		"SELECT avg(delay_days)::float8 AS average, count(*)::int AS detected FROM model_eval WHERE model = 'stl' AND tp = true",
	);
	assert.ok((delays.rows[0]?.average ?? Infinity) <= 1);
	assert.equal(delays.rows[0]?.detected, backtest.evaluation.detected);

	const froids = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM model_eval WHERE model = 'stl' AND tp = true AND (label = false OR detected_on IS NULL OR delay_days > 1)",
	);
	assert.equal(froids.rows[0]?.n, 0);
});

test("les jours du fixture restent ordonnés et contigus", () => {
	const points = fixtureSeries(FIXTURE).get("vuln")!;
	assert.equal(points.length, 180);
	for (let i = 1; i < points.length; i++) {
		assert.equal((new Date(`${points[i]!.day}T00:00:00Z`).getTime() - new Date(`${points[i - 1]!.day}T00:00:00Z`).getTime()) / JOUR_MS, 1);
	}
});

after(async () => {
	await closePools();
});
