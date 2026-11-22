/**
 * Territorial filter for GitHub organization profiles.
 *
 * The terms mirror DEPT_LABELS and PREFECTURES in collectors/relevance.ts but
 * are kept here as plain data: the scanner must stay free of database imports
 * so it can run as a standalone, reproducible command.
 */
const NA_DEPARTMENTS = [
  "charente",
  "charente-maritime",
  "correze",
  "creuse",
  "dordogne",
  "gironde",
  "landes",
  "lot-et-garonne",
  "pyrenees-atlantiques",
  "deux-sevres",
  "vienne",
  "haute-vienne",
] as const;

const NA_CITIES = [
  "angouleme",
  "la rochelle",
  "tulle",
  "gueret",
  "perigueux",
  "bordeaux",
  "mont-de-marsan",
  "agen",
  "pau",
  "niort",
  "poitiers",
  "limoges",
] as const;

const NA_REGION = ["nouvelle-aquitaine", "nouvelle aquitaine", "aquitaine"] as const;

export const NA_LOCATION_TERMS: readonly string[] = [...NA_DEPARTMENTS, ...NA_CITIES, ...NA_REGION];

const foldedLocation = (location: string): string =>
  location.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const escapedTerms = NA_LOCATION_TERMS.map((term) =>
  term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
);

const NA_LOCATION_PATTERN = new RegExp(
  `(?<![\\p{L}])(?:${escapedTerms.join("|")})(?![\\p{L}])`,
  "u",
);

/** True when a public GitHub profile location is in Nouvelle-Aquitaine. */
export function isNaLocation(location: string | null | undefined): boolean {
  if (!location) return false;
  return NA_LOCATION_PATTERN.test(foldedLocation(location));
}
