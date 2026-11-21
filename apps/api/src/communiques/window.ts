import type { OfficialStatement } from "./model.js";

/** ISO week label, e.g. 2026-W48. Monday is the first day of the week. */
export function isoWeek(value: Date): string {
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Rolling window ending at `now`. A date in the future is not a collected
 * publication and is rejected instead of inflating the weekly counter.
 */
export function isInWindow(publishedAt: Date, now: Date, days: number): boolean {
  const time = publishedAt.getTime();
  return Number.isFinite(time) && time <= now.getTime() && time >= now.getTime() - days * 86400000;
}

export function inWindow(items: OfficialStatement[], now: Date, days: number): OfficialStatement[] {
  return items.filter((item) => isInWindow(item.publishedAt, now, days));
}
