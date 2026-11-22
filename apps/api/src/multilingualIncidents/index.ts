/**
 * Pure language and scope rules for cyber incidents.
 *
 * No database, no network, no victim data. The detector scores exclusive
 * function words and a few strong phrases; an actor name such as "the
 * gentlemen" inside a French "revendiqué par" headline must not flip the
 * language to English. Ambiguous or evidence-free text stays undetermined.
 */

export type IncidentLanguage = "fr" | "en" | "de" | "nl" | "pl" | "oc" | "eu" | "und";
export type DetectedLanguage = Exclude<IncidentLanguage, "und">;

export const NON_FRENCH_LANGUAGES: readonly DetectedLanguage[] = ["en", "de", "nl", "pl", "oc", "eu"];
export const INCIDENT_ASSERTIONS: readonly string[] = ["confirmed_incident", "third_party_claim"];

/** INSEE codes of the twelve Nouvelle-Aquitaine departments. */
export const NA_DEPARTMENTS: Readonly<Record<string, true>> = {
  "16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
  "40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

/** Minimum share of the winning score over the runner-up to claim a language. */
export const MIN_CONFIDENCE = 0.25;
/** One function-word hit is never enough to label a headline. */
export const MIN_EVIDENCE = 2;

type WordMap = Readonly<Record<string, number>>;

const WORDS: Readonly<Record<DetectedLanguage, WordMap>> = {
  fr: {
    revendiqué: 2, revendiquée: 2, par: 1, dans: 1, pour: 1, avec: 1,
    une: 1, des: 1, les: 1, cette: 1, est: 1, sont: 1, été: 1, sur: 1,
    chez: 1, après: 1, selon: 1, fuite: 2, fuites: 2, vulnérabilité: 2,
    vulnérabilités: 2, attaque: 2, attaques: 2, données: 1, entreprise: 1,
  },
  en: {
    third: 1, party: 1, claim: 2, claims: 2, referencing: 2, organization: 1,
    organisation: 1, department: 1, breach: 2, breaches: 2, vulnerability: 1,
    vulnerabilities: 1, improper: 1, neutralization: 1, multiple: 1, products: 1,
    the: 1, this: 1, that: 1, with: 1, from: 1, was: 1, were: 1, has: 1,
    have: 1, report: 1, reports: 1, says: 1, update: 1, updates: 1, data: 1,
    incident: 1, incidents: 1, disclosed: 1, critical: 1,
  },
  de: {
    kritische: 2, kritischer: 2, sicherheitslücke: 2, sicherheitslücken: 2,
    verfügbar: 2, ausgenutzt: 2, angriffswelle: 2, weitere: 1, gegen: 1,
    und: 1, nicht: 1, für: 1, bei: 1, nach: 1,
  },
  nl: {
    kwetsbaarheid: 2, kwetsbaarheden: 2, verholpen: 2, misbruikt: 2,
    onmiddellijk: 2, mogelijk: 1, meerdere: 1, actief: 1, en: 1, van: 1,
    voor: 1, bij: 1, heeft: 1, zijn: 1,
  },
  pl: {
    podatności: 2, podatność: 2, aktualizacje: 2, aktualizacja: 2, krytyczna: 1,
    krytyczne: 1, luka: 2, luki: 2, wykryto: 2, oraz: 1, w: 1, dla: 1,
  },
  oc: {
    vulnerabilitat: 2, vulnerabilitats: 2, descubert: 2, descuberta: 2,
    occitània: 2, occitan: 2, una: 1, unas: 1, critica: 1, criticas: 1,
    estat: 1, es: 1, aquel: 1, aquela: 1, per: 1, amb: 1, segon: 1,
  },
  eu: {
    ahultasun: 2, ahultasunak: 2, aurkitu: 2, kritiko: 1, kritikoak: 1,
    zenbait: 2, zenbaitek: 2, dira: 1, da: 1, eta: 1, horren: 1,
    bidez: 1, euskara: 2, euskadi: 2,
  },
};

const PHRASES: ReadonlyArray<{ language: DetectedLanguage; pattern: RegExp; weight: number }> = [
  { language: "fr", pattern: /\brevendiqu[ée]+\s+par\b/i, weight: 4 },
  { language: "fr", pattern: /\b(?:dans|sur)\s+(?:le|la|les|une|des)\b/i, weight: 2 },
  { language: "en", pattern: /\bthird[- ]party\b.{0,80}\bclaim/i, weight: 4 },
  { language: "en", pattern: /\bdata breach\b|\bclaim referencing\b/i, weight: 3 },
  { language: "de", pattern: /\bsicherheitsl[üu]cken?\b/i, weight: 2 },
  { language: "nl", pattern: /\bkwetsbaarheden?\b/i, weight: 2 },
  { language: "pl", pattern: /\bpodatno[ść]ci?\b/i, weight: 2 },
  { language: "oc", pattern: /\bvulnerabilitats?\b/i, weight: 2 },
  { language: "eu", pattern: /\bahultasunak?\b/i, weight: 2 },
];

/** Tokens claimed by more than one language are dropped: they prove nothing. */
const EXCLUSIVE_WORDS: Readonly<Record<DetectedLanguage, WordMap>> = (() => {
  const owners = new Map<string, Array<{ language: DetectedLanguage; weight: number }>>();
  for (const language of Object.keys(WORDS) as DetectedLanguage[]) {
    for (const [raw, weight] of Object.entries(WORDS[language])) {
      const token = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const list = owners.get(token) ?? [];
      list.push({ language, weight });
      owners.set(token, list);
    }
  }
  const result = {} as Record<DetectedLanguage, Record<string, number>>;
  for (const language of Object.keys(WORDS) as DetectedLanguage[]) result[language] = {};
  for (const [token, claimed] of owners) {
    if (claimed.length !== 1) continue;
    result[claimed[0].language][token] = claimed[0].weight;
  }
  return result;
})();

export interface LanguageDetection {
  language: IncidentLanguage;
  scores: Readonly<Record<DetectedLanguage, number>>;
  confidence: number;
}

/** Language of a headline plus summary, or `und` when evidence is missing/tied. */
export function detectIncidentLanguage(text: string | null | undefined): LanguageDetection {
  const scores = {} as Record<DetectedLanguage, number>;
  for (const language of Object.keys(WORDS) as DetectedLanguage[]) scores[language] = 0;

  const normalised = String(text ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tokens = normalised.match(/[a-z]+/g) ?? [];
  for (const token of tokens) {
    for (const language of Object.keys(EXCLUSIVE_WORDS) as DetectedLanguage[]) {
      scores[language] += EXCLUSIVE_WORDS[language][token] ?? 0;
    }
  }
  for (const phrase of PHRASES) {
    const matches = String(text ?? "").match(new RegExp(phrase.pattern.source, "gi"));
    if (matches) scores[phrase.language] += phrase.weight * matches.length;
  }

  const ranked = (Object.keys(scores) as DetectedLanguage[]).sort((a, b) => scores[b] - scores[a]);
  const best = ranked[0];
  const second = ranked[1];
  const evidence = scores[best];
  if (evidence < MIN_EVIDENCE || scores[second] === evidence) {
    return { language: "und", scores, confidence: 0 };
  }
  return {
    language: best,
    scores,
    confidence: Number(((evidence - scores[second]) / evidence).toFixed(3)),
  };
}

/** True only for the two assertion types the product calls incidents. */
export function isIncident(assertionType: string | null | undefined): boolean {
  return typeof assertionType === "string" && INCIDENT_ASSERTIONS.includes(assertionType);
}

/** An event is in scope when it is flagged regional or anchored in an NA org. */
export function isInNouvelleAquitaine(event: {
  regional?: boolean | null;
  department?: string | null;
}): boolean {
  if (event.regional === true) return true;
  return typeof event.department === "string" && Object.hasOwn(NA_DEPARTMENTS, event.department.trim());
}

export interface IncidentRecord {
  id: number | string;
  title: string | null;
  summary?: string | null;
  assertion_type: string | null;
  regional?: boolean | null;
  department?: string | null;
}

export interface IncidentAnalysis {
  inScopeIncidents: number;
  nonFrenchIncidents: number;
  byLanguage: Record<string, number>;
  nonFrenchIds: Array<number | string>;
}

/** Counts in-scope incidents detected in a language other than French. */
export function analyseIncidents(records: Iterable<IncidentRecord>): IncidentAnalysis {
  const byLanguage: Record<string, number> = {};
  const nonFrenchIds: Array<number | string> = [];
  let inScopeIncidents = 0;
  for (const record of records) {
    if (!isIncident(record.assertion_type) || !isInNouvelleAquitaine(record)) continue;
    inScopeIncidents++;
    const fromTitle = detectIncidentLanguage(record.title);
    // Claim headlines carry the incident language; lean on the summary only
    // when the title has no reliable signal. Leak feeds attach English company
    // descriptions to French "revendiqué par" headlines.
    const detection = fromTitle.language !== "und" && fromTitle.confidence >= MIN_CONFIDENCE
      ? fromTitle
      : detectIncidentLanguage(`${record.title ?? ""} ${record.summary ?? ""}`);
    byLanguage[detection.language] = (byLanguage[detection.language] ?? 0) + 1;
    if (detection.language !== "und" && detection.language !== "fr" && detection.confidence >= MIN_CONFIDENCE) {
      nonFrenchIds.push(record.id);
    }
  }
  return {
    inScopeIncidents,
    nonFrenchIncidents: nonFrenchIds.length,
    byLanguage: Object.fromEntries(Object.entries(byLanguage).sort(([a], [b]) => a.localeCompare(b))),
    nonFrenchIds,
  };
}

/** Verdict used by the ingestion language gate; `event.langue` only accepts fr/en. */
export interface AdmissionVerdict {
  language: "fr" | "en";
  detected: IncidentLanguage;
  keep: boolean;
  confidence: number;
  basis: "title" | "title+summary";
}

/**
 * Language gate for an event before ingestion.
 *
 * The title carries the incident language: an English company description
 * attached to a French "revendiqué par" headline must not reject the event.
 * A title without enough evidence falls back to title plus summary.
 * Any detected language other than French is stored as English, the only
 * non-French value the current `event.langue` constraint accepts.
 */
export function incidentAdmissionVerdict(
  title: string | null | undefined,
  summary: string | null | undefined,
  allowed: ReadonlySet<string>,
): AdmissionVerdict {
  const fromTitle = detectIncidentLanguage(title);
  const detection = fromTitle.language !== "und"
    ? fromTitle
    : detectIncidentLanguage(`${title ?? ""} ${summary ?? ""}`);
  const language = detection.language === "fr" ? "fr" : "en";
  return {
    language,
    detected: detection.language,
    keep: allowed.has(language),
    confidence: detection.confidence,
    basis: fromTitle.language === "und" ? "title+summary" : "title",
  };
}
