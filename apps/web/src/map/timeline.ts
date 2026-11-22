/**
 * Pure timeline helpers shared by the map scrubber, mock mode and tests.
 * Dates are UTC: the same month boundary must be used by the API, the UI and
 * the reproducible measurement.
 */
export type MapTimelineBucket = { key: string; from: string; to: string; count: number };

type Dated = { observedAt?: string | null };

/** PostgreSQL returns `2026-11-21 15:00:00+01`; Date.parse rejects that form. */
export function parseEventTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const normalized = value.trim()
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00")
    .replace(/(T\d{2}:\d{2}:\d{2})$/, "$1Z");
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

export function bucketBounds(key: string): { from: number; to: number } | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return null;
  const [year, month] = key.split("-").map(Number);
  const from = Date.UTC(year!, month! - 1, 1);
  const to = Date.UTC(year!, month!, 1);
  return { from, to };
}

/** Lower bound included, upper bound excluded - the same rule as the API. */
export function eventsInBucket<T extends Dated>(events: readonly T[], bucket: string): T[] {
  if (bucket === "all") return [...events];
  const bounds = bucketBounds(bucket);
  if (!bounds) return [];
  return events.filter((event) => {
    const time = parseEventTime(event.observedAt);
    return time !== null && time >= bounds.from && time < bounds.to;
  });
}

export function formatBucketLabel(key: string): string {
  const bounds = bucketBounds(key);
  if (!bounds) return key;
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(bounds.from));
}

/** Playback: from "all" to the first month, then forward, then stop. */
export function advanceBucket(buckets: readonly MapTimelineBucket[], current: string): string | null {
  if (current === "all") return buckets[0]?.key ?? null;
  const index = buckets.findIndex((bucket) => bucket.key === current);
  if (index < 0 || index >= buckets.length - 1) return null;
  return buckets[index + 1]!.key;
}


/** Zero-filled rolling window, so an empty month is still a scrubber step. */
export function buildBuckets<T extends Dated>(events: readonly T[], months = 12, now = Date.now()): MapTimelineBucket[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const time = parseEventTime(event.observedAt);
    if (time === null) continue;
    const key = new Date(time).toISOString().slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const current = new Date(now);
  const basis = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1);
  return Array.from({ length: months }, (_, offset) => {
    const from = new Date(basis);
    from.setUTCMonth(from.getUTCMonth() - (months - 1 - offset));
    const to = new Date(from);
    to.setUTCMonth(to.getUTCMonth() + 1);
    const key = from.toISOString().slice(0, 7);
    return { key, from: from.toISOString(), to: to.toISOString(), count: counts.get(key) ?? 0 };
  });
}

/** Merge API counts into a fixed window; the API omits empty months. */
export function withEmptyBuckets(buckets: readonly MapTimelineBucket[], months = 12, now = Date.now()): MapTimelineBucket[] {
  const known = new Map(buckets.map((bucket) => [bucket.key, bucket.count]));
  return buildBuckets([], months, now).map((bucket) => ({
    ...bucket,
    count: known.get(bucket.key) ?? 0,
  }));
}
