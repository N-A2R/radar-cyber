/**
 * Declared objective of the official-statement aggregator.
 *
 * Pure module: no database, no network, no filesystem. The objective is the
 * published chantier figure — 13 official Nouvelle-Aquitaine statements for
 * ISO week 2026-W47 — and this module makes the declaration checkable without
 * replaying the collection.
 */
import type { WeeklyMeasurement } from "./store.js";

export const OBJECTIF_COMMUNIQUES = {
  week: "2026-W47",
  count: 13,
} as const;

export type ObjectiveCheck = {
  reached: boolean;
  value: number;
  target: number;
  week: string;
  line: string;
};

/** Produce the single normative OBJECTIF line used in the report and in --check output. */
export function checkObjective(measurement: Pick<WeeklyMeasurement, "weeks">): ObjectiveCheck {
  // Read the target ISO week, not the drifting "current week" of the measurement.
  const value = measurement.weeks.find((week) => week.week === OBJECTIF_COMMUNIQUES.week)?.count ?? 0;
  const { week, count: target } = OBJECTIF_COMMUNIQUES;
  const reached = value >= target;
  return {
    reached,
    value,
    target,
    week,
    line: `OBJECTIF : ${reached ? "atteint" : "partiel"} — ${value} / ${target} communiqués officiels collectés pour la semaine ${week}`,
  };
}

/** A published report must carry the exact declared line, not an older figure. */
export function checkReportDeclaration(markdown: string, expectedLine: string): boolean {
  return markdown.split("\n").some((line) => line.trim() === expectedLine);
}
