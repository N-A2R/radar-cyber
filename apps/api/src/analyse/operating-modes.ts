/**
 * Deterministic clustering of observed operating modes (modus operandi).
 *
 * A mode is a *technique signature*, not an actor, a victim or a campaign.
 * Two incidents committed by different actors with the same observable method
 * belong to the same mode; two claims by one actor using different methods do
 * not. The signature has two parts: a technique and a variant drawn from
 * structured evidence (CVSS vector, disclosure marker). Rules are ordered and
 * the first match wins, so a result is reproducible without a model or a
 * network call.
 *
 * Only non-personal fields are read. No title, URL, organisation name, person
 * name or victim identity is ever copied into a mode: modes carry counts and
 * technique labels only.
 *
 * Scope is decided by the caller's `regional` flag, the canonical
 * Nouvelle-Aquitaine gate already stored on each event. Grey sources (leak
 * sites, onion trackers, Telegram feeds, paste sites) are admitted on the same
 * footing as official ones; a source is never trusted by name.
 */

export type ModeEvent = {
  id: number;
  family: string;
  assertionType: string;
  title: string;
  evidence: Record<string, unknown>;
  sourceId: string;
  /** Canonical Nouvelle-Aquitaine scope carried by the event row. */
  regional: boolean;
};

export type Mode = {
  /** `technique:variant`, stable across runs and input order. */
  key: string;
  technique: string;
  variant: string;
  /** English, human readable label. */
  label: string;
  events: number;
  sources: number;
};

export type ModeAnalysis = {
  scanned: number;
  regional: number;
  classified: number;
  unclassified: number;
  /** Modes sorted by descending event count, then by key. */
  modes: Mode[];
  /** The measured objective: number of distinct modes identified. */
  count: number;
};

const LABELS: Readonly<Record<string, string>> = {
  "ransomware-extortion:publication": "Ransomware extortion with data publication",
  "ransomware-extortion:claim": "Ransomware extortion claim",
  "data-leak:publication": "Data leak publication",
  "credential-phishing:harvesting": "Credential phishing",
  "typosquatting:lookalike-domain": "Typosquatting with lookalike domain",
  "supply-chain:third-party": "Supply chain compromise",
  "service-disruption:availability": "Service disruption",
  "web-defacement:content-replacement": "Web defacement",
  "vulnerability-exposure:unauthenticated-remote": "Unauthenticated remote vulnerability exploitation",
  "vulnerability-exposure:authenticated-remote": "Authenticated remote vulnerability exploitation",
  "vulnerability-exposure:user-interaction": "Vulnerability exploitation requiring user interaction",
  "vulnerability-exposure:local-access": "Local vulnerability exploitation",
  "vulnerability-exposure:scope-change": "Scope-changing vulnerability exploitation",
  "vulnerability-exposure:unspecified-vector": "Vulnerability exploitation with incomplete CVSS vector",
  "vulnerability-exposure:advisory": "Vulnerability exposure reported by an advisory",
  "vulnerability-exposure:reported": "Vulnerability exposure reported by news",
};

const TECHNIQUES: ReadonlyArray<{ name: string; pattern: RegExp; variant: string }> = [
  { name: "credential-phishing", pattern: /\b(phish(?:ing|ed)?|hame[çc]onnage|credential harvesting|vol d'identifiants|fake login|device code phishing)\b/i, variant: "harvesting" },
  { name: "typosquatting", pattern: /\b(typosquat(?:ting)?|lookalike domain|domain impostor|nom de domaine trompeur)\b/i, variant: "lookalike-domain" },
  { name: "supply-chain", pattern: /\b(supply[- ]chain|third[- ]party (?:breach|compromise|vendor)|compromised (?:supplier|vendor|extension)|fournisseur (?:compromis|pirat[ée]))\b/i, variant: "third-party" },
  { name: "service-disruption", pattern: /\b(ddos|denial of service|d[ée]ni de service|sites? inaccessibles|service (?:outage|disruption|interruption)|indisponible)\b/i, variant: "availability" },
  { name: "web-defacement", pattern: /\b(defacement|d[ée]face(?:ment|c[ée])|page (?:d[ée]figur[ée]|hacked)|site (?:pirat[ée]|d[ée]figur[ée]))\b/i, variant: "content-replacement" },
  { name: "data-leak", pattern: /\b(data breach|data leak|fuite de donn[ée]es|fuite massive|exfiltr(?:ation|er)|vol de donn[ée]es|leaked database)\b/i, variant: "publication" },
  { name: "vulnerability-exposure", pattern: /\b(vuln[ée]rabilit[ée]s?|vulnerabilit(?:y|ies)|faille de s[ée]curit[ée]|zero[- ]day|CVE-\d{4}-\d+)\b/i, variant: "reported" },
];

const RANSOMWARE_FAMILIES: Readonly<Record<string, true>> = { ransomware: true };
const ADVISORY_FAMILIES: Readonly<Record<string, true>> = { vuln: true, cert: true, cert_fr: true };

/** CVSS v2/v3/v4 metrics, normalised to uppercase keys and values. */
function cvssMetrics(evidence: Record<string, unknown>): Map<string, string> {
  const raw = evidence.vectorString;
  const metrics = new Map<string, string>();
  if (typeof raw !== "string") return metrics;
  for (const part of raw.split("/")) {
    const [key, value] = part.split(":");
    if (key && value) metrics.set(key.toUpperCase(), value.toUpperCase());
  }
  return metrics;
}

/** Access profile of a vulnerability, from the vector only — never from the title. */
function vulnerabilityVariant(event: ModeEvent, reported: boolean): string {
  const metrics = cvssMetrics(event.evidence);
  if (metrics.size === 0) return reported ? "reported" : "advisory";
  if (metrics.get("S") === "C") return "scope-change";
  const av = metrics.get("AV");
  if (av === "L" || av === "P") return "local-access";
  if (metrics.get("UI") === "R") return "user-interaction";
  if (metrics.get("PR") === "N") return "unauthenticated-remote";
  if (av === "N") return "authenticated-remote";
  return "unspecified-vector";
}

/** Ordered rules; a null result is *unclassified*, never a mode of its own. */
export function signatureOf(event: ModeEvent): { technique: string; variant: string } | null {
  const grouped =
    RANSOMWARE_FAMILIES[event.family] === true ||
    (typeof event.evidence.group === "string" && event.evidence.group.trim().length > 0);
  if (grouped) {
    return {
      technique: "ransomware-extortion",
      variant: /\b\d+\s*%|<\s*1\s*%|disclos|divulgu/i.test(event.title) ? "publication" : "claim",
    };
  }
  if (event.family === "leaks") return { technique: "data-leak", variant: "publication" };
  for (const rule of TECHNIQUES) {
    if (!rule.pattern.test(event.title)) continue;
    if (rule.name === "vulnerability-exposure") {
      return { technique: rule.name, variant: vulnerabilityVariant(event, true) };
    }
    return { technique: rule.name, variant: rule.variant };
  }
  const raw = event.evidence.vectorString;
  if (typeof raw === "string" || ADVISORY_FAMILIES[event.family] === true) {
    return { technique: "vulnerability-exposure", variant: vulnerabilityVariant(event, false) };
  }
  return null;
}

/**
 * Clusters regional events by technique signature.
 *
 * Input order does not change the result: modes are sorted at the end and
 * their counts come from Sets of event ids and source ids.
 */
export function clusterOperatingModes(events: readonly ModeEvent[]): ModeAnalysis {
  const regionalEvents = events.filter((event) => event.regional);
  const clusters = new Map<string, { ids: Set<number>; sources: Set<string> }>();
  let unclassified = 0;

  for (const event of regionalEvents) {
    const signature = signatureOf(event);
    if (signature === null) {
      unclassified += 1;
      continue;
    }
    const key = `${signature.technique}:${signature.variant}`;
    const cluster = clusters.get(key) ?? { ids: new Set<number>(), sources: new Set<string>() };
    cluster.ids.add(event.id);
    cluster.sources.add(event.sourceId);
    clusters.set(key, cluster);
  }

  const modes = [...clusters.entries()]
    .map(([key, cluster]) => {
      const colon = key.indexOf(":");
      const technique = key.slice(0, colon);
      const variant = key.slice(colon + 1);
      return {
        key,
        technique,
        variant,
        label: LABELS[key] ?? `${technique.replace(/-/g, " ")} (${variant.replace(/-/g, " ")})`,
        events: cluster.ids.size,
        sources: cluster.sources.size,
      };
    })
    .sort((a, b) => b.events - a.events || a.key.localeCompare(b.key, "en"));

  return {
    scanned: events.length,
    regional: regionalEvents.length,
    classified: regionalEvents.length - unclassified,
    unclassified,
    modes,
    count: modes.length,
  };
}
