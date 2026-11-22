/**
 * Press-only incidents — a deterministic reading of the verified Nouvelle-Aquitaine corpus.
 *
 * The corpus labels each incident with a trust level: `etabli` (the victim or an
 * authority confirmed it), `declare` (an unconfirmed attacker claim) and
 * `rapporte` (reported by the press alone). This module counts the third group,
 * restricted to Nouvelle-Aquitaine, and never exposes victim names or free text.
 *
 * No network, no paid service, no database query: the source of truth is the
 * versioned corpus, whose every row has a public, re-verifiable citation.
 */

export const NA_DEPARTMENTS = [
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

const NA_SET = new Set<string>(NA_DEPARTMENTS);

export type PublisherKind = "press" | "grey" | "official" | "unknown";

export type CorpusIncident = {
  id: string;
  departement: string;
  confiance: string;
  datePublique?: string | null;
  type?: string;
  preuve?: { editeur?: string | null };
  sourcesAdditionnelles?: readonly { editeur?: string | null }[];
  /** Deliberately never read by the projection below. */
  entite?: string;
  resume?: string;
  verification?: string;
};

export type PressOnlyIncident = {
  id: string;
  department: string;
  publicationDate: string | null;
  publisherKind: PublisherKind;
  incidentType: string | null;
};

export type PressOnlySummary = {
  scope: "Nouvelle-Aquitaine";
  definition: "rapporte";
  corpusTotal: number;
  count: number;
  withGreySource: number;
  byDepartment: { department: string; count: number }[];
  byPublisherKind: { press: number; grey: number };
  incidents: PressOnlyIncident[];
};

const OFFICIAL_MARKERS = [
  "communiqué", "communique", "ville de", "mairie", "communauté de communes",
  "conseil départemental", "conseil regional", "région nouvelle-aquitaine",
  "université", "universite", "institut", "chu ", "centre hospitalier",
  "hopital", "hôpital", "ars ", "cnil", "fédération", "federation",
  "unss", "unsa", "ministère", "ministere", "cegedim", "ffrandonnée",
  "communiqué officiel",
];

/** Grey but public publishers are accepted as press evidence, never as confirmation. */
const GREY_MARKERS = [
  "zataz", "clubic", "cyberattaque.org", "frenchbreaches", "tntic",
  "cyber breaches", "ransomlook", "leaksite",
];

const PRESS_MARKERS = [
  "sud ouest", "france 3", "franceinfo", "france info", "ici ", "actu.fr",
  "ouest-france", "nouvelle république", "nouvelle republique",
  "charente libre", "dépêche", "depeche", "démocrate", "democrate",
  "bouger à bordeaux", "bouger a bordeaux", "littoral", "nice-matin",
  "populaire du centre", "le figaro", "rtl", "tf1", "république des pyrénées",
  "republique des pyrenees", "la montagne", "le parisien", "20 minutes",
];

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en");
}

/** One publisher, one kind. Official confirmation is never inferred from prose. */
export function classifyPublisher(publisher: string | null | undefined): PublisherKind {
  if (!publisher) return "unknown";
  const name = fold(publisher);
  if (OFFICIAL_MARKERS.some((marker) => name.includes(fold(marker)))) return "official";
  if (GREY_MARKERS.some((marker) => name.includes(fold(marker)))) return "grey";
  if (PRESS_MARKERS.some((marker) => name.includes(fold(marker)))) return "press";
  return "unknown";
}

function publishers(incident: CorpusIncident): string[] {
  return [
    incident.preuve?.editeur,
    ...(incident.sourcesAdditionnelles ?? []).map((source) => source.editeur),
  ].filter((name): name is string => typeof name === "string" && name.trim().length > 0);
}

/** Shared evidence list for the claim detector; never derived from prose. */
export const corpusPublishers = publishers;

/** A press-only incident: `rapporte`, inside NA, with press/grey evidence and no official publisher. */
export function isPressOnly(incident: CorpusIncident): boolean {
  if (incident.confiance !== "rapporte") return false;
  if (!NA_SET.has(incident.departement)) return false;
  const kinds = publishers(incident).map(classifyPublisher);
  if (kinds.length === 0 || kinds.includes("official")) return false;
  return kinds.includes("press") || kinds.includes("grey");
}

/**
 * Counts and projects the press-only incidents. Duplicate ids are collapsed:
 * a corpus row is one verified event, not one article.
 */
export function detectPressOnly(incidents: readonly CorpusIncident[]): PressOnlySummary {
  const seen = new Set<string>();
  const rows: PressOnlyIncident[] = [];
  const byDepartment = new Map<string, number>();
  const byPublisherKind = { press: 0, grey: 0 };
  let withGreySource = 0;

  for (const incident of incidents) {
    if (seen.has(incident.id)) continue;
    seen.add(incident.id);
    if (!isPressOnly(incident)) continue;

    const kinds = publishers(incident).map(classifyPublisher);
    const primary = classifyPublisher(incident.preuve?.editeur);
    if (primary === "grey") byPublisherKind.grey += 1;
    if (primary === "press") byPublisherKind.press += 1;
    if (kinds.includes("grey")) withGreySource += 1;
    byDepartment.set(incident.departement, (byDepartment.get(incident.departement) ?? 0) + 1);

    rows.push({
      id: incident.id,
      department: incident.departement,
      publicationDate: incident.datePublique ?? null,
      publisherKind: primary,
      incidentType: incident.type ?? null,
    });
  }

  rows.sort((a, b) =>
    (b.publicationDate ?? "").localeCompare(a.publicationDate ?? "") || a.id.localeCompare(b.id));

  return {
    scope: "Nouvelle-Aquitaine",
    definition: "rapporte",
    corpusTotal: incidents.length,
    count: rows.length,
    withGreySource,
    byDepartment: [...byDepartment.entries()]
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => a.department.localeCompare(b.department)),
    byPublisherKind,
    incidents: rows,
  };
}
