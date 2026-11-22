/**
 * Official Nouvelle-Aquitaine statement sources.
 *
 * Every entry is a public, free, institutional page or feed. The `department`
 * field is the INSEE code; `NA` means the whole region. `pressOnly` marks a
 * dedicated press room, where every dated item is an official statement.
 */

export type OfficialSource = {
  id: string;
  name: string;
  url: string;
  format: "rss" | "html";
  department: string;
  departmentLabel: string;
  officialDomain: string;
  pressOnly: boolean;
};

export const NA_DEPARTMENTS: Readonly<Record<string, true>> = {
  "16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
  "40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
};

/** Institutional domains we accept as first-party publishers. */
const INSTITUTIONAL_DOMAINS: Readonly<Record<string, true>> = {
  "www.nouvelle-aquitaine.ars.sante.fr": true,
  "nouvelle-aquitaine.gouv.fr": true,
  "lotetgaronne.fr": true,
  "www.lotetgaronne.fr": true,
  "creuse.fr": true,
  "www.creuse.fr": true,
  "poitiers.fr": true,
  "www.poitiers.fr": true,
  "larochelle.fr": true,
  "www.larochelle.fr": true,
  "la.charente-maritime.fr": true,
  "www.grandpoitiers.fr": true,
  "www.ville-lasouterraine.fr": true,
  "www.univ-larochelle.fr": true,
};

export const OFFICIAL_SOURCES: readonly OfficialSource[] = [
  {
    id: "official-na-ars-communiques",
    name: "ARS Nouvelle-Aquitaine - press releases",
    url: "https://www.nouvelle-aquitaine.ars.sante.fr/liste-communiques-presse",
    format: "html",
    department: "NA",
    departmentLabel: "Nouvelle-Aquitaine",
    officialDomain: "www.nouvelle-aquitaine.ars.sante.fr",
    pressOnly: true,
  },
  {
    id: "official-na-region-actualites",
    name: "French State services in Nouvelle-Aquitaine - news",
    url: "https://www.nouvelle-aquitaine.gouv.fr/actualites",
    format: "html",
    department: "NA",
    departmentLabel: "Nouvelle-Aquitaine",
    officialDomain: "www.nouvelle-aquitaine.gouv.fr",
    pressOnly: false,
  },
  {
    id: "official-na-cd47-actualites",
    name: "Lot-et-Garonne department council - news feed",
    url: "https://www.lotetgaronne.fr/actualites/rss",
    format: "rss",
    department: "47",
    departmentLabel: "Lot-et-Garonne",
    officialDomain: "www.lotetgaronne.fr",
    pressOnly: false,
  },
  {
    id: "official-na-creuse-presse",
    name: "Creuse department council - press room",
    url: "https://www.creuse.fr/Espace-presse",
    format: "html",
    department: "23",
    departmentLabel: "Creuse",
    officialDomain: "www.creuse.fr",
    pressOnly: true,
  },
  {
    id: "official-na-grandpoitiers-actualites",
    name: "Grand Poitiers - news feed",
    url: "https://www.grandpoitiers.fr/information-transversale/actualites/rss",
    format: "rss",
    department: "86",
    departmentLabel: "Vienne",
    officialDomain: "www.grandpoitiers.fr",
    pressOnly: false,
  },
  {
    id: "official-na-lasouterraine-actualites",
    name: "La Souterraine city - news feed",
    url: "https://www.ville-lasouterraine.fr/actualites/feed/",
    format: "rss",
    department: "23",
    departmentLabel: "Creuse",
    officialDomain: "www.ville-lasouterraine.fr",
    pressOnly: false,
  },
  {
    id: "official-na-charente-presse",
    name: "Charente-Maritime department council - press room",
    url: "https://la.charente-maritime.fr/espace-presse/communiques-presse",
    format: "html",
    department: "17",
    departmentLabel: "Charente-Maritime",
    officialDomain: "la.charente-maritime.fr",
    pressOnly: true,
  },
  {
    id: "official-na-univ-larochelle-presse",
    name: "La Rochelle University - press room",
    url: "https://www.univ-larochelle.fr/luniversite/espace-presse/communiques-de-presse/annee-2026/",
    format: "html",
    department: "17",
    departmentLabel: "Charente-Maritime",
    officialDomain: "www.univ-larochelle.fr",
    pressOnly: true,
  },
];

export type OfficialStatement = {
  sourceId: string;
  department: string;
  departmentLabel: string;
  officialDomain: string;
  title: string;
  url: string;
  publishedAt: Date;
};

export function isNouvelleAquitaine(source: OfficialSource): boolean {
  return source.department === "NA" || NA_DEPARTMENTS[source.department] === true;
}

/**
 * A link is accepted only when it stays on the publisher's own institutional
 * host. This keeps paid aggregators, content farms and leak sites out of the
 * corpus without maintaining a blocklist that would age badly.
 */
export function isOfficialDomain(url: string, source: OfficialSource): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase();
  const expected = source.officialDomain.toLowerCase();
  const onPublisher = host === expected || host.endsWith(`.${expected}`);
  const institutional = host === "gouv.fr" || host.endsWith(".gouv.fr") || INSTITUTIONAL_DOMAINS[host] === true;
  return onPublisher && institutional;
}
