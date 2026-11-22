/**
 * Detection of presumed command-and-control servers hosted in Nouvelle-Aquitaine.
 *
 * A server is counted only when a public signal names a C2 capability AND
 * states that the infrastructure is hosted in an explicit Nouvelle-Aquitaine
 * locality. A foreign hosting location vetoes the detection: a C2 server in
 * the US targeting a Bordeaux victim is not a server hosted in the region.
 *
 * Only titles and claim hints are classified. No summary, TLP:RED body,
 * victim name, e-mail or phone number is read or published. Gray sources stay
 * eligible; no network call and no paid service take part.
 */
import { DEPT_LABELS, PREFECTURES } from "../collectors/relevance.js";

/** Shared by the SQL prefilter and the pure rule: one source of truth. */
export const C2_PATTERN = [
  "(?:^|[^a-z0-9])(?:c2|c&c|cnc|command[- ]and[- ]control|command[- ]&[- ]control|serveur de commande)(?:[^a-z0-9]|$)",
  "cobalt strike|teamserver|meterpreter|brute ratel|sliver c2",
].join("|");

const C2_RE = new RegExp(C2_PATTERN, "i");

/** Extra localities used by regional press, beyond departments and prefectures. */
const EXTRA_LOCALITIES = [
  "arcachon", "bayonne", "biarritz", "cognac", "saintes", "mont de marsan",
  "saint jean de luz", "royan", "marennes", "parthenay", "chatellerault",
].map((place) => fold(place));

const LOCALITIES: readonly string[] = [
  "nouvelle aquitaine",
  ...Object.values(DEPT_LABELS),
  ...PREFECTURES.map((place) => fold(place)),
  ...EXTRA_LOCALITIES,
].filter((place, index, all) => all.indexOf(place) === index);

const PLACE_ALTERNATIVES = [...LOCALITIES]
  .sort((a, b) => b.length - a.length)
  .map((place) => place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

/**
 * A hosting claim: a hosting/server word followed by an in-region place in
 * the same clause. Sentence stops cannot be crossed, so a victim mentioned in
 * a second clause never becomes a hosting location.
 */
const HOSTING_NA_RE = new RegExp(
  `(?:host(?:ed|ing|s)?|heberg(?:e|ee|er)?|located|based|deployed|operating|` +
    `infrastructure|server|serveur|site|situe)[^.!?;]{0,45}?\\b(?:in|on|at|en|au|aux|a|dans)\\s+` +
    `(?:the\\s+)?(${PLACE_ALTERNATIVES})\\b`,
  "i",
);

/** Explicit foreign hosting places veto an in-region interpretation. */
const FOREIGN_HOST_RE =
  /\b(?:in|on|en|au|aux)\s+(?:the\s+)?(?:us|usa|united states|american soil|iran|russia|china|uk|england|london|paris|lyon|marseille|toulouse|lille|nantes|rennes|brussels|germany|netherlands|ukraine|israel|india|singapore|canada|brazil)\b/i;

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** True when a text names a C2 capability (frameworks included). */
export function isC2Signal(text: string | null | undefined): boolean {
  if (!text) return false;
  return C2_RE.test(fold(text));
}

/** Returns the Nouvelle-Aquitaine locality of an explicit hosting claim. */
export function hostedInNa(text: string | null | undefined): string | null {
  if (!text) return null;
  const value = fold(text);
  if (FOREIGN_HOST_RE.test(value)) return null;
  return HOSTING_NA_RE.exec(value)?.[1] ?? null;
}

export type C2Candidate = {
  id: string | number;
  source: string;
  /** Title or claim hint only; summaries and TLP:RED bodies are never read. */
  text: string | null;
  family?: string | null;
  origin?: string;
};

export type C2Detection = {
  id: string;
  source: string;
  basis: "na-hosting";
  location: string;
};

/**
 * Classifies candidates into anonymized, source-attributed detections. One
 * candidate is counted at most once, even when repeated by a collector.
 */
export function detectC2Servers(candidates: readonly C2Candidate[]): C2Detection[] {
  const detections: C2Detection[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.family === "vuln") continue;
    if (!isC2Signal(candidate.text)) continue;
    const location = hostedInNa(candidate.text);
    if (location === null) continue;

    const origin = candidate.origin ?? "event";
    const key = `${origin}:${candidate.source}:${candidate.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    detections.push({
      id: `${origin}:${candidate.id}`,
      source: candidate.source,
      basis: "na-hosting",
      location,
    });
  }
  return detections;
}

/** Count of distinct presumed C2 servers hosted in Nouvelle-Aquitaine. */
export function countC2Servers(candidates: readonly C2Candidate[]): number {
  return detectC2Servers(candidates).length;
}
