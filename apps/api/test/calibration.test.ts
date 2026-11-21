import { test } from "node:test";
import assert from "node:assert/strict";
import {
	applyReliability,
	binIndex,
	brierScore,
	crossValidatedBrier,
	fitReliability,
	probabilityFromScore,
	type CalibrationSample,
} from "../src/analyse/calibration.js";

test("brier score is zero for perfect predictions", () => {
	assert.equal(brierScore([{ score: 100, label: 1 }, { score: 0, label: 0 }]), 0);
});

test("brier score is one for fully wrong predictions", () => {
	assert.equal(brierScore([{ score: 0, label: 1 }, { score: 100, label: 0 }]), 1);
});

test("brier score of an uninformative 50 percent score is 0.25", () => {
	assert.equal(brierScore([{ score: 50, label: 1 }, { score: 50, label: 0 }]), 0.25);
});

test("score is converted to probability and clamped to the unit interval", () => {
	assert.equal(probabilityFromScore(46), 0.46);
	assert.equal(probabilityFromScore(-5), 0);
	assert.equal(probabilityFromScore(140), 1);
	assert.equal(probabilityFromScore(Number.NaN), 0);
});

test("equal-width bins assign boundary scores deterministically", () => {
	assert.equal(binIndex(0.24, 4), 0);
	assert.equal(binIndex(0.25, 4), 1);
	assert.equal(binIndex(1, 4), 3);
});

test("unseen reliability bins inherit the global base rate", () => {
	const model = fitReliability([{ score: 90, label: 1 }, { score: 95, label: 0 }, { score: 80, label: 1 }]);
	assert.equal(model.fallback, 2 / 3);
	assert.equal(model.bins[0]?.count, 0);
	assert.equal(model.bins[0]?.probability, 2 / 3);
	assert.equal(model.bins[3]?.probability, 2 / 3);
});

test("fitted reliability is applied to the score's own bin", () => {
	const model = fitReliability(
		[{ score: 90, label: 1 }, { score: 95, label: 0 }, { score: 10, label: 0 }],
		4,
		0,
	);
	assert.equal(applyReliability(model, 91), 0.5);
	assert.equal(applyReliability(model, 12), 0);
});

test("cross-validation never trains on the fold it evaluates", () => {
	const samples: CalibrationSample[] = Array.from({ length: 10 }, (_, index) => ({
		score: 90,
		label: index % 2 === 0 ? 1 : 0,
	}));
	const result = crossValidatedBrier(samples, 2, 4, 0);
	assert.equal(result.predictions[0]?.probability, 0);
	assert.equal(result.predictions[1]?.probability, 1);
	assert.equal(result.calibratedBrier, 1);
});

test("calibration lowers the Brier score of overconfident predictions", () => {
	const samples: CalibrationSample[] = Array.from({ length: 50 }, (_, index) => ({
		score: 90,
		label: index < 5 ? 1 : 0,
	}));
	const result = crossValidatedBrier(samples, 5);
	assert.ok(result.calibratedBrier < result.rawBrier / 2);
	assert.ok(Math.abs(result.baselineBrier - 0.09) < 1e-9);
});

test("an empty dataset returns finite zero errors", () => {
	const result = crossValidatedBrier([]);
	assert.equal(result.rawBrier, 0);
	assert.equal(result.calibratedBrier, 0);
	assert.equal(result.baselineBrier, 0);
	assert.equal(result.predictions.length, 0);
});
