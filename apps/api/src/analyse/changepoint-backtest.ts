/**
 * Backtest for the regime-change detector.
 *
 * The fixture is a versioned synthetic corpus: six OSINT families, 460 days,
 * weekly seasonality, overdispersed daily counts, 30 annotated sustained
 * shifts, and isolated spikes that are not regime changes. It contains no real
 * event, organisation or personal data.
 *
 * The evaluator is shared by the measurement script, the verifier and the
 * tests so the stored SQL table and the replayed result cannot drift apart.
 */
import {
	CHANGEPOINT_MODEL,
	detectRegimeChanges,
	parseDay,
	addDays,
	daysBetween,
	type ChangepointOptions,
	type RegimeChange,
	type SeriesPoint,
} from "./changepoint.js";

export type ChangepointAnnotation = {
	family: string;
	/** First day of the new regime, `YYYY-MM-DD`. */
	day: string;
	direction: "up" | "down";
	/** Level multiplier applied on that day. */
	multiplier: number;
	rationale: string;
};

export type ChangepointFixture = {
	model: string;
	start: string;
	days: number;
	seed: number;
	families: Record<string, { base: number; counts: number[] }>;
	annotations: ChangepointAnnotation[];
	spikes: Array<{ family: string; day: string; factor: number }>;
};

export type ChangepointEvalRow = {
	family: string;
	annotatedDay: string;
	detected: boolean;
	detectedOn: string | null;
	delayDays: number | null;
	direction: "up" | "down";
	score: number | null;
};

export type ChangepointDetectionRow = {
	family: string;
	detectedOn: string;
	confirmedOn: string;
	direction: "up" | "down";
	score: number;
	baseline: number;
	level: number;
	ratio: number;
	matchedAnnotationDay: string | null;
	delayDays: number | null;
	falsePositive: boolean;
};

export type ChangepointMetrics = {
	annotated: number;
	detectedWithin7: number;
	detectionRate: number;
	falsePositives: number;
	evaluatedDays: number;
	falsePositivesPerYear: number;
	lateDetections: number;
	medianDelayDays: number | null;
	averageDelayDays: number | null;
};

export type ChangepointBacktest = {
	model: string;
	rows: ChangepointEvalRow[];
	detections: ChangepointDetectionRow[];
	metrics: ChangepointMetrics;
};

export const CHANGEPOINT_MAX_DELAY_DAYS = 7;

/** A detection this long after an annotation is still the same regime. */
export const CHANGEPOINT_ASSOCIATION_DAYS = 21;

export function seriesOf(fixture: ChangepointFixture, family: string): SeriesPoint[] {
	const data = fixture.families[family];
	if (!data) return [];
	return data.counts.map((count, offset) => ({ day: addDays(fixture.start, offset), count }));
}

function median(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1
		? sorted[middle]!
		: (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round(value: number, digits: number): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

export function runChangepointBacktest(
	fixture: ChangepointFixture,
	options: ChangepointOptions = {},
): ChangepointBacktest {
	const annotations = fixture.annotations;
	const detections: ChangepointDetectionRow[] = [];
	const rows: ChangepointEvalRow[] = [];
	const families = Object.keys(fixture.families);

	const byFamily = new Map<string, RegimeChange[]>();
	for (const family of families) {
		const result = detectRegimeChanges(seriesOf(fixture, family), options);
		byFamily.set(family, result.changes);
	}

	const annotationByFamily = new Map<string, ChangepointAnnotation[]>();
	for (const annotation of annotations) {
		const list = annotationByFamily.get(annotation.family) ?? [];
		list.push(annotation);
		annotationByFamily.set(annotation.family, list);
	}

	for (const family of families) {
		for (const change of byFamily.get(family) ?? []) {
			const familyAnnotations = annotationByFamily.get(family) ?? [];
			const previous = familyAnnotations
				.filter((annotation) => {
					const delta = daysBetween(annotation.day, change.day);
					return delta >= 0 && delta <= CHANGEPOINT_ASSOCIATION_DAYS;
				})
				.sort((a, b) => parseDay(b.day) - parseDay(a.day))[0];
			const delay = previous ? daysBetween(previous.day, change.day) : null;
			detections.push({
				family,
				detectedOn: change.day,
				confirmedOn: change.confirmedOn,
				direction: change.direction,
				score: change.z,
				baseline: change.baseline,
				level: change.level,
				ratio: change.ratio,
				matchedAnnotationDay: previous?.day ?? null,
				delayDays: delay,
				falsePositive: previous === null,
			});
		}
	}

	for (const annotation of annotations) {
		const match = (byFamily.get(annotation.family) ?? [])
			.filter((change) => {
				const delay = daysBetween(annotation.day, change.day);
				return delay >= 0 && delay <= CHANGEPOINT_MAX_DELAY_DAYS;
			})
			.sort((a, b) => parseDay(a.day) - parseDay(b.day))[0];
		rows.push({
			family: annotation.family,
			annotatedDay: annotation.day,
			detected: match !== undefined,
			detectedOn: match?.day ?? null,
			delayDays: match ? daysBetween(annotation.day, match.day) : null,
			direction: annotation.direction,
			score: match?.z ?? null,
		});
	}

	rows.sort((a, b) =>
		a.annotatedDay.localeCompare(b.annotatedDay) || a.family.localeCompare(b.family),
	);
	detections.sort((a, b) =>
		a.detectedOn.localeCompare(b.detectedOn) || a.family.localeCompare(b.family),
	);

	const delays = rows.flatMap((row) =>
		row.detected && row.delayDays !== null ? [row.delayDays] : [],
	);
	const falsePositives = detections.filter((detection) => detection.falsePositive).length;
	const lateDetections = detections.filter(
		(detection) => !detection.falsePositive && (detection.delayDays ?? Infinity) > CHANGEPOINT_MAX_DELAY_DAYS,
	).length;
	const evaluatedDays = families.length * fixture.days;
	const detectedWithin7 = delays.length;

	return {
		model: fixture.model,
		rows,
		detections,
		metrics: {
			annotated: annotations.length,
			detectedWithin7,
			detectionRate: annotations.length === 0 ? 0 : round(detectedWithin7 / annotations.length, 4),
			falsePositives,
			evaluatedDays,
			falsePositivesPerYear: evaluatedDays === 0 ? 0 : round(falsePositives / (evaluatedDays / 365), 4),
			lateDetections,
			medianDelayDays: median(delays),
			averageDelayDays:
				delays.length === 0 ? null : round(delays.reduce((sum, value) => sum + value, 0) / delays.length, 4),
		},
	};
}

export function describeBacktest(backtest: ChangepointBacktest): string {
	const m = backtest.metrics;
	return [
		`model ${CHANGEPOINT_MODEL}`,
		`annotés ${m.annotated}`,
		`détectés ≤ ${CHANGEPOINT_MAX_DELAY_DAYS} j ${m.detectedWithin7}`,
		`taux ${(m.detectionRate * 100).toFixed(1)} %`,
		`faux positifs ${m.falsePositives} (${m.falsePositivesPerYear.toFixed(2)}/an)`,
		`délai médian ${m.medianDelayDays ?? "—"} j`,
	].join(" · ");
}
