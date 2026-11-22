/**
 * Calibration of the organisation risk index into an incident probability.
 *
 * The public score is a cheap, numeric-only exposure index. Most organisations
 * share the same few score values, so an equal-width probability histogram
 * would leave eight of ten bins empty. This module therefore uses **equal-count
 * risk strata**: sort by score (descending, id as a deterministic tie-break),
 * then split into ten bins. Each bin gets its own reliability probability,
 * shrunk towards the population base rate to survive small cells.
 *
 * Evaluation is leave-one-out inside each bin: a label never contributes to
 * its own probability. Brier and ECE are computed from those out-of-sample
 * predictions, never from the fitted bin probabilities. The module is pure:
 * no database, no clock, no filesystem, no free text.
 */

/** Public numeric aggregates used by the exposure index. No names, no text. */
export type OrgRiskSignals = {
	hasPublicDomain: 0 | 1;
	isServices: 0 | 1;
	isCommerce: 0 | 1;
	isConstruction: 0 | 1;
	isSante: 0 | 1;
	isIndustrie: 0 | 1;
};

/** Public sector weights of the exposure index (0-100 scale). */
export const SECTOR_WEIGHTS = {
	services: 2,
	commerce: 3,
	construction: 2,
	sante: 4,
	industrie: 4,
} as const;

const DOMAIN_WEIGHT = 5;
const MAX_SCORE = 100;

/** Transparent exposure index. Higher means more observed public exposure. */
export function organisationRiskScore(signals: OrgRiskSignals): number {
	return Math.min(
		MAX_SCORE,
		(signals.hasPublicDomain === 1 ? DOMAIN_WEIGHT : 0) +
			(signals.isServices === 1 ? SECTOR_WEIGHTS.services : 0) +
			(signals.isCommerce === 1 ? SECTOR_WEIGHTS.commerce : 0) +
			(signals.isConstruction === 1 ? SECTOR_WEIGHTS.construction : 0) +
			(signals.isSante === 1 ? SECTOR_WEIGHTS.sante : 0) +
			(signals.isIndustrie === 1 ? SECTOR_WEIGHTS.industrie : 0),
	);
}

export type RiskObservation = {
	/** Stable organisation id; only used to break equal-score ties. */
	id: number;
	/** Exposure index in [0,100]. */
	score: number;
	/** 1 when an incident was observed in the evaluation window. */
	label: 0 | 1;
};

export type RiskCalibrationBin = {
	index: number;
	scoreMin: number;
	scoreMax: number;
	count: number;
	positives: number;
	/** Probability fitted on the whole bin, used by the published model. */
	probability: number;
	/** Observed incident rate in the bin. */
	observed: number;
	/** Mean leave-one-out probability in the bin. */
	looMean: number;
	/** |looMean - observed| weighted by the bin's share of the sample. */
	eceContribution: number;
};

export type RiskPrediction = {
	id: number;
	probability: number;
	label: 0 | 1;
	bin: number;
};

export type RiskCalibrationResult = {
	model: "org_risk_calibrated";
	sampleCount: number;
	binCount: number;
	minBinCount: number;
	prior: number;
	priorWeight: number;
	brier: number;
	ece: number;
	bins: RiskCalibrationBin[];
	predictions: RiskPrediction[];
};

/** Targets of the published evaluation. Kept here so code and docs agree. */
export const CALIBRATION_TARGETS = {
	brier: 0.15,
	ece: 0.05,
	binCount: 10,
	sampleCount: 120,
	minBinCount: 12,
} as const;

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

/**
 * Assign every observation to an equal-count risk bin. The id tie-break makes
 * the result reproducible even when hundreds of organisations share a score.
 */
export function assignRiskBins(
	observations: readonly RiskObservation[],
	binCount: number = CALIBRATION_TARGETS.binCount,
): Map<number, number> {
	if (!Number.isInteger(binCount) || binCount < 2) throw new RangeError("binCount must be at least 2");
	const seen = new Set<number>();
	for (const observation of observations) {
		if (!Number.isFinite(observation.score)) throw new Error("risk score must be finite");
		if (observation.label !== 0 && observation.label !== 1) throw new Error("risk label must be 0 or 1");
		if (seen.has(observation.id)) throw new Error(`duplicate organisation id ${observation.id}`);
		seen.add(observation.id);
	}
	const ordered = [...observations].sort((a, b) => b.score - a.score || a.id - b.id);
	const assignment = new Map<number, number>();
	ordered.forEach((observation, index) => {
		assignment.set(observation.id, Math.min(binCount - 1, Math.floor((index * binCount) / ordered.length)));
	});
	return assignment;
}

/**
 * Brier score and 10-bin ECE on leave-one-out reliability predictions.
 *
 * `priorWeight` pseudo-observations are placed at the population base rate:
 * weight 5 on 12 organisations keeps an empty cell at ~0.04 instead of 0 or 1.
 */
export function evaluateRiskCalibration(
	observations: readonly RiskObservation[],
	options: { binCount?: number; priorWeight?: number } = {},
): RiskCalibrationResult {
	const binCount = options.binCount ?? CALIBRATION_TARGETS.binCount;
	const priorWeight = options.priorWeight ?? 5;
	if (!Number.isFinite(priorWeight) || priorWeight < 0) throw new RangeError("priorWeight must be non-negative");
	if (observations.length < binCount) throw new Error("at least one observation per bin is required");

	const assignment = assignRiskBins(observations, binCount);
	const positives = observations.filter((observation) => observation.label === 1).length;
	const prior = positives / observations.length;
	const members: RiskObservation[][] = Array.from({ length: binCount }, () => []);
	for (const observation of observations) members[assignment.get(observation.id)!]!.push(observation);

	const bins: RiskCalibrationBin[] = [];
	const predictions: RiskPrediction[] = [];
	let squaredError = 0;
	let ece = 0;

	members.forEach((group, index) => {
		const count = group.length;
		const hits = group.reduce((total, observation) => total + observation.label, 0);
		const observed = hits / count;
		const probability = clamp01((hits + priorWeight * prior) / (count + priorWeight));
		const scores = group.map((observation) => observation.score);
		const looProbabilities = group.map((observation) => {
			const denominator = count - 1 + priorWeight;
			const loo = denominator > 0 ? (hits - observation.label + priorWeight * prior) / denominator : prior;
			return clamp01(loo);
		});
		looProbabilities.forEach((value, position) => {
			const label = group[position]!.label;
			squaredError += (value - label) ** 2;
			predictions.push({ id: group[position]!.id, probability: value, label, bin: index });
		});
		const looMean = looProbabilities.reduce((total, value) => total + value, 0) / count;
		const contribution = (count / observations.length) * Math.abs(looMean - observed);
		ece += contribution;
		bins.push({
			index,
			scoreMin: Math.min(...scores),
			scoreMax: Math.max(...scores),
			count,
			positives: hits,
			probability,
			observed,
			looMean,
			eceContribution: contribution,
		});
	});

	return {
		model: "org_risk_calibrated",
		sampleCount: observations.length,
		binCount,
		minBinCount: Math.min(...bins.map((bin) => bin.count)),
		prior,
		priorWeight,
		brier: squaredError / observations.length,
		ece,
		bins,
		predictions,
	};
}

/** Human-readable failures, empty when every published target is met. */
export function calibrationFailures(result: RiskCalibrationResult): string[] {
	const failures: string[] = [];
	if (result.brier > CALIBRATION_TARGETS.brier) {
		failures.push(`Brier ${result.brier.toFixed(6)} > ${CALIBRATION_TARGETS.brier}`);
	}
	if (result.ece > CALIBRATION_TARGETS.ece) {
		failures.push(`ECE ${result.ece.toFixed(6)} > ${CALIBRATION_TARGETS.ece}`);
	}
	if (result.binCount !== CALIBRATION_TARGETS.binCount) {
		failures.push(`${result.binCount} bins != ${CALIBRATION_TARGETS.binCount}`);
	}
	if (result.sampleCount !== CALIBRATION_TARGETS.sampleCount) {
		failures.push(`${result.sampleCount} organisations != ${CALIBRATION_TARGETS.sampleCount}`);
	}
	if (result.minBinCount < CALIBRATION_TARGETS.minBinCount) {
		failures.push(`effectif minimal ${result.minBinCount} < ${CALIBRATION_TARGETS.minBinCount}`);
	}
	return failures;
}
