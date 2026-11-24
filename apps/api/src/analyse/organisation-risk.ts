/**
 * Organisation-level risk index, calibrated on observed incidents.
 *
 * The index answers one narrow question: how exposed is a Nouvelle-Aquitaine
 * organisation, on public metadata alone, relative to organisations for which
 * an incident claim was actually observed? It is a descriptive ranking, not a
 * prediction of compromise and not an automated decision about any person.
 *
 * Privacy by construction: the input is a fixed vector of numeric aggregates.
 * No name, address, title, summary, victim detail or free text can reach this
 * module. Grey (relevance='context') sources are allowed as public metadata.
 * The module is pure: no database, clock, filesystem or network access.
 */

/** Numeric-only public aggregates for one organisation. */
export type RiskSignals = {
	/** Non-incident public events linked to the organisation. */
	ambientEvents: number;
	/** Distinct public sources behind those ambient events. */
	ambientSources: number;
	/** Highest severity among those ambient events, 0 when none. */
	maxSeverity: number;
	/** Days since the newest ambient event, null when there is none. */
	lastObservedDaysAgo: number | null;
	/** 1 when a public website or domain is recorded, 0 otherwise. */
	hasPublicDomain: 0 | 1;
	/** Public sector flags, in the fixed order used by the model. */
	isServices: 0 | 1;
	isCommerce: 0 | 1;
	isConstruction: 0 | 1;
	isSante: 0 | 1;
	isIndustrie: 0 | 1;
};

export type RiskSample = {
	/** Stable organisation id, used for deterministic fold assignment. */
	id: number;
	signals: RiskSignals;
	/** 1 when an incident claim was observed for this organisation. */
	label: 0 | 1;
};

export type RiskPopulation = {
	/** All organisations in scope, including those without any observation. */
	totalOrganisations: number;
	/** Organisations with at least one observed incident claim. */
	incidentOrganisations: number;
};

export type RiskModel = {
	/** Ridge-logistic coefficients learned from observed incidents. */
	weights: readonly number[];
	/** Intercept corrected to the incidence of the whole population. */
	intercept: number;
	/** Log-odds of that population incidence. */
	priorLogOdds: number;
	/** Mean exponent used for the incidence correction. */
	meanExponent: number;
	/** 75th-percentile excess of observed incidents, lower bound 0.01. */
	referenceExcess: number;
};

export type ScoredRiskSample = RiskSample & {
	features: readonly number[];
	probability: number;
	excess: number;
	score: number;
};

/** Number of fixed numeric features; a change requires a new model version. */
export const RISK_FEATURE_COUNT = 10;
const DEFAULT_ITERATIONS = 25;
const DEFAULT_RIDGE = 0.5;

/** Fixed, ordered numeric features. No free text and no label-derived field. */
export function riskFeatures(signals: RiskSignals): number[] {
	const ambient = Math.max(0, signals.ambientEvents);
	const sources = Math.max(0, signals.ambientSources);
	const severity = Math.max(0, signals.maxSeverity);
	const recency =
		signals.lastObservedDaysAgo === null
			? 0
			: Math.exp(-Math.max(0, signals.lastObservedDaysAgo) / 365);
	return [
		Math.log1p(ambient),
		severity,
		Math.log1p(sources),
		recency,
		signals.hasPublicDomain === 1 ? 1 : 0,
		signals.isServices === 1 ? 1 : 0,
		signals.isCommerce === 1 ? 1 : 0,
		signals.isConstruction === 1 ? 1 : 0,
		signals.isSante === 1 ? 1 : 0,
		signals.isIndustrie === 1 ? 1 : 0,
	];
}

/** Numerically stable logistic function. */
export function sigmoid(value: number): number {
	if (value >= 0) return 1 / (1 + Math.exp(-value));
	const exponential = Math.exp(value);
	return exponential / (1 + exponential);
}

function dot(features: readonly number[], weights: readonly number[]): number {
	let total = 0;
	for (let index = 0; index < features.length; index += 1) {
		total += features[index]! * weights[index]!;
	}
	return total;
}

function linear(features: readonly number[], parameters: readonly number[]): number {
	let total = 0;
	for (let index = 0; index < features.length; index += 1) {
		total += features[index]! * parameters[index + 1]!;
	}
	return total;
}

function baseLogOdds(population: RiskPopulation): number {
	const rate =
		(population.incidentOrganisations + 0.5) /
		(Math.max(1, population.totalOrganisations - population.incidentOrganisations) + 1);
	return Math.log(rate / (1 - rate));
}

/** Solve a small symmetric linear system with partial pivoting. */
function solve(matrix: number[][], values: number[]): number[] {
	const size = values.length;
	const rows = matrix.map((row, index) => [...row, values[index]!]);
	for (let column = 0; column < size; column += 1) {
		let pivot = column;
		for (let row = column + 1; row < size; row += 1) {
			if (Math.abs(rows[row]![column]!) > Math.abs(rows[pivot]![column]!)) pivot = row;
		}
		[rows[column], rows[pivot]] = [rows[pivot]!, rows[column]!];
		const divisor = rows[column]![column]!;
		if (Math.abs(divisor) < 1e-12) throw new Error("singular risk Hessian");
		for (let index = column; index <= size; index += 1) rows[column]![index]! /= divisor;
		for (let row = 0; row < size; row += 1) {
			if (row === column) continue;
			const factor = rows[row]![column]!;
			if (factor === 0) continue;
			for (let index = column; index <= size; index += 1) {
				rows[row]![index]! -= factor * rows[column]![index]!;
			}
		}
	}
	return rows.map((row) => row[size]!);
}

/**
 * Fit ridge logistic regression by Newton iterations on the observed cohort,
 * then move the intercept so that the mean predicted probability matches the
 * incidence in the whole population. The correction keeps a balanced
 * measurement cohort from inflating the baseline of silent organisations.
 *
 * The 0-100 index is anchored on the incidents themselves: 100 is the excess
 * log-odds of the observed incident cohort (75th percentile), 0 is the baseline
 * or below. `probability` stays available for absolute-risk readings.
 */
export function fitRiskModel(
	samples: readonly RiskSample[],
	population: RiskPopulation,
	options: { iterations?: number; ridge?: number } = {},
): RiskModel {
	if (!(population.totalOrganisations >= samples.length)) {
		throw new Error("population must include every observed organisation");
	}
	if (!(population.incidentOrganisations >= 0)) {
		throw new Error("negative incident count");
	}
	const iterations = options.iterations ?? DEFAULT_ITERATIONS;
	const ridge = options.ridge ?? DEFAULT_RIDGE;
	const features = samples.map((sample) => riskFeatures(sample.signals));
	const size = RISK_FEATURE_COUNT + 1;
	const parameters = new Array<number>(size).fill(0);
	const positives = samples.filter((sample) => sample.label === 1).length;
	parameters[0] = Math.log((positives + 0.5) / (samples.length - positives + 0.5));

	for (let step = 0; step < iterations; step += 1) {
		const hessian = Array.from({ length: size }, () => new Array<number>(size).fill(0));
		const gradient = new Array<number>(size).fill(0);
		for (let index = 0; index < samples.length; index += 1) {
			const row = features[index]!;
			const probability = sigmoid(parameters[0]! + linear(row, parameters));
			const weight = Math.max(1e-6, probability * (1 - probability));
			const error = samples[index]!.label - probability;
			gradient[0]! += error;
			hessian[0]![0]! += weight;
			for (let column = 0; column < RISK_FEATURE_COUNT; column += 1) {
				const value = row[column]!;
				gradient[column + 1]! += error * value;
				hessian[0]![column + 1]! += weight * value;
				hessian[column + 1]![0]! += weight * value;
				for (let other = 0; other <= column; other += 1) {
					hessian[column + 1]![other + 1]! += weight * value * row[other]!;
				}
			}
		}
		for (let column = 0; column < RISK_FEATURE_COUNT; column += 1) {
			gradient[column + 1]! -= ridge * parameters[column + 1]!;
			hessian[column + 1]![column + 1]! += ridge;
		}
		// Newton exige une Hessienne symétrique : chaque paire reçoit la
		// moyenne de ses deux contributions avant la résolution.
		for (let ligne = 0; ligne < size; ligne += 1) {
			for (let colonne = ligne + 1; colonne < size; colonne += 1) {
				const moyenne = (hessian[ligne]![colonne]! + hessian[colonne]![ligne]!) / 2;
				hessian[ligne]![colonne] = moyenne;
				hessian[colonne]![ligne] = moyenne;
			}
		}
		const stepVector = solve(hessian, gradient);
		let largest = 0;
		for (let index = 0; index < size; index += 1) {
			parameters[index]! += stepVector[index]!;
			largest = Math.max(largest, Math.abs(stepVector[index]!));
		}
		if (!Number.isFinite(largest)) throw new Error("risk fit diverged");
		if (largest < 1e-8) break;
	}

	const weights = parameters.slice(1);
	const priorLogOdds = baseLogOdds(population);
	const silentOrganisations = Math.max(0, population.totalOrganisations - samples.length);
	let exponentSum = silentOrganisations; // zero features -> exp(0) = 1
	for (const row of features) exponentSum += Math.exp(dot(row, weights));
	const meanExponent = exponentSum / Math.max(1, population.totalOrganisations);
	const correction = Math.log(meanExponent);
	const positiveExcess: number[] = [];
	for (let index = 0; index < samples.length; index += 1) {
		if (samples[index]!.label === 1) {
			positiveExcess.push(dot(features[index]!, weights) - correction);
		}
	}
	positiveExcess.sort((a, b) => a - b);
	const referenceExcess = Math.max(
		0.01,
		positiveExcess[Math.floor(0.75 * Math.max(0, positiveExcess.length - 1))] ?? 0.01,
	);
	return {
		weights,
		intercept: priorLogOdds - correction,
		priorLogOdds,
		meanExponent,
		referenceExcess,
	};
}

/** Estimated P(observed incident | public signals), after incidence correction. */
export function riskProbability(signals: RiskSignals, model: RiskModel): number {
	return sigmoid(model.intercept + dot(riskFeatures(signals), model.weights));
}

/** 0-100 index: 0 at the population baseline, 100 at the observed incident reference. */
export function riskScore(signals: RiskSignals, model: RiskModel): number {
	const excess = dot(riskFeatures(signals), model.weights) - Math.log(model.meanExponent);
	return Math.round(100 * Math.max(0, Math.min(1, excess / model.referenceExcess)));
}

export function scoreRiskSample(sample: RiskSample, model: RiskModel): ScoredRiskSample {
	const features = riskFeatures(sample.signals);
	const excess = dot(features, model.weights) - Math.log(model.meanExponent);
	return {
		...sample,
		features,
		probability: sigmoid(model.intercept + dot(features, model.weights)),
		excess,
		score: Math.round(100 * Math.max(0, Math.min(1, excess / model.referenceExcess))),
	};
}

/**
 * Deterministic out-of-fold scores. Sorting by id and assigning `index % folds`
 * keeps the split reproducible without a random seed. The full population
 * incidence is kept in every fold: only the training rows change, the base
 * rate being calibrated against is the measured one.
 */
export function crossValidatedRiskScores(
	samples: readonly RiskSample[],
	population: RiskPopulation,
	folds = 5,
): ScoredRiskSample[] {
	if (!(folds >= 2)) throw new Error("at least two folds are required");
	const ordered = [...samples].sort((a, b) => a.id - b.id);
	const scores: ScoredRiskSample[] = [];
	for (let fold = 0; fold < folds; fold += 1) {
		const test = ordered.filter((_, index) => index % folds === fold);
		const train = ordered.filter((_, index) => index % folds !== fold);
		if (test.length === 0 || train.length === 0) {
			throw new Error("every fold needs at least one train and one test sample");
		}
		const model = fitRiskModel(train, population);
		for (const sample of test) scores.push(scoreRiskSample(sample, model));
	}
	return scores.sort((a, b) => a.id - b.id);
}
