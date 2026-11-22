/**
 * Automatic incident summaries for Nouvelle-Aquitaine.
 *
 * Pure, deterministic and offline: no LLM, no network call, no paid service.
 *
 * never invents a fact, never leaves a victim identifier in the output and
 * never accepts an incident outside the twelve Nouvelle-Aquitaine departments.
 *
 * Gray-area sources (leak listings, darknet markets, cyber-activist sites) are
 * accepted and labelled as such: they are evidence, not a reason to discard an
 * incident. Identifiers of private people are redacted before the summary is
 * returned; organisations (legal entities) are kept.
 */
import { naDepartmentCode } from "../geo/na-departments.js";

export const SUMMARY_MIN_WORDS = 25;
export const SUMMARY_MAX_WORDS = 80;
export const SUMMARY_TARGET_WORDS = 66;
export const SUMMARY_MAX_SENTENCES = 6;

/** Publishers whose provenance is gray rather than institutional/public. */
export const GRAY_SOURCE_HINTS: readonly string[] = [
  "ransomwatch",
  "ransomlook",
  "ransomware.live",
  "darknet",
  "leak",
  "breach",
  "cyberattaque",
  "paste",
  "forum",
  "market",
];

export type SourceKind = "public" | "gray";

export type IncidentInput = {
  id: string;
  organization: string;
  department: string;
  incidentDate: string | null;
  publishedAt: string | null;
  type: string;
  title: string;
  excerpt: string;
  source: string;
  /** Verified prose of the source article; the only prose the generator may use. */
  sourceText: string;
  /** Curated, vetted body of the same article; preferred when present. */
  verifiedText?: string;
};

export type IncidentSummary = {
  incidentId: string;
  headline: string;
  lead: string;
  sourceLabel: string;
  sourceKind: SourceKind;
  departmentCode: string;
  wordCount: number;
  redactions: number;
};

export class SummaryInputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SummaryInputError";
    this.code = code;
  }
}

const TYPE_LABELS: Readonly<Record<string, string>> = {
  ransomware: "Rançongiciel",
  fuite: "Fuite de données",
  phishing: "Hameçonnage",
  compromission: "Compromission",
  defacement: "Défiguration",
  escroquerie: "Escroquerie",
};

const IMPACT_TERMS: readonly string[] = [
  "attaque",
  "piratage",
  "fuite",
  "ranç",
  "ranc",
  "chiffre",
  "exfiltr",
  "données",
  "cnil",
  "plainte",
  "darknet",
  "victime",
  "compromis",
  "hameçonn",
  "phishing",
  "suspendu",
  "indisponible",
  "publication",
  "profils",
  "supprim",
];

const MONTHS: readonly string[] = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Accent-insensitive, case-insensitive alphanumeric key. */
export function normaliseKey(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Gray-area provenance is recorded, never silently trusted or discarded. */
export function sourceKind(source: string): SourceKind {
  const lowered = source.toLowerCase();
  return GRAY_SOURCE_HINTS.some((hint) => lowered.includes(hint)) ? "gray" : "public";
}

/** The region gate: an unknown or out-of-region department is a hard error. */
export function requireNouvelleAquitaine(department: string): string {
  const code = naDepartmentCode(department);
  if (!code) throw new SummaryInputError("outside-nouvelle-aquitaine", "department is not in Nouvelle-Aquitaine");
  return code;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+33[\s.-]?\d(?:[\s.-]?\d{2}){4}|0[1-9](?:[\s.-]?\d{2}){4})/g;
const NAMED_PERSON_RE = /\b(?:Mme|M\.|Monsieur|Madame|Dr|Pr)\s+[A-ZÀ-Ÿ][\p{L}'-]+(?:\s+[A-ZÀ-Ÿ][\p{L}'-]+)?/gu;
const BIRTHDATE_RE = /\b(?:n[ée]e?\s+le|date\s+de\s+naissance\s*:)\s*\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/gi;
/** A private person introduced by a job title, e.g. "Jean Dupont, le directeur". */
const PERSON_APPOSITION_RE = /\b[A-ZÀ-Ÿ][\p{L}'-]+(?:\s+[A-ZÀ-Ÿ][\p{L}'-]+){0,2}\s*,\s*(?:(?:le|la)\s+|l')(?:directeur|directrice|gérant|gérante|maire|président|présidente|responsable|salarié|salariée|employé|employée|témoin|victime)\b/giu;

/** Remove identifiers of private people, keeping the incident's facts. */
export function redactPersonalData(text: string): { text: string; count: number } {
  let count = 0;
  const clean = text
    .replace(EMAIL_RE, () => { count += 1; return "[redacted]"; })
    .replace(PHONE_RE, () => { count += 1; return "[redacted]"; })
    .replace(NAMED_PERSON_RE, () => { count += 1; return "[redacted]"; })
    .replace(PERSON_APPOSITION_RE, () => { count += 1; return "[redacted]"; })
    .replace(BIRTHDATE_RE, () => { count += 1; return "[redacted]"; });
  return { text: clean.replace(/[ \t]{2,}/g, " ").trim(), count };
}

/** Sentence boundaries that survive French abbreviations and decimal numbers. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ÿ«"“0-9])|(?<=[;:])\s+(?=[A-ZÀ-Ÿ«"“])/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12);
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function formatFrenchDate(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function scoreSentence(sentence: string, input: IncidentInput, verified: boolean): number {
  const key = normaliseKey(sentence);
  let score = 1;
  const orgKey = normaliseKey(input.organization).slice(0, 10);
  if (orgKey.length >= 4 && key.includes(orgKey)) score += 2;
  if (key.includes(normaliseKey(input.department))) score += 2;
  if (/\d/.test(sentence)) score += 2;
  const lowered = sentence.toLowerCase();
  let impacts = 0;
  for (const term of IMPACT_TERMS) if (lowered.includes(term)) impacts += 1;
  score += Math.min(impacts * 2, 8);
  if (verified) score += 4;
  if (wordCount(sentence) > 38) score -= 3;
  if (redactPersonalData(sentence).count > 0) score -= 4;
  return score;
}

/**
 * Build a short incident summary from verified material only.
 * The reference prose (`sourceText`) is the sole source of the lead sentences;
 * metadata (organisation, department, date, publisher) is added as structured
 * facts. Nothing else can enter the summary.
 */
export function summariseIncident(input: IncidentInput): IncidentSummary {
  const departmentCode = requireNouvelleAquitaine(input.department);
  if (!input.organization?.trim()) throw new SummaryInputError("missing-organization", "organization is required");
  if (!input.source?.trim()) throw new SummaryInputError("missing-source", "a publisher is required");

  const candidates: Array<{ index: number; sentence: string; score: number }> = [];
  const seen = new Set<string>();
  const curated = input.verifiedText ?? input.sourceText;
  // Raw excerpts are only added when they are not already part of the source
  // text; repeating them would inflate the lead without adding a single fact.
  const extras = [input.excerpt, input.title]
    .filter((value) => value && !curated.includes(value));
  const prose = [curated, ...extras].filter(Boolean).join(" ");
  const curatedCount = splitSentences(curated).length;
  splitSentences(prose).forEach((sentence, index) => {
    const key = normaliseKey(sentence);
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({ index, sentence, score: scoreSentence(sentence, input, index < curatedCount) });
  });
  if (candidates.length === 0) throw new SummaryInputError("missing-content", "no usable source sentence");

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const chosen: typeof candidates = [];
  let words = 0;
  for (const candidate of candidates) {
    const candidateWords = wordCount(candidate.sentence);
    if (chosen.length > 0 && (chosen.length >= SUMMARY_MAX_SENTENCES || words + candidateWords > SUMMARY_TARGET_WORDS)) continue;
    chosen.push(candidate);
    words += candidateWords;
    if (words >= SUMMARY_TARGET_WORDS || chosen.length >= SUMMARY_MAX_SENTENCES) break;
  }
  chosen.sort((a, b) => a.index - b.index);

  const date = formatFrenchDate(input.incidentDate ?? input.publishedAt);
  const labelled = `${date ? `Incident daté du ${date}. ` : ""}${chosen.map((item) => item.sentence).join(" ")}`;
  const redacted = redactPersonalData(labelled);
  const headline = redactPersonalData(
    `${input.organization.trim()} — ${TYPE_LABELS[input.type] ?? "Cyberincident"} — ${input.department.trim()}`,
  );

  return {
    incidentId: input.id,
    headline: headline.text,
    lead: redacted.text,
    sourceLabel: input.source.trim(),
    sourceKind: sourceKind(input.source),
    departmentCode,
    wordCount: wordCount(`${headline.text} ${redacted.text}`),
    redactions: redacted.count + headline.count,
  };
}
