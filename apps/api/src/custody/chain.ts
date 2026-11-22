/**
 * Chain of custody — one event, every hand-off, with who/what/when.
 *
 * A chain is complete only when a Nouvelle-Aquitaine event carries its source,
 * an observation time, and an append-only journal fact naming the actor who
 * admitted it, the time the radar recorded it, and the proof behind it.
 * Projections (`event`) are fast reads; the journal is the audit authority.
 *
 * Pure code: no database, no HTTP, no clock. The API, the backfill CLI and the
 * measurement script all use the same rules, so a number cannot drift away
 * from what the screen claims.
 */

export type CustodyEvent = {
  dedupKey: string;
  family: string | null;
  title: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  observedAt: string | null;
  collectedAt: string | null;
  regional: boolean;
};

export type CustodyFact = {
  kind: string;
  actor: string;
  summary: string;
  payload: Record<string, unknown>;
  validAt: string | null;
  recordedAt: string | null;
};

/** Only these payload keys are ever shown outside the audit journal. */
const PROOF_KEYS = [
  "admissionRule",
  "assertionType",
  "collectedAt",
  "collector",
  "department",
  "family",
  "observedAt",
  "proof",
  "reconstructed",
  "regionalMotif",
  "sourceId",
  "sourceUrl",
] as const;

const ADMISSION_KINDS: Record<string, true> = {
  "event.admitted": true,
  "custody.seen": true,
};

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function iso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function proofKeys(payload: Record<string, unknown>): string[] {
  return PROOF_KEYS.filter((key) => {
    const value = payload[key];
    return value !== null && value !== undefined && value !== "";
  });
}

export type CustodyLink = {
  who: string;
  what: string;
  when: string | null;
  recordedAt: string | null;
  proof: string[];
};

export type CustodyChain = {
  subject: string;
  regional: boolean;
  complete: boolean;
  /** Machine-readable reasons; English by contract, never victim data. */
  missing: string[];
  source: string | null;
  sourceUrl: string | null;
  observedAt: string | null;
  links: CustodyLink[];
};

/**
 * Decide whether the chain is complete and project its facts for display.
 * An event outside Nouvelle-Aquitaine is never called complete: this radar's
 * custody promise is regional, and a global count would flatter it.
 */
export function evaluateCustody(event: CustodyEvent, facts: CustodyFact[]): CustodyChain {
  const missing: string[] = [];
  if (!event.regional) missing.push("outside-nouvelle-aquitaine");
  if (!filled(event.sourceId)) missing.push("source-missing");
  if (!filled(event.sourceUrl)) missing.push("source-url-missing");
  if (!filled(event.observedAt)) missing.push("observation-time-missing");

  const ordered = [...facts].sort((a, b) =>
    (a.recordedAt ?? "").localeCompare(b.recordedAt ?? "") || a.kind.localeCompare(b.kind),
  );
  const admission = ordered.filter((fact) => ADMISSION_KINDS[fact.kind] === true);
  if (admission.length === 0) missing.push("admission-fact-missing");
  else {
    if (!admission.some((fact) => filled(fact.actor))) missing.push("actor-missing");
    if (!admission.some((fact) => filled(fact.recordedAt))) missing.push("recorded-at-missing");
    if (!admission.some((fact) => proofKeys(fact.payload).length > 0)) missing.push("proof-missing");
  }

  const links = ordered.map((fact) => ({
    who: filled(fact.actor) ? fact.actor : "unknown",
    what: filled(fact.summary) ? fact.summary : fact.kind,
    when: iso(fact.validAt) ?? iso(event.observedAt),
    recordedAt: iso(fact.recordedAt),
    proof: proofKeys(fact.payload),
  }));

  return {
    subject: event.dedupKey,
    regional: event.regional,
    complete: missing.length === 0,
    missing,
    source: filled(event.sourceId) ? event.sourceId : null,
    sourceUrl: filled(event.sourceUrl) ? event.sourceUrl : null,
    observedAt: iso(event.observedAt),
    links,
  };
}
