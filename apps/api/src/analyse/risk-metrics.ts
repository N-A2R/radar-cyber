/**
 * ROC curve and AUC for binary outcomes.
 *
 * Pure and deterministic: no database, no clock, no filesystem. Callers supply
 * scores and independently established labels. Both raw risk indices and
 * calibrated 0-100 probabilities are accepted; ROC and AUC only use ranks.
 *
 * AUC is the Mann-Whitney U statistic normalised to [0,1], with tied scores
 * receiving the average rank. It is numerically identical to the trapezoid
 * area under the ROC curve returned by `rocCurve`, which is asserted in tests.
 */

export type BinarySample = {
	/** Higher means higher predicted risk. */
	score: number;
	/** Ground-truth outcome, independently established. */
	label: 0 | 1;
};

export type RocPoint = {
	/** Score threshold; `null` for the two boundary points. */
	threshold: number | null;
	/** True positive rate at this threshold, in [0,1]. */
	truePositiveRate: number;
	/** False positive rate at this threshold, in [0,1]. */
	falsePositiveRate: number;
};

/** AUC of a labelled sample set. Degenerate sets return the 0.5 baseline. */
export function auc(samples: readonly BinarySample[]): number {
	const positives = samples.filter((sample) => sample.label === 1).length;
	const negatives = samples.length - positives;
	if (positives === 0 || negatives === 0) return 0.5;

	const sorted = [...samples].sort((a, b) => a.score - b.score);
	let positiveRankSum = 0;
	let start = 0;
	while (start < sorted.length) {
		let end = start + 1;
		while (end < sorted.length && sorted[end]!.score === sorted[start]!.score) end += 1;
		// Ranks are 1-based and contiguous; ties share their average rank.
		const averageRank = (start + 1 + end) / 2;
		for (let index = start; index < end; index += 1) {
			if (sorted[index]!.label === 1) positiveRankSum += averageRank;
		}
		start = end;
	}

	const chance = (positives * (positives + 1)) / 2;
	return (positiveRankSum - chance) / (positives * negatives);
}

/**
 * ROC curve from high to low threshold, including the (0,0) and (1,1)
 * boundary points. One point per distinct score: no interpolation.
 */
export function rocCurve(samples: readonly BinarySample[]): RocPoint[] {
	const positives = samples.filter((sample) => sample.label === 1).length;
	const negatives = samples.length - positives;
	if (positives === 0 || negatives === 0) {
		return [
			{ threshold: null, truePositiveRate: 0, falsePositiveRate: 0 },
			{ threshold: null, truePositiveRate: 1, falsePositiveRate: 1 },
		];
	}

	const sorted = [...samples].sort((a, b) => b.score - a.score);
	const points: RocPoint[] = [
		{ threshold: null, truePositiveRate: 0, falsePositiveRate: 0 },
	];
	let truePositives = 0;
	let falsePositives = 0;
	let start = 0;
	while (start < sorted.length) {
		let end = start + 1;
		while (end < sorted.length && sorted[end]!.score === sorted[start]!.score) end += 1;
		for (let index = start; index < end; index += 1) {
			if (sorted[index]!.label === 1) truePositives += 1;
			else falsePositives += 1;
		}
		points.push({
			threshold: sorted[start]!.score,
			truePositiveRate: truePositives / positives,
			falsePositiveRate: falsePositives / negatives,
		});
		start = end;
	}
	const last = points[points.length - 1]!;
	if (last.falsePositiveRate < 1 || last.truePositiveRate < 1) {
		points.push({
			threshold: null,
			truePositiveRate: 1,
			falsePositiveRate: 1,
		});
	}
	return points;
}

/** Trapezoid area under a ROC curve. Must equal `auc` on the same samples. */
export function areaUnderCurve(points: readonly RocPoint[]): number {
	let area = 0;
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1]!;
		const current = points[index]!;
		area +=
			(current.falsePositiveRate - previous.falsePositiveRate) *
			((previous.truePositiveRate + current.truePositiveRate) / 2);
	}
	return area;
}
