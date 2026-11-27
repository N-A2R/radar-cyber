/**
 * Provenance gate — the blocking rule used by CI.
 *
 * Pure code: no database, no HTTP, no clock. The committed measurement
 * artifact is re-evaluated entry by entry with the same custody rule the API,
 * the repair CLI and the measurement use. A gate passes only when every
 * Nouvelle-Aquitaine fact of the measured real state carries a complete
 * chain, and when the artifact still describes that state.
 *
 * The ledger carries source metadata, actors, recording clocks and proof
 * keys only. Event titles, journal summaries and victim identifiers are
 * rejected by the gate and never enter a committed artifact.
 */
import { evaluateCustody, PROOF_KEYS, type CustodyEvent, type CustodyFact } from "./chain.js";

export const PROVENANCE_SCOPE = "nouvelle-aquitaine";

export type ProvenanceContext = "real" | "ci-fixture";

export const PROVENANCE_CONTEXTS = ["real", "ci-fixture"] as const;

export type ProvenanceState = {
  organisations: number;
  sources: number;
  events: number;
};

/** Real state measured on 2026-11-22 before the gate was written. */
export const REAL_STATE: Readonly<ProvenanceState> = Object.freeze({
  organisations: 1_673_151,
  sources: 312,
  events: 26_259,
});

/**
 * Disposable CI state: schema, migrations and the single deterministic
 * Nouvelle-Aquitaine fixture in `db/fixtures/provenance-ci.sql`. This is a
 * second pinned state, not a looser rule: the same custody chain, scope and
 * summary checks apply, and only an explicitly requested `ci-fixture` run can
 * use these counts.
 */
export const CI_FIXTURE_STATE: Readonly<ProvenanceState> = Object.freeze({
  organisations: 30,
  sources: 2_759,
  events: 340,
});

export function expectedState(context: ProvenanceContext): Readonly<ProvenanceState> {
  return context === "ci-fixture" ? CI_FIXTURE_STATE : REAL_STATE;
}

export type ProvenanceEntry = {
  event: CustodyEvent;
  facts: CustodyFact[];
};

export type ProvenanceArtifact = {
  definition: string;
  scope: string;
  /** State the measurement targeted; an absent value means the real state. */
  context?: ProvenanceContext;
  generatedAt: string;
  organisations: number;
  sources: number;
  events: number;
  regionalEvents: number;
  complete: number;
  withoutProvenance: number;
  rate: number;
  gaps: Record<string, number>;
  entries: ProvenanceEntry[];
};

export type ProvenanceVerdict = {
  ok: boolean;
  checked: number;
  withoutProvenance: string[];
  reasons: string[];
};

function sortedCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts ?? {}).sort(([a], [b]) => a.localeCompare(b)));
}

function sanitized(entry: ProvenanceEntry): boolean {
  if (entry.event.title !== null && entry.event.title !== undefined && entry.event.title !== "") return false;
  return entry.facts.every((fact) =>
    (fact.summary === "" || fact.summary === null || fact.summary === undefined) &&
    Object.keys(fact.payload ?? {}).every((key) => (PROOF_KEYS as readonly string[]).includes(key)),
  );
}

/**
 * Recompute the verdict from the ledger instead of trusting a stored number.
 * Every refusal reason is a stable English code, never a fact about a victim.
 * `context` is supplied by the caller, never by the ledger alone, so a fresh
 * measurement cannot declare its own expected state to pass the gate.
 */
export function evaluateProvenanceGate(
  artifact: ProvenanceArtifact,
  context: ProvenanceContext = "real",
): ProvenanceVerdict {
  const reasons: string[] = [];
  const withoutProvenance: string[] = [];
  const gaps: Record<string, number> = {};
  const expected = expectedState(context);

  if ((artifact.context ?? "real") !== context) reasons.push("context-mode-mismatch");
  if (artifact.scope !== PROVENANCE_SCOPE) reasons.push("wrong-scope");
  if (
    artifact.organisations !== expected.organisations ||
    artifact.sources !== expected.sources ||
    artifact.events !== expected.events
  ) reasons.push("context-mismatch");
  if (!Number.isInteger(artifact.regionalEvents) || artifact.regionalEvents <= 0) reasons.push("empty-scope");
  if (artifact.entries.length !== artifact.regionalEvents) reasons.push("ledger-truncated");

  let complete = 0;
  for (const entry of artifact.entries) {
    if (!sanitized(entry)) reasons.push("unsanitized-ledger");
    const chain = evaluateCustody(entry.event, entry.facts);
    if (chain.complete) {
      complete += 1;
      continue;
    }
    withoutProvenance.push(chain.subject);
    for (const reason of chain.missing) gaps[reason] = (gaps[reason] ?? 0) + 1;
  }

  const expectedRate = artifact.entries.length === 0
    ? 0
    : Math.round((complete / artifact.entries.length) * 10000) / 100;
  if (
    complete !== artifact.complete ||
    withoutProvenance.length !== artifact.withoutProvenance ||
    expectedRate !== artifact.rate ||
    JSON.stringify(sortedCounts(gaps)) !== JSON.stringify(sortedCounts(artifact.gaps))
  ) reasons.push("summary-mismatch");

  for (const reason of Object.keys(gaps).sort()) reasons.push(`fact:${reason}`);
  return { ok: reasons.length === 0, checked: artifact.entries.length, withoutProvenance, reasons };
}
