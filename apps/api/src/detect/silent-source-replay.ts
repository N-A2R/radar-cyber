/** Offline replay of hourly silent-source checks. Pure: no database, no clock. */
import {
	HOUR_MS,
	detectSilentSource,
} from "./silent-source.js";

export const REPLAY_WINDOW_DAYS = 30;
export const REPLAY_CHECK_MS = HOUR_MS;
export const MIN_CONFIRMED_PAUSE_HOURS = 24;
/** Seuil calibré de `rule_calibration` (migration 200), pas le seuil historique de 12 h. */
export const REPLAY_THRESHOLD_HOURS = 14;


export type ProductionRow = { source_id: string; produced_at: string | Date };
export type SilentEpisode = {
	sourceId: string;
	lastProductionAt: number;
	detectedAt: number;
	delayHours: number;
};

/**
 * Replay the production detector on the hourly grid.
 *
 * One episode per last-production timestamp, measured from that timestamp to
 * the first hourly check that alerts. An episode counts only when the source
 * really stayed quiet for at least `MIN_CONFIRMED_PAUSE_HOURS`; a source that
 * resumed earlier was never silent in the product sense.
 */
export function replaySilentSourceEpisodes(
	production: readonly ProductionRow[],
	windowStart: number,
	anchor: number,
	thresholdHours: number = REPLAY_THRESHOLD_HOURS,
): SilentEpisode[] {
	const bySource = new Map<string, number[]>();
	for (const row of production) {
		const instant = Date.parse(String(row.produced_at));
		if (!Number.isFinite(instant)) continue;
		const times = bySource.get(row.source_id) ?? [];
		times.push(instant);
		bySource.set(row.source_id, times);
	}
	const signals = [...bySource].map(([sourceId, productionTimes]) => ({ sourceId, productionTimes }));
	const seen = new Set<string>();
	const episodes: SilentEpisode[] = [];

	for (let checkAt = windowStart; checkAt <= anchor; checkAt += REPLAY_CHECK_MS) {
		for (const signal of signals) {
			const alert = detectSilentSource(signal, checkAt, thresholdHours);
			if (!alert) continue;
			const key = `${signal.sourceId}|${alert.lastProductionAt}`;
			if (seen.has(key)) continue;
			seen.add(key);
			if (alert.lastProductionAt < windowStart) continue;

			const next = signal.productionTimes.find((t) => t > alert.lastProductionAt);
			const pauseEnd = Math.min(next ?? anchor, anchor);
			if ((pauseEnd - alert.lastProductionAt) / HOUR_MS < MIN_CONFIRMED_PAUSE_HOURS) continue;

			episodes.push({
				sourceId: signal.sourceId,
				lastProductionAt: alert.lastProductionAt,
				detectedAt: checkAt,
				delayHours: (checkAt - alert.lastProductionAt) / HOUR_MS,
			});
		}
	}
	return episodes;
}
