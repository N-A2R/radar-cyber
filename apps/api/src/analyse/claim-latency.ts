/**
 * Replay of a bounded claim feed over a fixed publication window.
 *
 * The production collector polls on a fixed interval and keeps a bounded set
 * of claim keys, so a post published at any instant is accepted at the next
 * poll, even when it is older than the previous watermark or reordered. This
 * module computes that waiting time from real publication timestamps; it does
 * not touch the network or the database and has no dependency on the clock.
 *
 * It measures the latency our collector adds, not the upstream delay between
 * a group's announcement and the feed actually exposing the post.
 */

export type ReplayOptions = {
  /** Collector poll period in seconds, read from the collector itself. */
  intervalSec: number;
  /** Epoch ms of one real poll, used as the phase of the periodic schedule. */
  anchorMs: number;
  /** Target in hours; defaults to one hour. */
  targetHours?: number;
};

export type ReplaySummary = {
  count: number;
  /** Milliseconds until the next scheduled poll, in input order-independent order. */
  p50Minutes: number;
  p90Minutes: number;
  maxMinutes: number;
  withinTarget: number;
  withinTargetPct: number;
  intervalSec: number;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** Time from a publication instant to the next poll of a periodic schedule. */
export function nextPollDelayMs(publishedMs: number, options: ReplayOptions): number {
  const intervalMs = options.intervalSec * 1000;
  if (!Number.isFinite(publishedMs) || intervalMs <= 0) return NaN;
  const phase = ((publishedMs - options.anchorMs) % intervalMs + intervalMs) % intervalMs;
  return phase === 0 ? 0 : intervalMs - phase;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)));
  return sorted[index] ?? 0;
}

function minutes(ms: number): number {
  return Number((ms / MINUTE_MS).toFixed(2));
}

/** Summarise the waiting time of every publication in a replay window. */
export function summarizeReplay(publishedMs: readonly number[], options: ReplayOptions): ReplaySummary {
  const delays = publishedMs
    .map((value) => nextPollDelayMs(value, options))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const limitMs = (options.targetHours ?? 1) * HOUR_MS;
  const withinTarget = delays.filter((value) => value <= limitMs).length;
  return {
    count: delays.length,
    p50Minutes: minutes(quantile(delays, 0.5)),
    p90Minutes: minutes(quantile(delays, 0.9)),
    maxMinutes: minutes(delays.at(-1) ?? 0),
    withinTarget,
    withinTargetPct: delays.length === 0 ? 0 : Number(((withinTarget / delays.length) * 100).toFixed(1)),
    intervalSec: options.intervalSec,
  };
}
