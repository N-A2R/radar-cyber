/**
 * Probability calibration for the 0-100 confidence score.
 *
 * A Brier score compares a probability with a binary outcome:
 *   Brier = mean((p - y)^2), with p in [0,1] and y in {0,1}.
 * Lower is better; 0 is perfect and 0.25 is the constant-0.5 baseline.
 *
 * This module is pure: no database, no clock, no filesystem. Callers supply
 * labels and a deterministic fold assignment, so every measurement is
 * reproducible. Labels must be independent of the four score components,
 * otherwise the Brier score measures circularity instead of calibration.
 */

export type CalibrationSample = {
	/** Confidence score on the existing 0-100 scale. */
	score: number;
	/** Ground-truth outcome, independently established. */
	label: 0 | 1;
};

export type ProbabilitySample = {
	/** Calibrated probability in [0,1]. */
	probability: number;
	label: 0 | 1;
};

export type ReliabilityBin = {
	index: number;
	lower: number;
	upper: number;
	count: number;
	positives: number;
	/** Smoothed observed frequency: the calibrated probability of this bin. */
	probability: number;
};

export type ReliabilityModel = {
	binCount: number;
	priorWeight: number;
	/** Global positive rate, used as the prior and for unseen bins. */
	fallback: number;
	bins: ReliabilityBin[];
};

export type CalibrationResult = {
	rawBrier: number;
	calibratedBrier: number;
	/** Brier of the constant base-rate predictor: the no-skill reference. */
	baselineBrier: number;
	folds: number;
	/** Out-of-fold calibrated predictions, in input order. */
	predictions: ProbabilitySample[];
	/** Model trained on all samples, for inspection only. */
	model: ReliabilityModel;
};

function clamp(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/** Converts the public score to a probability without changing its ordering. */
export function probabilityFromScore(score: number): number {
	return clamp(score / 100);
}

export function brierFromProbabilities(samples: readonly ProbabilitySample[]): number {
	if (samples.length === 0) return 0;
	let total = 0;
	for (const sample of samples) {
		const error = clamp(sample.probability) - sample.label;
		total += error * error;
	}
	return total / samples.length;
}

/** Brier score of the raw confidence score, before calibration. */
export function brierScore(samples: readonly CalibrationSample[]): number {
	return brierFromProbabilities(
		samples.map((sample) => ({ probability: probabilityFromScore(sample.score), label: sample.label })),
	);
}

export function binIndex(probability: number, binCount: number): number {
	return Math.min(binCount - 1, Math.floor(clamp(probability) * binCount));
}

/**
 * Equal-width reliability bins with a symmetric prior (Laplace smoothing).
 * Empty bins inherit the global base rate instead of an arbitrary extreme.
 */
export function fitReliability(
	samples: readonly CalibrationSample[],
	binCount = 4,
	priorWeight = 1,
): ReliabilityModel {
	if (!Number.isInteger(binCount) || binCount < 1) throw new RangeError("binCount must be a positive integer");
	if (!Number.isFinite(priorWeight) || priorWeight < 0) throw new RangeError("priorWeight must be non-negative");
	const positives = samples.filter((sample) => sample.label === 1).length;
	const fallback = samples.length === 0 ? 0.5 : positives / samples.length;
	const bins: ReliabilityBin[] = [];
	for (let index = 0; index < binCount; index++) {
		const members = samples.filter(
			(sample) => binIndex(probabilityFromScore(sample.score), binCount) === index,
		);
		const hits = members.filter((sample) => sample.label === 1).length;
		bins.push({
			index: index,
			lower: index / binCount,
			upper: (index + 1) / binCount,
			count: members.length,
			positives: hits,
			probability: (hits + 2 * priorWeight * fallback) / (members.length + 2 * priorWeight),
		});
	}
	return { binCount, priorWeight, fallback, bins };
}

/** Applies a fitted model to one raw score. */
export function applyReliability(model: ReliabilityModel, score: number): number {
	return model.bins[binIndex(probabilityFromScore(score), model.binCount)]?.probability ?? model.fallback;
}

/**
 * Out-of-fold Brier score. Fold f is evaluated only with a model fitted on
 * the other folds, so no label is used to calibrate its own prediction.
 */
export function crossValidatedBrier(
	samples: readonly CalibrationSample[],
	folds = 5,
	binCount = 4,
	priorWeight = 1,
): CalibrationResult {
	if (!Number.isInteger(folds) || folds < 2) throw new RangeError("folds must be at least 2");
	const realFolds = Math.min(folds, Math.max(2, samples.length));
	const predictions: ProbabilitySample[] = new Array(samples.length);
	const baseline = samples.length === 0 ? 0.5 : samples.filter((s) => s.label === 1).length / samples.length;
	for (let fold = 0; fold < realFolds; fold++) {
		const train = samples.filter((_, index) => index % realFolds !== fold);
		const model = fitReliability(train, binCount, priorWeight);
		samples.forEach((sample, index) => {
			if (index % realFolds === fold) {
				predictions[index] = { probability: applyReliability(model, sample.score), label: sample.label };
			}
		});
	}
	return {
		rawBrier: brierScore(samples),
		calibratedBrier: brierFromProbabilities(predictions),
		baselineBrier: brierFromProbabilities(samples.map((sample) => ({ probability: baseline, label: sample.label }))),
		folds: realFolds,
		predictions,
		model: fitReliability(samples, binCount, priorWeight),
	};
}
