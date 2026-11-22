/**
 * Twelve-month trend series and robust break detection.
 *
 * Pure module: it takes already filtered events, reads no database, calls no
 * clock and performs no network request. Every month of the window is present,
 * including months with no events: a gap is an observation, not a missing cell.
 *
 * A break is a sustained level shift, not a single busy month. It needs enough
 * preceding months, at least two following months above (or below) the
 * baseline by a meaningful count, and a robust z-score. Each break keeps the
 * event ids that support it so a reviewer can trace it without storing any
 * victim personal data.
 */

export const TREND_MONTHS = 12;
export const TREND_AXES = ["all", "source", "sector", "org"] as const;
export type TrendAxis = (typeof TREND_AXES)[number];

export const DEFAULT_BREAK_OPTIONS = {
	/** Maximum number of preceding months used as the baseline. */
	history: 6,
	/** Minimum preceding months required to calibrate the baseline. */
	minHistory: 3,
	/** A shift must persist over at least this many following months. */
	minAfterMonths: 2,
	/** Minimum absolute change in events per month. */
	minDelta: 3,
	/** Robust z-score threshold against the baseline scale. */
	zThreshold: 3,
	/** Cap on the event ids attached to one break. */
	maxEvidence: 10,
} as const;
export type BreakOptions = Partial<typeof DEFAULT_BREAK_OPTIONS>;

export type TrendEvent = {
	id: string | number;
	/** ISO instant or date of the observation. */
	at: string;
	source?: string | null;
	sector?: string | null;
	org?: string | null;
};

export type MonthBucket = {
	month: string;
	count: number;
	eventIds: (string | number)[];
};

export type MonthlySeries = {
	axis: TrendAxis;
	group: string;
	months: MonthBucket[];
	total: number;
};

export type SeriesBreak = {
	axis: TrendAxis;
	group: string;
	month: string;
	direction: "up" | "down";
	baseline: number;
	level: number;
	delta: number;
	z: number;
	beforeMonths: number;
	afterMonths: number;
	eventIds: (string | number)[];
	explanation: string;
};

export type TrendOptions = {
	/** End of the window; the calendar month containing it is included. */
	asOf: string;
	months?: number;
	axes?: readonly TrendAxis[];
};

export type TrendAnalysis = {
	window: string[];
	series: MonthlySeries[];
	breaks: SeriesBreak[];
};

function instantOf(value: string | number): number {
	const t = typeof value === "number" ? value : Date.parse(value);
	if (!Number.isFinite(t)) throw new RangeError("a valid date is required");
	return t;
}

export function monthKey(value: string | number): string {
	return new Date(instantOf(value)).toISOString().slice(0, 7);
}

/** Calendar months of the window, oldest first, including the current month. */
export function trendWindow(asOf: string, months = TREND_MONTHS): string[] {
	if (!Number.isInteger(months) || months < 2) throw new RangeError("months must be an integer >= 2");
	const end = new Date(instantOf(asOf));
	const first = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months + 1, 1));
	return Array.from({ length: months }, (_, i) =>
		new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1)).toISOString().slice(0, 7),
	);
}

function groupFor(event: TrendEvent, axis: TrendAxis): string | null {
	if (axis === "all") return "all";
	const value = axis === "source" ? event.source : axis === "sector" ? event.sector : event.org;
	if (value === null || value === undefined) return null;
	const group = String(value).trim();
	return group === "" ? null : group;
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length === 0) return 0;
	return sorted.length % 2 === 1
		? sorted[middle]!
		: (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Builds one zero-filled series per group. Events outside the window, after
 * `asOf`, or without a value for the requested axis are ignored.
 */
export function buildMonthlySeries(events: readonly TrendEvent[], options: TrendOptions): MonthlySeries[] {
	const months = options.months ?? TREND_MONTHS;
	const window = trendWindow(options.asOf, months);
	const index = new Map(window.map((month, i) => [month, i]));
	const end = instantOf(options.asOf);
	const axes = options.axes ?? TREND_AXES;
	const rank = new Map(TREND_AXES.map((axis, i) => [axis, i]));
	const store = new Map<string, { axis: TrendAxis; group: string; buckets: MonthBucket[] }>();

	for (const event of events) {
		const at = Date.parse(event.at);
		if (!Number.isFinite(at) || at > end) continue;
		const i = index.get(monthKey(at));
		if (i === undefined) continue;
		for (const axis of axes) {
			const group = groupFor(event, axis);
			if (group === null) continue;
			const key = `${axis}\u0000${group}`;
			let series = store.get(key);
			if (!series) {
				series = {
					axis,
					group,
					buckets: window.map((month) => ({ month, count: 0, eventIds: [] })),
				};
				store.set(key, series);
			}
			const bucket = series.buckets[i]!;
			bucket.count++;
			bucket.eventIds.push(event.id);
		}
	}

	return [...store.values()]
		.sort((a, b) =>
			(rank.get(a.axis) ?? 99) - (rank.get(b.axis) ?? 99) || a.group.localeCompare(b.group),
		)
		.map(({ axis, group, buckets }) => ({
			axis,
			group,
			months: buckets,
			total: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
		}));
}

/**
 * Finds sustained level shifts. A candidate split needs a calibrated past,
 * a two-month future that stays on the other side of the baseline, and a
 * robust z-score. Repeated candidates for the same shift are suppressed.
 */
export function detectBreaks(series: readonly MonthlySeries[], options: BreakOptions = {}): SeriesBreak[] {
	const cfg = { ...DEFAULT_BREAK_OPTIONS, ...options };
	if (!Number.isInteger(cfg.history) || cfg.history < 1) throw new RangeError("history must be a positive integer");
	if (!Number.isInteger(cfg.minHistory) || cfg.minHistory < 1) throw new RangeError("minHistory must be a positive integer");
	if (!Number.isInteger(cfg.minAfterMonths) || cfg.minAfterMonths < 1) {
		throw new RangeError("minAfterMonths must be a positive integer");
	}
	if (!Number.isInteger(cfg.minDelta) || cfg.minDelta < 1) throw new RangeError("minDelta must be a positive integer");
	if (!Number.isInteger(cfg.maxEvidence) || cfg.maxEvidence < 1) throw new RangeError("maxEvidence must be a positive integer");
	if (!Number.isFinite(cfg.zThreshold) || cfg.zThreshold <= 0) throw new RangeError("zThreshold must be > 0");
	if (cfg.history < cfg.minHistory) throw new RangeError("history must be >= minHistory");

	const breaks: SeriesBreak[] = [];
	for (const serie of series) {
		let lastBreak = -Infinity;
		for (let i = cfg.minHistory; i <= serie.months.length - cfg.minAfterMonths; i++) {
			if (i - lastBreak < cfg.minAfterMonths) continue;
			const before = serie.months.slice(Math.max(0, i - cfg.history), i).map((m) => m.count);
			if (before.length < cfg.minHistory) continue;
			const after = serie.months.slice(i);
			const baseline = median(before);
			const level = median(after.map((m) => m.count));
			const delta = level - baseline;
			if (Math.abs(delta) < cfg.minDelta) continue;
			const mad = median(before.map((v) => Math.abs(v - baseline)));
			const scale = Math.max(1.4826 * mad, Math.sqrt(baseline + 1));
			const z = Math.abs(delta) / scale;
			if (!Number.isFinite(z) || z < cfg.zThreshold) continue;
			const holds = after.every((m) =>
				delta > 0 ? m.count >= baseline + cfg.minDelta : m.count <= baseline - cfg.minDelta,
			);
			if (!holds) continue;
			const eventIds = [
				...serie.months[Math.max(0, i - 1)]!.eventIds,
				...after.flatMap((m) => m.eventIds),
			].slice(0, cfg.maxEvidence);
			if (eventIds.length === 0) continue;
			const direction = delta > 0 ? "up" : "down";
			breaks.push({
				axis: serie.axis,
				group: serie.group,
				month: after[0]!.month,
				direction,
				baseline,
				level,
				delta,
				z: Math.round(z * 100) / 100,
				beforeMonths: before.length,
				afterMonths: after.length,
				eventIds,
				explanation:
					`${serie.axis} ${serie.group}: level ${direction === "up" ? "rose" : "fell"} ` +
					`from ${baseline} to ${level} events/month at ${after[0]!.month} ` +
					`(z=${z.toFixed(1)} over ${before.length} preceding months, ${after.length} following months)`,
			});
			lastBreak = i;
		}
	}
	return breaks.sort((a, b) =>
		a.month.localeCompare(b.month) ||
		TREND_AXES.indexOf(a.axis) - TREND_AXES.indexOf(b.axis) ||
		a.group.localeCompare(b.group),
	);
}

/** Convenience entry point used by the measurement command. */
export function analyseTrend(events: readonly TrendEvent[], options: TrendOptions, breakOptions: BreakOptions = {}): TrendAnalysis {
	const window = trendWindow(options.asOf, options.months ?? TREND_MONTHS);
	const series = buildMonthlySeries(events, options);
	return { window, series, breaks: detectBreaks(series, breakOptions) };
}
