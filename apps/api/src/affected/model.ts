/**
 * "Am I affected?" assistant — evidence-first view of one organization.
 *
 * Private deployment (data level 4): each observation statement carries the
 * recorded raw source payload. Titles, summaries and evidence JSON are copied
 * verbatim; no redaction is applied to them. Structured labels and values stay
 * derived from known fields so the rest of the screen remains readable.
 *
 * Pure module: no database, no network, no clock. Deterministic for a given
 * organization and set of observations, so the measurement can replay it.
 */

/** The twelve departments of Nouvelle-Aquitaine (canonical INSEE codes). */
export const NA_DEPARTMENTS: Readonly<Record<string, true>> = {
  "16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
  "40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

export type Organization = {
  id: number;
  name: string;
  slug: string;
  kind: string;
  sector: string | null;
  city: string | null;
  dept: string | null;
  siren: string | null;
  entityCode: string | null;
  entitySource: string | null;
  geoSource: string | null;
  domain: string | null;
  website: string | null;
  validFrom: string | null;
};

export type Observation = {
  id: number;
  family: string;
  assertionType: string;
  observedAt: string | null;
  sourceId: string;
  sourceUrl: string | null;
  title: string | null;
  summary: string | null;
  evidence: Record<string, unknown> | null;
  regional: boolean;
};

export type EvidenceKind = "registry" | "observation" | "claim";
export type EvidenceStatus = "official-record" | "reported" | "unverified-claim";

export type Evidence = {
  kind: EvidenceKind;
  /** Publisher or register which carries the statement. */
  label: string;
  /** Stable identifier inside that publisher (SIREN, event id, ...). */
  reference: string;
  /** Public, query-free URL when the observation has one. */
  url: string | null;
  status: EvidenceStatus;
};

export type StatementCategory = "identity" | "location" | "activity" | "incident" | "claim";

export type Statement = {
  id: string;
  category: StatementCategory;
  /** English UI label. */
  label: string;
  /** Non-personal value; free text from observations is never copied here. */
  value: string;
  observedAt: string | null;
  evidence: Evidence;
  /** Level 4: verbatim source payload, present on observation statements. */
  raw?: {
    title: string | null;
    summary: string | null;
    sourceUrl: string | null;
    evidence: Record<string, unknown> | null;
  };
};

export type AffectedReport = {
  organization: {
    id: number;
    name: string;
    department: string | null;
    region: "Nouvelle-Aquitaine";
  };
  scope: "nouvelle-aquitaine";
  statements: Statement[];
  summary: {
    statements: number;
    withEvidence: number;
    sources: number;
  };
  /** English limitations, rendered verbatim in the interface. */
  limitations: string[];
};

export class OutsideRegionError extends Error {
  constructor(department: string | null) {
    super(`organization outside Nouvelle-Aquitaine (department: ${department ?? "unknown"})`);
    this.name = "OutsideRegionError";
  }
}

const LIMITATIONS: readonly string[] = [
  "Claims from leak sites and ransomware trackers are reports, not confirmed incidents.",
  "No statement means no recorded evidence, not proof that nothing happened.",
];

/** Labels derived from structured fields only; titles are never read. */
const OBSERVATION_LABELS: Record<string, string> = {
  "ransomware:third_party_claim": "Ransomware extortion claim",
  "ransomware:ambient_signal": "Ransomware-related report",
  "vuln:confirmed_incident": "Confirmed security incident involving a vulnerability",
  "vuln:technical_indicator": "Technical vulnerability indicator",
  "vuln:ambient_signal": "Vulnerability advisory",
  "leaks:ambient_signal": "Data-leak publication report",
  "paste:ambient_signal": "Paste-site publication report",
  "presse_cyber:ambient_signal": "Cybersecurity press report",
  "presse_locale:ambient_signal": "Local press report",
  "cert:ambient_signal": "Security advisory",
  "cert_fr:ambient_signal": "National security advisory",
};

const GREY_FAMILIES: Readonly<Record<string, true>> = {
  ransomware: true, leaks: true, paste: true, onion: true,
};

/**
 * Veille de presse locale : un fait régional, jamais un incident. Il reste
 * affichable quand une organisation est nommée, mais sa catégorie ne doit pas
 * le faire passer pour un incident confirmé ou revendiqué.
 */
const LOCAL_PRESS_FAMILIES: Readonly<Record<string, true>> = {
  presse_locale: true,
};

/** Emails and French phone numbers must never reach the interface. */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<!\d)(?:\+?33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g;

export function safeText(value: unknown, maxLength = 180): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(EMAIL, "[redacted]")
    .replace(PHONE, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length === 0 ? null : cleaned.slice(0, maxLength);
}

/** Keep the verifiable part of a URL; drop query strings and fragments. */
export function proofUrl(value: unknown): string | null {
  const raw = safeText(value, 500);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return null;
  }
}

function displaySource(value: string | null): string | null {
  if (!value) return null;
  return safeText(value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), 80);
}

function registryEvidence(org: Organization): Evidence {
  if (org.entitySource && org.entityCode) {
    return {
      kind: "registry",
      label: displaySource(org.entitySource) ?? "Public register",
      reference: `${org.entitySource}:${org.entityCode}`,
      url: null,
      status: "official-record",
    };
  }
  if (org.siren) {
    return {
      kind: "registry",
      label: "Sirene register",
      reference: `SIREN ${org.siren}`,
      url: null,
      status: "official-record",
    };
  }
  return {
    kind: "registry",
    label: "Geographic register",
    reference: `${org.geoSource}:${org.id}`,
    url: null,
    status: "official-record",
  };
}

function registryStatements(org: Organization): Statement[] {
  const out: Statement[] = [];
  const registry = registryEvidence(org);
  const name = safeText(org.name);
  if (name) {
    out.push({
      id: "registry:name",
      category: "identity",
      label: "Registered name",
      value: name,
      observedAt: safeText(org.validFrom),
      evidence: registry,
    });
  }
  const activity = safeText(org.sector) ?? safeText(org.kind);
  if (activity) {
    out.push({
      id: "registry:activity",
      category: "activity",
      label: "Recorded activity",
      value: activity,
      observedAt: null,
      evidence: registry,
    });
  }
  const city = safeText(org.city);
  if (city || org.dept) {
    out.push({
      id: "registry:location",
      category: "location",
      label: "Registered location in Nouvelle-Aquitaine",
      value: city ? `${city} (${org.dept})` : `department ${org.dept}`,
      observedAt: null,
      evidence: org.geoSource
        ? {
            kind: "registry",
            label: displaySource(org.geoSource) ?? "Geographic register",
            reference: `${org.geoSource}:${org.id}`,
            url: null,
            status: "official-record",
          }
        : registry,
    });
  }
  if (org.domain) {
    out.push({
      id: "registry:domain",
      category: "identity",
      label: "Recorded website",
      value: safeText(org.domain, 200) ?? org.domain,
      observedAt: null,
      evidence: registry,
    });
  }
  return out;
}

function observationStatement(event: Observation): Statement | null {
  const label =
    OBSERVATION_LABELS[`${event.family}:${event.assertionType}`] ??
    OBSERVATION_LABELS[event.family] ??
    safeText(event.family, 80);
  if (!label) return null;
  const grey = GREY_FAMILIES[event.family] === true;
  const localPress = LOCAL_PRESS_FAMILIES[event.family] === true;
  return {
    id: `event:${event.id}`,
    category: grey ? "claim" : localPress ? "activity" : "incident",
    label,
    // Structured label only: title and summary stay in `raw`, unmodified.
    value: label,
    observedAt: safeText(event.observedAt),
    evidence: {
      kind: grey ? "claim" : "observation",
      label: displaySource(event.sourceId) ?? "Unnamed source",
      reference: `event:${event.id}`,
      url: proofUrl(event.sourceUrl),
      status: grey ? "unverified-claim" : "reported",
    },
    raw: {
      title: event.title,
      summary: event.summary,
      sourceUrl: event.sourceUrl,
      evidence: event.evidence,
    },
  };
}

/** True when a statement names both a publisher and a stable reference. */
export function hasVerifiableEvidence(statement: Statement): boolean {
  const { label, reference } = statement.evidence;
  return label.trim().length > 0 && reference.trim().length > 0;
}

/**
 * Build the report. Any organization outside Nouvelle-Aquitaine is rejected:
 * the assistant does not answer questions about other regions.
 */
export function buildAffectedReport(org: Organization, observations: readonly Observation[] = []): AffectedReport {
  if (!org.dept || NA_DEPARTMENTS[org.dept] !== true) throw new OutsideRegionError(org.dept);

  const sorted = [...observations].sort((a, b) => {
    const dateOrder = (b.observedAt ?? "").localeCompare(a.observedAt ?? "");
    return dateOrder !== 0 ? dateOrder : b.id - a.id;
  });
  const statements = [
    ...registryStatements(org),
    ...sorted.map(observationStatement).filter((s): s is Statement => s !== null),
  ];
  const sources = new Set(statements.map((s) => s.evidence.label));

  return {
    organization: {
      id: org.id,
      name: safeText(org.name) ?? "Unnamed organization",
      department: org.dept,
      region: "Nouvelle-Aquitaine",
    },
    scope: "nouvelle-aquitaine",
    statements,
    summary: {
      statements: statements.length,
      withEvidence: statements.filter(hasVerifiableEvidence).length,
      sources: sources.size,
    },
    limitations: [...LIMITATIONS],
  };
}
