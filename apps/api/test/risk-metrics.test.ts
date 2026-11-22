import test from "node:test";
import assert from "node:assert/strict";
import {
	type BinarySample,
	auc,
	areaUnderCurve,
	rocCurve,
} from "../src/analyse/risk-metrics.js";

test("perfect separation scores AUC 1", () => {
	const samples: BinarySample[] = [
		{ score: 10, label: 0 },
		{ score: 20, label: 0 },
		{ score: 80, label: 1 },
		{ score: 90, label: 1 },
	];
	assert.equal(auc(samples), 1);
});

test("inverted scores score AUC 0", () => {
	const samples: BinarySample[] = [
		{ score: 90, label: 0 },
		{ score: 80, label: 0 },
		{ score: 20, label: 1 },
		{ score: 10, label: 1 },
	];
	assert.equal(auc(samples), 0);
});

test("scores unrelated to the label score AUC 0.5", () => {
	const samples: BinarySample[] = [
		{ score: 10, label: 1 },
		{ score: 20, label: 0 },
		{ score: 30, label: 0 },
		{ score: 40, label: 1 },
	];
	assert.equal(auc(samples), 0.5);
});

test("identical scores score AUC 0.5 instead of favouring either class", () => {
	const samples: BinarySample[] = [
		{ score: 50, label: 1 },
		{ score: 50, label: 0 },
		{ score: 50, label: 1 },
	];
	assert.equal(auc(samples), 0.5);
});

test("tied scores receive half credit against the opposing class", () => {
	const samples: BinarySample[] = [
		{ score: 1, label: 1 },
		{ score: 0.5, label: 1 },
		{ score: 0.5, label: 0 },
		{ score: 0, label: 0 },
	];
	assert.equal(auc(samples), 0.875);
});

test("ROC curve starts at (0,0), ends at (1,1) and never decreases", () => {
	const samples: BinarySample[] = [
		{ score: 90, label: 1 },
		{ score: 70, label: 0 },
		{ score: 50, label: 1 },
		{ score: 10, label: 0 },
	];
	const points = rocCurve(samples);
	assert.deepEqual(
		[points[0]!.falsePositiveRate, points[0]!.truePositiveRate],
		[0, 0],
	);
	assert.deepEqual(
		[points.at(-1)!.falsePositiveRate, points.at(-1)!.truePositiveRate],
		[1, 1],
	);
	for (let index = 1; index < points.length; index += 1) {
		assert.ok(points[index]!.falsePositiveRate >= points[index - 1]!.falsePositiveRate);
		assert.ok(points[index]!.truePositiveRate >= points[index - 1]!.truePositiveRate);
	}
});

test("ROC curve emits one point per distinct score", () => {
	const samples: BinarySample[] = [
		{ score: 10, label: 0 },
		{ score: 10, label: 1 },
		{ score: 20, label: 0 },
		{ score: 20, label: 1 },
	];
	const thresholds = rocCurve(samples)
		.map((point) => point.threshold)
		.filter((threshold): threshold is number => threshold !== null);
	assert.deepEqual(thresholds, [20, 10]);
});

test("trapezoid area under the ROC curve equals the rank AUC", () => {
	const samples: BinarySample[] = [
		{ score: 95, label: 1 },
		{ score: 70, label: 0 },
		{ score: 70, label: 1 },
		{ score: 40, label: 0 },
		{ score: 10, label: 0 },
	];
	assert.ok(Math.abs(areaUnderCurve(rocCurve(samples)) - auc(samples)) < 1e-12);
});

test("single-class and empty samples return the 0.5 baseline without NaN", () => {
	assert.equal(auc([]), 0.5);
	assert.equal(auc([{ score: 12, label: 1 }]), 0.5);
	assert.equal(auc([{ score: 12, label: 0 }]), 0.5);
	assert.equal(areaUnderCurve(rocCurve([])), 0.5);
});
