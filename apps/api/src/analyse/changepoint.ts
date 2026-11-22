/**
 * Regime-change detection on daily OSINT series.
 *
 * A regime change is a sustained shift in the arrival rate of a family, not a
 * single busy day. The detector compares a seven-day arrival total with the
 * six preceding complete weeks, using a robust (median/MAD) scale, then asks
 * for a second seven-day window two weeks later to still be on the new side.
 * A burst or an import backlog therefore does not become a campaign.
 *
 * The module is pure: it takes already-bucketed day/count points, reads no
 * database, calls no clock and performs no network request. Missing days are
 * treated as zero observations between the first and last supplied day.
 *
 * Detection delay is measured from the annotated first day of the new regime
 * to the day the seven-day window first crosses the threshold. Confirmation
 * happens two weeks later but does not change that reported day.
 */

export const CHANGEPOINT_MODEL = "weekly-z@1";

export const DEFAULT_CHANGEPOINT_OPTIONS = {
	/** Complete weeks used as the pre-change baseline. */
	baselineWeeks: 6,
	/** Days in the recent arrival window (one week removes weekday season). */
	recentDays: 7,
	/** Robust z-score required before a candidate is recorded. */
	zThreshold: 3,
	/** Minimum relative shift: +30 % or -23 % on the weekly arrival total. */
	minRatio: 0.3,
	/** Minimum absolute shift, in weekly events. */
	minDelta: 5,
	/** Additional floor relative to the baseline (20 % of weekly events). */
	minDeltaRatio: 0.2,
	/** Days after the candidate used as an independent confirmation window. */
	confirmDays: 14,
	/** Two confirmed candidates closer than this are one regime change. */
	cooldownDays: 21,
} as const;

export type ChangepointOptions = Partial<typeof DEFAULT_CHANGEPOINT_OPTIONS>;

export type SeriesPoint = {
	/** UTC calendar day, `YYYY-MM-DD`. */
	day: string;
	count: number;
};

export type RegimeChange = {
	/** First day the seven-day window crossed the threshold. */
	day: string;
	/** Day the independent confirmation window was read. */
	confirmedOn: string;
	direction: "up" | "down";
	/** Median weekly total over the six preceding complete weeks. */
	baseline: number;
	/** Weekly total over the recent seven days. */
	level: number;
	/** level − baseline, weekly events. */
	delta: number;
	/** level / baseline. */
	ratio: number;
	/** Robust z-score of the weekly shift. */
	z: number;
};

export type ChangepointDetection = {
	changes: RegimeChange[];
	/** Days evaluated after the baseline warm-up. */
	evaluatedDays: number;
};

const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

export function parseDay(day: string): number {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	if (!match) throw new RangeError(`invalid day: ${day}`);
	const value = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
	if (!Number.isFinite(value)) throw new RangeError(`invalid day: ${day}`);
	return value;
}

export function formatDay(instant: number): string {
	return new Date(instant).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
	return formatDay(parseDay(day) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
	return Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
}

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length === 0) return 0;
	return sorted.length % 2 === 1
		? sorted[middle]!
		: (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function zeroFilled(points: readonly SeriesPoint[]): number[] {
	if (points.length === 0) return [];
	const sorted = [...points].sort((a, b) => parseDay(a.day) - parseDay(b.day));
	const first = parseDay(sorted[0]!.day);
	const last = parseDay(sorted[sorted.length - 1]!.day);
	const span = Math.round((last - first) / DAY_MS) + 1;
	const counts = new Array<number>(span).fill(0);
	for (const point of sorted) {
		if (!Number.isFinite(point.count) || point.count < 0) {
			throw new RangeError(`invalid count for ${point.day}: ${point.count}`);
		}
		const offset = Math.round((parseDay(point.day) - first) / DAY_MS);
		counts[offset] = point.count;
	}
	return counts;
}

function validate(options: ChangepointOptions): Required<typeof DEFAULT_CHANGEPOINT_OPTIONS> {
	const cfg = { ...DEFAULT_CHANGEPOINT_OPTIONS, ...options };
	if (!Number.isInteger(cfg.baselineWeeks) || cfg.baselineWeeks < 2) {
		throw new RangeError("baselineWeeks must be an integer >= 2");
	}
	if (!Number.isInteger(cfg.recentDays) || cfg.recentDays < 1) {
		throw new RangeError("recentDays must be a positive integer");
	}
	if (!Number.isInteger(cfg.confirmDays) || cfg.confirmDays < cfg.recentDays) {
		throw new RangeError("confirmDays must be >= recentDays");
	}
	if (!Number.isInteger(cfg.cooldownDays) || cfg.cooldownDays < 0) {
		throw new RangeError("cooldownDays must be a non-negative integer");
	}
	if (!Number.isFinite(cfg.zThreshold) || cfg.zThreshold <= 0) {
		throw new RangeError("zThreshold must be > 0");
	}
	if (!Number.isFinite(cfg.minRatio) || cfg.minRatio <= 0 || cfg.minRatio >= 1) {
		throw new RangeError("minRatio must be in (0, 1)");
	}
	if (!Number.isFinite(cfg.minDelta) || cfg.minDelta < 0) throw new RangeError("minDelta must be >= 0");
	if (!Number.isFinite(cfg.minDeltaRatio) || cfg.minDeltaRatio < 0) {
		throw new RangeError("minDeltaRatio must be >= 0");
	}
	return cfg;
}

/**
 * Detects sustained regime changes. Returns the earliest day of each confirmed
 * shift, oldest first. A single-day spike and a two-day burst are rejected by
 * the confirmation window; a slow drift that never clears the effect floor is
 * not a regime change either.
 */
export function detectRegimeChanges(
	points: readonly SeriesPoint[],
	options: ChangepointOptions = {},
): ChangepointDetection {
	const cfg = validate(options);
	const counts = zeroFilled(points);
	const firstDay = points.length === 0 ? null : [...points].sort((a, b) => parseDay(a.day) - parseDay(b.day))[0]!.day;
	const span = counts.length;
	const prefix = new Array<number>(span + 1).fill(0);
	for (let i = 0; i < span; i++) prefix[i + 1] = prefix[i]! + counts[i]!;

	const windowSum = (end: number, length = cfg.recentDays): number => {
		const start = end - length + 1;
		if (start < 0) return Number.NaN;
		return prefix[end + 1]! - prefix[start]!;
	};

	const farEnough = (ratio: number): boolean =>
		ratio >= 1 + cfg.minRatio || ratio <= 1 / (1 + cfg.minRatio);

	const candidates: Array<{
		index: number;
		baseline: number;
		level: number;
		delta: number;
		ratio: number;
		z: number;
		direction: "up" | "down";
	}> = [];

	const warmup = cfg.baselineWeeks * WEEK_DAYS + cfg.recentDays - 1;
	for (let end = warmup; end < span; end++) {
		const level = windowSum(end);
		const weeks: number[] = [];
		for (let w = 1; w <= cfg.baselineWeeks; w++) {
			const weekEnd = end - 1 - (w - 1) * WEEK_DAYS;
			const sum = windowSum(weekEnd);
			if (Number.isNaN(sum)) break;
			weeks.push(sum);
		}
		if (weeks.length < cfg.baselineWeeks) continue;

		const baseline = median(weeks);
		const mad = median(weeks.map((value) => Math.abs(value - baseline)));
		const scale = Math.max(1.4826 * mad, 2 * Math.sqrt(Math.max(baseline, 1)));
		const delta = level - baseline;
		const ratio = level / Math.max(baseline, 1e-9);
		const z = Math.abs(delta) / scale;
		const floor = Math.max(cfg.minDelta, cfg.minDeltaRatio * baseline);

		if (z >= cfg.zThreshold && farEnough(ratio) && Math.abs(delta) >= floor) {
			candidates.push({ index: end, baseline, level, delta, ratio, z, direction: delta > 0 ? "up" : "down" });
		}
	}

	const confirmed: RegimeChange[] = [];
	for (const candidate of candidates) {
		const confirmIndex = candidate.index + cfg.confirmDays;
		if (confirmIndex >= span) continue;
		const later = windowSum(confirmIndex);
		const laterRatio = later / Math.max(candidate.baseline, 1e-9);
		const sameSide = (later - candidate.baseline) * candidate.delta > 0;
		const keepsEffect = Math.abs(later - candidate.baseline) >= 0.6 * Math.abs(candidate.delta);
		if (!sameSide || !keepsEffect || !farEnough(laterRatio)) continue;
		if (firstDay === null) continue;
		confirmed.push({
			day: addDays(firstDay, candidate.index),
			confirmedOn: addDays(firstDay, confirmIndex),
			direction: candidate.direction,
			baseline: Math.round(candidate.baseline * 100) / 100,
			level: Math.round(candidate.level * 100) / 100,
			delta: Math.round(candidate.delta * 100) / 100,
			ratio: Math.round(candidate.ratio * 1000) / 1000,
			z: Math.round(candidate.z * 100) / 100,
		});
	}

	confirmed.sort((a, b) => parseDay(a.day) - parseDay(b.day));
	const changes: RegimeChange[] = [];
	let lastIndex = -Infinity;
	for (const change of confirmed) {
		const index = daysBetween(firstDay ?? change.day, change.day);
		if (index - lastIndex < cfg.cooldownDays) continue;
		changes.push(change);
		lastIndex = index;
	}
	return { changes, evaluatedDays: Math.max(0, span - warmup) };
}

/** Convenience: series points from dated event rows. */
export function buildDailySeries(
	events: readonly { day: string; count?: number }[],
): SeriesPoint[] {
	const totals = new Map<string, number>();
	for (const event of events) {
		const count = event.count ?? 1;
		totals.set(event.day, (totals.get(event.day) ?? 0) + count);
	}
	return [...totals.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([day, count]) => ({ day, count }));
}
