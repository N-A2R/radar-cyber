/**
 * Builds benchmark cases from the frozen Nouvelle-Aquitaine corpus and the
 * real event metadata read at measurement time. Only identifiers and labels
 * are published; article text stays inside the process.
 */
import type { EvalCase } from "./binary-bench.js";
import type { FalseEventCaseInput, RelevanceCaseInput } from "./models.js";

export type CorpusLabel = "cyber" | "hors_sujet";

export interface CorpusItem {
  id: number;
  source: string;
  title: string;
  label: CorpusLabel;
}

export interface EventMetadata {
  id: number;
  orgId: number | null;
  regional: boolean;
}

export interface BuiltCases {
  relevance: EvalCase<RelevanceCaseInput>[];
  falseEvents: EvalCase<FalseEventCaseInput>[];
  matched: number;
}

/** Validates the frozen corpus without trusting its shape. */
export function parseCorpus(raw: unknown): CorpusItem[] {
  if (!raw || typeof raw !== "object" || !("items" in raw)) {
    throw new Error("Corpus is not an object with items");
  }
  const items = raw.items;
  if (!Array.isArray(items) || items.length === 0) throw new Error("Corpus has no items");
  return items.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Corpus item ${index} is not an object`);
    if (!("id" in entry) || !Number.isInteger(entry.id) || Number(entry.id) <= 0) {
      throw new Error(`Corpus item ${index} has an invalid id`);
    }
    if (!("titre" in entry) || typeof entry.titre !== "string" || entry.titre.trim().length === 0) {
      throw new Error(`Corpus item ${index} has no title`);
    }
    if (!("source" in entry) || typeof entry.source !== "string" || entry.source.trim().length === 0) {
      throw new Error(`Corpus item ${index} has no source`);
    }
    if (!("label" in entry) || (entry.label !== "cyber" && entry.label !== "hors_sujet")) {
      throw new Error(`Corpus item ${index} has an unknown label`);
    }
    return {
      id: Number(entry.id),
      source: entry.source,
      title: entry.titre,
      label: entry.label,
    };
  });
}

/** A regional anchor is an attached organisation or an explicit regional flag. */
export function hasNaAnchor(row: EventMetadata): boolean {
  return row.orgId !== null || row.regional;
}

/**
 * The relevance suite scores the text alone. The false-event suite adds the
 * real NA anchor: an anchored non-cyber event must be retained by the engine.
 * Items absent from the live database are excluded, not silently invented.
 */
export function buildCases(
  items: readonly CorpusItem[],
  rows: ReadonlyMap<number, EventMetadata>,
): BuiltCases {
  const relevance: EvalCase<RelevanceCaseInput>[] = [];
  const falseEvents: EvalCase<FalseEventCaseInput>[] = [];

  for (const item of items) {
    const row = rows.get(item.id);
    if (!row) continue;
    const cyber = item.label === "cyber";
    relevance.push({
      id: String(item.id),
      input: { title: item.title },
      expected: cyber ? "positive" : "negative",
    });
    falseEvents.push({
      id: String(item.id),
      input: { id: item.id, title: item.title, orgId: row.orgId, regional: row.regional },
      expected: cyber || hasNaAnchor(row) ? "positive" : "negative",
    });
  }

  return { relevance, falseEvents, matched: relevance.length };
}
