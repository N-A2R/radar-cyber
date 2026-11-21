import type { JournalDecision } from "../api";
import { DECISION_UNSPECIFIED, type JournalFilters } from "./JournalListe";

/**
 * Pure filter: no mutation, original order preserved.
 * Actor = case-insensitive substring; decision = exact match
 * (empty or absent = no restriction); dates = inclusive bounds on the first
 * ten characters of the timestamp (YYYY-MM-DD).
 */
export function filterJournal(
  rows: JournalDecision[],
  filters: JournalFilters,
): JournalDecision[] {
  const actor = filters.actor?.toLowerCase() ?? "";
  const decision = filters.decision === DECISION_UNSPECIFIED ? null : filters.decision;
  const from = filters.from ?? "";
  const to = filters.to ?? "";

  return rows.filter((row) => {
    if (actor && !row.acteur.toLowerCase().includes(actor)) return false;
    if (decision !== undefined && decision !== "" && row.decision !== decision) return false;
    const day = row.horodatage.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}
