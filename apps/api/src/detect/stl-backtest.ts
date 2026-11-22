/**
 * Backtest STL partagé par le script de mesure et le vérificateur.
 *
 * Le même code note la série et calcule les métriques ; les deux scripts ne
 * diffèrent que par la source de la série : table `event` du benchmark pour
 * la mesure, fixture JSON pour la vérification hors base. Un seul calcul de
 * PR-AUC, donc aucun risque de divergence entre le rapport et le contrôle.
 */
import {
	DEFAULT_MAX_DELAY_DAYS,
	DEFAULT_THRESHOLD,
	addDays,
	averagePrecision,
	evaluatePeaks,
	precisionRecallAuc,
	scoreFamilySeries,
	type PeakAnnotation,
	type PeakEvaluation,
	type ScoredDay,
	type SeriesPoint,
	type StlScoringOptions,
} from "./stl-peaks.js";

export type StlFixture = {
	version: string;
	description: string;
	start: string;
	days: number;
	period: number;
	seed: number;
	source: string;
	families: Record<string, { baseline: number; counts: number[] }>;
	peaks: Array<{ family: string; day: string; factor: number; duration_days: number; rationale: string }>;
	batch: Array<{ family: string; day: string; factor: number; lag_days: number; rationale: string }>;
};

export type StlBacktestOptions = {
	threshold?: number;
	maxDelayDays?: number;
	scoring?: StlScoringOptions;
};

export type StlBacktest = {
	scoredByFamily: Map<string, ScoredDay[]>;
	evaluation: PeakEvaluation;
	/** Average precision sur toutes les famille-jours notés. */
	prAuc: number;
	/** Aire précision/rappel par trapèzes sur le même classement. */
	prAucTrapezoid: number;
	labels: boolean[];
	scores: number[];
};

/** Grille complète du fixture, zéros compris, avec la fraîcheur des imports. */
export function fixtureSeries(fixture: StlFixture): Map<string, SeriesPoint[]> {
	const batchLag = new Map(fixture.batch.map((entry) => [`${entry.family}\u0000${entry.day}`, entry.lag_days]));
	const series = new Map<string, SeriesPoint[]>();
	for (const [family, data] of Object.entries(fixture.families)) {
		const points: SeriesPoint[] = [];
		for (let offset = 0; offset < fixture.days; offset++) {
			const day = addDays(fixture.start, offset);
			const count = data.counts[offset] ?? 0;
			const late = batchLag.has(`${family}\u0000${day}`);
			points.push({ day, count, fresh: late ? 0 : count });
		}
		series.set(family, points);
	}
	return series;
}

export function annotationsOf(fixture: StlFixture): PeakAnnotation[] {
	return fixture.peaks.map((peak) => ({ family: peak.family, day: peak.day }));
}

export function runBacktest(
	series: ReadonlyMap<string, readonly SeriesPoint[]>,
	annotations: readonly PeakAnnotation[],
	options: StlBacktestOptions = {},
): StlBacktest {
	const threshold = options.threshold ?? DEFAULT_THRESHOLD;
	const maxDelayDays = options.maxDelayDays ?? DEFAULT_MAX_DELAY_DAYS;
	const scoredByFamily = new Map<string, ScoredDay[]>();
	for (const [family, points] of series) {
		scoredByFamily.set(family, scoreFamilySeries(family, points, options.scoring));
	}
	const all = [...scoredByFamily.values()].flat();
	const labels = all.map((entry) =>
		annotations.some((annotation) => annotation.family === entry.family && annotation.day === entry.day),
	);
	const scores = all.map((entry) => entry.score);
	return {
		scoredByFamily,
		evaluation: evaluatePeaks(scoredByFamily, annotations, { threshold, maxDelayDays }),
		prAuc: averagePrecision(labels, scores),
		prAucTrapezoid: precisionRecallAuc(labels, scores),
		labels,
		scores,
	};
}
