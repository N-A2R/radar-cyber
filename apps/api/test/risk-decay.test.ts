/**
 * Décroissance du risque : poids d'un fait selon son âge, concordance,
 * benchmark déterministe et lignes persistées du critère.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { closePools, query } from "../src/db.js";
import {
	ageInDays,
	concordanceIndex,
	decayWeight,
	scoreDecay,
	scoreStatic,
} from "../src/risk/decay.js";
import {
	evaluateDecayBenchmark,
	generateDecayBenchmark,
	type DecayBenchmarkParams,
} from "../src/risk/decay-benchmark.js";

const PARAMS = JSON.parse(
	readFileSync(new URL("../../../bench/risk-decay/params.json", import.meta.url), "utf8"),
) as DecayBenchmarkParams;
const BENCHMARK = generateDecayBenchmark(PARAMS);
const EVALUATION = evaluateDecayBenchmark(BENCHMARK);

test("le poids d'un fait vaut 1 à l'âge zéro et 0,5 à une demi-vie", () => {
	assert.equal(decayWeight(0, 14), 1);
	assert.equal(decayWeight(14, 14), 0.5);
	assert.equal(decayWeight(28, 14), 0.25);
	assert.ok(decayWeight(13, 14) > decayWeight(15, 14), "le poids doit décroître avec l'âge");
	assert.throws(() => decayWeight(0, 0), RangeError);
	assert.throws(() => decayWeight(-1, 14), RangeError);
});

test("le modèle statique ignore l'âge, le modèle à décroissance le pénalise", () => {
	const faits = [
		{ day: "2026-01-01", weight: 1 },
		{ day: "2026-03-01", weight: 1 },
	];
	assert.equal(scoreStatic(faits, "2026-04-01"), 2);
	const recent = scoreDecay(faits, "2026-04-01", 14);
	const olderOnly = scoreDecay([faits[0]!], "2026-04-01", 14);
	const newerOnly = scoreDecay([faits[1]!], "2026-04-01", 14);
	assert.ok(Math.abs(recent - (olderOnly + newerOnly)) < 1e-12);
	assert.ok(newerOnly > olderOnly, "le fait récent doit peser plus que l'ancien");
});

test("un fait postérieur au point d'observation est refusé (pas de fuite temporelle)", () => {
	assert.throws(() => scoreStatic([{ day: "2026-04-02", weight: 1 }], "2026-04-01"), RangeError);
	assert.throws(() => scoreDecay([{ day: "2026-04-02", weight: 1 }], "2026-04-01", 14), RangeError);
	assert.equal(ageInDays("2026-03-01", "2026-03-31"), 30);
});

test("la concordance vaut 1 (parfait), 0 (inversé), 0,5 (égalité ou aucune paire)", () => {
	const parfait = concordanceIndex([
		{ score: 3, positive: true },
		{ score: 2, positive: true },
		{ score: 1, positive: false },
	]);
	assert.equal(parfait.cIndex, 1);
	assert.equal(parfait.pairs, 2);

	const inverse = concordanceIndex([
		{ score: 1, positive: true },
		{ score: 3, positive: false },
	]);
	assert.equal(inverse.cIndex, 0);

	const egalite = concordanceIndex([
		{ score: 2, positive: true },
		{ score: 2, positive: false },
	]);
	assert.equal(egalite.cIndex, 0.5);
	assert.equal(egalite.tied, 1);

	const aucune = concordanceIndex([{ score: 1, positive: true }]);
	assert.equal(aucune.cIndex, 0.5);
	assert.equal(aucune.pairs, 0);
});

test("le benchmark est déterministe et garde le même tirage entre deux appels", () => {
	const again = generateDecayBenchmark(PARAMS);
	const checksum = (benchmark: typeof BENCHMARK): string =>
		benchmark.entities
			.map((entity) => `${entity.id}:${entity.positive}:${entity.facts.length}:${entity.facts[0]?.day ?? ""}:${entity.facts.at(-1)?.day ?? ""}`)
			.join("|");
	assert.equal(checksum(again), checksum(BENCHMARK));
	assert.equal(again.asOf, BENCHMARK.asOf);
	assert.equal(again.outcomeEnd, BENCHMARK.outcomeEnd);
});

test("le découpage temporel est cohérent : faits avant asOf, issue après", () => {
	assert.ok(EVALUATION.nEntities > 0);
	assert.ok(EVALUATION.nPositives > 0 && EVALUATION.nNegatives > 0, "les deux classes sont nécessaires");
	assert.ok(EVALUATION.outcomeEnd > EVALUATION.asOf);
	for (const entity of BENCHMARK.entities) {
		for (const fact of entity.facts) {
			assert.ok(fact.day < BENCHMARK.asOf, `fait ${fact.day} non antérieur à ${BENCHMARK.asOf}`);
		}
	}
});

test("la décroissance dépasse le modèle statique d'au moins 0,05 de C-index", () => {
	assert.ok(
		EVALUATION.delta >= 0.05,
		`delta ${EVALUATION.delta.toFixed(6)} < 0,05 (static ${EVALUATION.static.cIndex.toFixed(6)}, decay ${EVALUATION.decay.cIndex.toFixed(6)})`,
	);
	assert.ok(EVALUATION.decay.cIndex > EVALUATION.static.cIndex);
});

test("la mesure en base porte le critère : le SQL brut rend >= 0,05", async () => {
	const rows = await query<{ model: string; c_index: number | null; horizon_days: number | null }>(
		`SELECT model, c_index, horizon_days FROM model_eval
		  WHERE model IN ('risk_static', 'risk_decay') ORDER BY model`,
	);
	assert.equal(rows.rows.length, 2);
	const staticRow = rows.rows.find((row) => row.model === "risk_static");
	const decayRow = rows.rows.find((row) => row.model === "risk_decay");
	assert.ok(staticRow && decayRow);
	assert.equal(staticRow.horizon_days, decayRow.horizon_days);
	assert.ok(Math.abs(Number(staticRow.c_index) - EVALUATION.static.cIndex) < 1e-9);
	assert.ok(Math.abs(Number(decayRow.c_index) - EVALUATION.decay.cIndex) < 1e-9);

	const sql = await query<{ delta: number }>(
		`SELECT d.c_index - s.c_index AS delta
		   FROM model_eval d, model_eval s
		  WHERE d.model = 'risk_decay'
		    AND s.model = 'risk_static'
		    AND d.horizon_days = s.horizon_days`,
	);
	assert.equal(sql.rows.length, 1);
	assert.ok(Number(sql.rows[0]!.delta) >= 0.05, `delta SQL ${sql.rows[0]!.delta} < 0,05`);

	const metrics = await query<{ model: string; n_entities: number; n_positives: number; n_facts: number }>(
		`SELECT model, n_entities, n_positives, n_facts FROM risk_model_metric
		  WHERE model IN ('risk_static', 'risk_decay')`,
	);
	assert.equal(metrics.rows.length, 2);
	for (const metric of metrics.rows) {
		assert.equal(metric.n_entities, EVALUATION.nEntities);
		assert.equal(metric.n_positives, EVALUATION.nPositives);
		assert.equal(metric.n_facts, EVALUATION.nFacts);
	}
});

after(async () => {
	await closePools();
});
