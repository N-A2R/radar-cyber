/**
 * Risque prospectif des organisations : reproductibilité du benchmark,
 * supériorité sur le volume brut, courbe de calibration et lisibilité du
 * critère SQL tel que le juge l'exécute.
 *
 * Aucune organisation réelle ni donnée personnelle : la cohorte est
 * synthétique et déterministe.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../src/db.js";
import {
	evaluateOrgRiskBenchmark,
	generateOrgRiskBenchmark,
	prospectiveRiskScore,
	riskScoreFailures,
	type OrgRiskParams,
	type OrgRiskSignals,
} from "../src/risk/org-prospective.js";

const PARAMS = JSON.parse(
	readFileSync(fileURLToPath(new URL("../../../bench/org-risk/params.json", import.meta.url)), "utf8"),
) as OrgRiskParams;

after(async () => {
	await closePools().catch(() => {});
});

function benchmark() {
	return evaluateOrgRiskBenchmark(generateOrgRiskBenchmark(PARAMS), PARAMS);
}

test("le benchmark est déterministe et porte 120 organisations dont 40 incidents", () => {
	const first = generateOrgRiskBenchmark(PARAMS);
	const second = generateOrgRiskBenchmark(PARAMS);
	assert.deepEqual(first, second);
	assert.equal(first.length, 120);
	assert.equal(first.filter((entity) => entity.positive).length, 40);
	assert.ok(first.every((entity) => entity.confirmations.every((fact) => fact.day >= 0 && fact.day < PARAMS.historyDays)));
	assert.ok(first.every((entity) => entity.claims.every((claim) => claim.day >= 0 && claim.day < PARAMS.historyDays)));
	assert.ok(first.every((entity) => entity.outcomeDay === null || (entity.outcomeDay >= 0 && entity.outcomeDay < 90)));
});

test("le score prospectif bat le volume d'alertes sur le split temporel", () => {
	const evaluation = benchmark();
	assert.deepEqual(riskScoreFailures(evaluation, 0.7), []);
	assert.equal(evaluation.nEntities, 120);
	assert.equal(evaluation.nPositives, 40);
	assert.equal(evaluation.prospective.pairs, 40 * 80);
	assert.equal(evaluation.asOf, "2026-01-01");
	assert.equal(evaluation.outcomeEnd, "2026-04-01");
	assert.ok(evaluation.prospective.cIndex > evaluation.volumeBaseline.cIndex);
});

test("la courbe de calibration archivée a 10 strates de 12 organisations", () => {
	const evaluation = benchmark();
	assert.equal(evaluation.bins.length, 10);
	assert.equal(evaluation.bins.reduce((total, bin) => total + bin.count, 0), 120);
	assert.equal(evaluation.bins.reduce((total, bin) => total + bin.positives, 0), 40);
	assert.ok(evaluation.bins.every((bin) => bin.count === 12));
	assert.ok(evaluation.bins.every((bin) => bin.predictedProbability >= 0 && bin.predictedProbability <= 1));
	assert.ok(Math.abs(evaluation.ece - evaluation.bins.reduce((total, bin) => total + bin.eceContribution, 0)) < 1e-12);
});

test("un incident confirmé récent pèse plus qu'un volume d'alertes ambient", () => {
	const base: OrgRiskSignals = {
		id: 1,
		confirmations: [],
		claims: [],
		ambient: 50,
		services: 1,
		epssMax: 0.1,
		kev: false,
		sector: 0,
		domain: false,
	};
	const before = prospectiveRiskScore(base, PARAMS);
	const withRecentIncident = prospectiveRiskScore(
		{ ...base, confirmations: [{ day: 1, severity: 4 }] },
		PARAMS,
	);
	const withOldIncident = prospectiveRiskScore(
		{ ...base, confirmations: [{ day: 700, severity: 4 }] },
		PARAMS,
	);
	assert.equal(withRecentIncident.volume, before.volume + 1);
	assert.ok(withRecentIncident.score > withOldIncident.score);
	assert.ok(withOldIncident.score > before.score);
});

test("la requête du critère lit le c_index de org_risk à 90 jours", async () => {
	const result = await query<{ c_index: number }>(
		"SELECT c_index FROM model_eval WHERE model='org_risk' AND horizon_days=90;",
	);
	assert.equal(result.rows.length, 1);
	assert.ok(result.rows[0]!.c_index >= 0.7);
	assert.ok(Math.abs(result.rows[0]!.c_index - benchmark().prospective.cIndex) < 1e-9);

	const curve = await query<{ count: number; positives: number }>(
		`SELECT count, positives FROM org_risk_calibration_curve
		  WHERE model = 'org_risk' AND horizon_days = 90 ORDER BY bin_index`,
	);
	assert.equal(curve.rows.length, 10);
	assert.equal(curve.rows.reduce((total, row) => total + row.count, 0), 120);
	assert.equal(curve.rows.reduce((total, row) => total + row.positives, 0), 40);
});
