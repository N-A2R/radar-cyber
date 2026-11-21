/**
 * Silent-source detector — deterministic, pure, no LLM and no personal data.
 *
 * A source is "silent" only when it has first demonstrated a real production
 * cadence. A source that never produced anything is unknown, not silent:
 * alerting on it would be an alert by omission.
 *
 * The 12-hour threshold is chosen so that an hourly check detects the pause
 * before the 24-hour objective, leaving a full hour of headroom. The real
 * delay is not assumed here — it is measured by `scripts/measure-silent-source.mts`
 * over a 30-day replay and published in `docs/source-muette-24h.md`.
 */
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** Silence required before an alert. Half of the 24 h product objective. */
export const SILENCE_ALERT_HOURS = 12;
/** Look-back used to establish that the source is an active producer. */
export const CADENCE_WINDOW_DAYS = 7;
/** Distinct UTC production days required inside the cadence window. */
export const MIN_CADENCE_DAYS = 3;

export const SILENT_SOURCE_RULE = "supervision:silent-source-24h";
export const SILENT_SOURCE_SCOPE = "supervision-silent-source";

export type SourceSignal = {
	/** Public source identifier. Never an organisation or a victim. */
	sourceId: string;
	/** Epoch milliseconds at which the source produced an item. */
	productionTimes: readonly number[];
};

export type SilentSourceAlert = {
	ruleId: string;
	sourceId: string;
	/** Last observed production, epoch milliseconds. */
	lastProductionAt: number;
	/** Whole hours without production at the time of the check. */
	silenceHours: number;
	cadenceDays: number;
	reason: string;
};

// Distinct UTC days, not timestamps, establish a cadence.

/**
 * One alert, or `null` when the source is unknown, still producing, or too
 * irregular to have a cadence. Future and invalid timestamps are ignored so a
 * bad clock cannot hide or invent a silence.
 */
export function detectSilentSource(signal: SourceSignal, now: number = Date.now()): SilentSourceAlert | null {
	const valid = signal.productionTimes
		.filter((t) => Number.isFinite(t) && t >= 0 && t <= now)
		.slice()
		.sort((a, b) => a - b);
	if (valid.length === 0) return null;

	const lastProductionAt = valid[valid.length - 1]!;
	const silenceMs = now - lastProductionAt;
	if (silenceMs < SILENCE_ALERT_HOURS * HOUR_MS) return null;

	const cadenceStart = lastProductionAt - CADENCE_WINDOW_DAYS * DAY_MS;
	const activeDays = new Set<number>();
	for (const instant of valid) {
		if (instant >= cadenceStart && instant < lastProductionAt) activeDays.add(Math.floor(instant / DAY_MS));
	}
	if (activeDays.size < MIN_CADENCE_DAYS) return null;

	const silenceHours = Math.floor(silenceMs / HOUR_MS);
	return {
		ruleId: SILENT_SOURCE_RULE,
		sourceId: signal.sourceId,
		lastProductionAt,
		silenceHours,
		cadenceDays: activeDays.size,
		reason: `Silent source ${signal.sourceId}: no item for ${silenceHours} h after ${activeDays.size} active days`,
	};
}

/** Alerts in input order. Each source is evaluated independently. */
export function detectSilentSources(signals: readonly SourceSignal[], now: number = Date.now()): SilentSourceAlert[] {
	const alerts: SilentSourceAlert[] = [];
	for (const signal of signals) {
		const alert = detectSilentSource(signal, now);
		if (alert) alerts.push(alert);
	}
	return alerts;
}

export type DelaySummary = {
	count: number;
	p50Hours: number;
	p90Hours: number;
	maxHours: number;
	under24h: number;
};

function percentile(sorted: readonly number[], fraction: number): number {
	if (sorted.length === 0) return 0;
	const position = (sorted.length - 1) * fraction;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	if (lower === upper) return sorted[lower]!;
	return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/** Summary of measured detection delays, in hours. No delay is invented. */
export function summarizeSilenceDelays(delaysHours: readonly number[]): DelaySummary {
	const sorted = delaysHours.filter((h) => Number.isFinite(h) && h >= 0).slice().sort((a, b) => a - b);
	return {
		count: sorted.length,
		p50Hours: round(percentile(sorted, 0.5)),
		p90Hours: round(percentile(sorted, 0.9)),
		maxHours: sorted.length === 0 ? 0 : round(sorted[sorted.length - 1]!),
		under24h: sorted.filter((h) => h < 24).length,
	};
}
