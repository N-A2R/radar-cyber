/**
 * Pure rules for the daily new-exposed-service detector.
 *
 * A "new service" is one row of `exposition_service` observed for the first
 * time. The first observation is stored in `first_seen_at` (never overwritten
 * by a refresh); the daily pass writes one append-only detection row with the
 * pass timestamp. Latency is `detected_at - first_seen_at`, so a daily pass
 * bounds it by 24 hours.
 *
 * Nothing here touches the database: the monitor passes real timestamps in,
 * and the measurement script can replay a window without changing the clock.
 */

/** Target: a new service is detected in less than one day. */
export const DETECTION_TARGET_HOURS = 24;
/** The measurement replay covers one full week of daily passes. */
export const DETECTION_WINDOW_DAYS = 7;

export type DetectionSample = {
	firstSeenAt: Date | string;
	detectedAt: Date | string;
};

export type DetectionLatency = {
	targetHours: number;
	count: number;
	p50Hours: number;
	p95Hours: number;
	maxHours: number;
	withinTarget: number;
	withinTargetPct: number;
};

/** Hours between first observation and the daily pass that recorded it. */
export function detectionLatencyHours(sample: DetectionSample): number {
	const first = Date.parse(String(sample.firstSeenAt));
	const detected = Date.parse(String(sample.detectedAt));
	if (!Number.isFinite(first) || !Number.isFinite(detected)) return 0;
	return Math.max(0, (detected - first) / 3_600_000);
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const position = q * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return (sorted[lower] ?? 0) + ((sorted[upper] ?? 0) - (sorted[lower] ?? 0)) * (position - lower);
}

/** p50/p95/max of a detection batch, and how many stayed under the target. */
export function summarizeDetectionLatency(
	samples: readonly DetectionSample[],
	options: { targetHours?: number } = {},
): DetectionLatency {
	const targetHours = options.targetHours ?? DETECTION_TARGET_HOURS;
	const values = samples.map(detectionLatencyHours).sort((a, b) => a - b);
	const withinTarget = values.filter((hours) => hours < targetHours).length;
	const round = (value: number): number => Number(value.toFixed(2));
	return {
		targetHours,
		count: values.length,
		p50Hours: round(quantile(values, 0.5)),
		p95Hours: round(quantile(values, 0.95)),
		maxHours: round(values.at(-1) ?? 0),
		withinTarget,
		withinTargetPct: values.length === 0 ? 0 : round((withinTarget / values.length) * 100),
	};
}
