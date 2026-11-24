import { test } from "node:test";
import assert from "node:assert/strict";
import { auc, type BinarySample } from "../src/analyse/risk-metrics.js";
import {
	type RiskPopulation,
	type RiskSample,
	type RiskSignals,
	crossValidatedRiskScores,
	fitRiskModel,
	riskFeatures,
	riskProbability,
	riskScore,
	scoreRiskSample,
	sigmoid,
} from "../src/analyse/organisation-risk.js";

const SIGNALS: RiskSignals = {
	ambientEvents: 2,
	ambientSources: 2,
	maxSeverity: 3,
	lastObservedDaysAgo: 30,
	hasPublicDomain: 1,
	isServices: 1,
	isCommerce: 0,
	isConstruction: 0,
	isSante: 0,
	isIndustrie: 0,
};

const POPULATION: RiskPopulation = { totalOrganisations: 1_670_000, incidentOrganisations: 23 };

function samples(): RiskSample[] {
	return [
		{ id: 1, signals: { ...SIGNALS, ambientEvents: 4, maxSeverity: 4 }, label: 1 },
		{ id: 2, signals: { ...SIGNALS, ambientEvents: 6, maxSeverity: 3 }, label: 1 },
		{ id: 3, signals: { ...SIGNALS, ambientEvents: 0, maxSeverity: 2, hasPublicDomain: 0 }, label: 0 },
		{ id: 4, signals: { ...SIGNALS, ambientEvents: 1, maxSeverity: 2, hasPublicDomain: 0 }, label: 0 },
		{ id: 5, signals: { ...SIGNALS, ambientSources: 3, maxSeverity: 4 }, label: 1 },
		{ id: 6, signals: { ...SIGNALS, lastObservedDaysAgo: 300, maxSeverity: 2, hasPublicDomain: 0 }, label: 0 },
		{ id: 7, signals: { ...SIGNALS, ambientEvents: 3, maxSeverity: 4 }, label: 1 },
		{ id: 8, signals: { ...SIGNALS, ambientEvents: 2, ambientSources: 1, hasPublicDomain: 0 }, label: 0 },
		{ id: 9, signals: { ...SIGNALS, ambientSources: 4, maxSeverity: 4 }, label: 1 },
		{ id: 10, signals: { ...SIGNALS, hasPublicDomain: 0, maxSeverity: 3 }, label: 0 },
	];
}

const SILENT: RiskSignals = {
	ambientEvents: 0,
	ambientSources: 0,
	maxSeverity: 0,
	lastObservedDaysAgo: null,
	hasPublicDomain: 0,
	isServices: 0,
	isCommerce: 0,
	isConstruction: 0,
	isSante: 0,
	isIndustrie: 0,
};

test("features are a fixed ten-number vector", () => {
	const features = riskFeatures(SIGNALS);
	assert.equal(features.length, 10);
	assert.ok(features.every((value) => typeof value === "number" && Number.isFinite(value)));
});

test("sector flags are emitted as five binary features", () => {
	assert.deepEqual(riskFeatures(SIGNALS).slice(5), [1, 0, 0, 0, 0]);
	assert.deepEqual(riskFeatures(SILENT).slice(5), [0, 0, 0, 0, 0]);
});

test("more ambient events increase the exposure feature", () => {
	assert.ok(riskFeatures({ ...SIGNALS, ambientEvents: 7 })[0]! > riskFeatures(SIGNALS)[0]!);
});

test("higher severity increases the severity feature", () => {
	assert.ok(riskFeatures({ ...SIGNALS, maxSeverity: 5 })[1]! > riskFeatures(SIGNALS)[1]!);
});

test("more independent sources increase the corroboration feature", () => {
	assert.ok(riskFeatures({ ...SIGNALS, ambientSources: 5 })[2]! > riskFeatures(SIGNALS)[2]!);
});

test("older observations decrease the recency feature", () => {
	assert.ok(riskFeatures({ ...SIGNALS, lastObservedDaysAgo: 400 })[3]! < riskFeatures(SIGNALS)[3]!);
});

test("a missing observation gives a zero recency feature", () => {
	assert.equal(riskFeatures(SILENT)[3], 0);
});

test("a public domain is a binary feature", () => {
	assert.equal(riskFeatures({ ...SIGNALS, hasPublicDomain: 0 })[4], 0);
	assert.equal(riskFeatures({ ...SIGNALS, hasPublicDomain: 1 })[4], 1);
});

test("sigmoid maps any finite input strictly inside zero and one", () => {
	assert.equal(sigmoid(0), 0.5);
	assert.ok(sigmoid(-30) > 0 && sigmoid(-30) < 1e-12);
	assert.ok(sigmoid(30) < 1 && sigmoid(30) > 1 - 1e-12);
});

test("fitting the same observations twice yields the same model and scores", () => {
	const modelA = fitRiskModel(samples(), POPULATION);
	const modelB = fitRiskModel(samples(), POPULATION);
	assert.deepEqual(modelA, modelB);
	assert.equal(riskScore(SIGNALS, modelA), riskScore(SIGNALS, modelB));
});

test("every score is an integer between zero and one hundred", () => {
	const model = fitRiskModel(samples(), POPULATION);
	for (const sample of samples()) {
		const score = riskScore(sample.signals, model);
		assert.equal(score, Math.round(score));
		assert.ok(score >= 0 && score <= 100);
	}
});

test("an organisation with no recorded signal sits at the population baseline", () => {
	const model = fitRiskModel(samples(), POPULATION);
	const baseRate = POPULATION.incidentOrganisations / POPULATION.totalOrganisations;
	assert.equal(riskScore(SILENT, model), 0);
	assert.ok(riskProbability(SILENT, model) > 0);
	assert.ok(riskProbability(SILENT, model) < baseRate * 2);
});

test("a higher observed incidence raises the calibrated probability", () => {
	const sample = samples()[0]!;
	const rare = fitRiskModel(samples(), { ...POPULATION, incidentOrganisations: 10 });
	const common = fitRiskModel(samples(), { ...POPULATION, incidentOrganisations: 200 });
	assert.ok(riskProbability(sample.signals, common) > riskProbability(sample.signals, rare));
});

test("observed ambient evidence raises the score above a silent organisation", () => {
	const model = fitRiskModel(samples(), POPULATION);
	assert.ok(riskScore(SIGNALS, model) > riskScore(SILENT, model));
});

test("a public domain raises the score for otherwise identical signals", () => {
	const model = fitRiskModel(samples(), POPULATION);
	assert.ok(
		riskScore({ ...SIGNALS, hasPublicDomain: 1 }, model) >
			riskScore({ ...SIGNALS, hasPublicDomain: 0 }, model),
	);
});

test("the most exposed observed profile scores one hundred", () => {
	const source = samples();
	const model = fitRiskModel(source, POPULATION);
	const top = Math.max(...source.map((sample) => scoreRiskSample(sample, model).excess));
	assert.equal(Math.round(100 * Math.min(1, top / model.referenceExcess)), 100);
});

test("extreme evidence never exceeds the one hundred cap", () => {
	const model = fitRiskModel(samples(), POPULATION);
	const extreme: RiskSignals = {
		...SIGNALS,
		ambientEvents: 1_000_000,
		ambientSources: 1_000_000,
		maxSeverity: 100,
		lastObservedDaysAgo: 0,
		hasPublicDomain: 1,
	};
	assert.equal(riskScore(extreme, model), 100);
});

test("cross-validation scores every sample exactly once, out of fold", () => {
	const source = samples();
	const scores = crossValidatedRiskScores(source, POPULATION);
	assert.deepEqual(
		scores.map((score) => score.id).sort((a, b) => a - b),
		source.map((sample) => sample.id),
	);
	assert.deepEqual(scores, crossValidatedRiskScores(source, POPULATION));
	const binary: BinarySample[] = scores.map((score) => ({ score: score.score, label: score.label }));
	assert.ok(auc(binary) >= 0 && auc(binary) <= 1);
});

test("cross-validation calibrates every fold against the full population", () => {
	const source = samples();
	const fold = crossValidatedRiskScores(source, POPULATION, 5).find((score) => score.id === 1)!;
	const ordered = [...source].sort((a, b) => a.id - b.id);
	const train = ordered.filter((_, index) => index % 5 !== 0);
	const expected = scoreRiskSample(source[0]!, fitRiskModel(train, POPULATION));
	assert.deepEqual(fold, expected);
});

test("malformed folds are rejected before any fitting", () => {
	assert.throws(() => crossValidatedRiskScores(samples(), POPULATION, 1), /at least two folds/);
});

test("a population that omits observed organisations is rejected", () => {
	assert.throws(
		() => fitRiskModel(samples(), { ...POPULATION, totalOrganisations: 3 }),
		/population must include every observed organisation/,
	);
});

test("a negative incident count is rejected", () => {
	assert.throws(
		() => fitRiskModel(samples(), { ...POPULATION, incidentOrganisations: -1 }),
		/negative incident count/,
	);
});
