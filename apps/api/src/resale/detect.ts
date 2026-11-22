/**
 * Detection of resale listings — public offers of stolen data or access.
 *
 * A listing is counted only when a source text explicitly offers data for sale
 * (`DATA SALE`, `for sale`, `à vendre`, ...) AND mentions a data object
 * (`data`, `database`, `records`, `access`, ...). Generic commerce wording
 * ("point of sale", "selling tickets") is not a resale listing.
 *
 * Nouvelle-Aquitaine scope is proven in one of three ways: an attached
 * organization in an NA department, an explicit NA locality in the text, or a
 * registrable domain owned by an NA organization. Gray sources (ransomwatch,
 * ransomware.live, public Telegram channels) stay eligible; no paid service
 * and no network call are involved.
 *
 * Victim data never reaches this module's output: listings carry only an
 * identifier, the source name and the scope basis. Raw titles and claim hints
 * are used for classification and discarded.
 */
import { DEPT_LABELS } from "../collectors/relevance.js";
import { domaineRacine } from "../match/domaine.js";

/** Shared by the SQL prefilter and the JavaScript rule: one source of truth. */
export const SALE_PATTERN =
  "for sale|data sale|available for purchase|offered for sale|up for sale|selling|vendre|revente|à vendre|en vente|mise en vente|donnees a vendre|données à vendre";
export const DATA_PATTERN =
  "data|database|dump|records|files|access|breach|données|donnees|base de donnees|base de données|fichiers|accès";
export const NA_PATTERN = [
  "Nouvelle[- ]Aquitaine",
  "Bordeaux",
  "Limoges",
  "Poitiers",
  "Angoul[eê]me",
  "La Rochelle",
  "Niort",
  "P[eé]rigueux",
  "Agen",
  "Ch[aâ]teauroux",
  "Gu[eé]ret",
  "Tulle",
  "Saintes",
  "Cognac",
  "Arcachon",
  "Bayonne",
  "Biarritz",
  "Gironde",
  "Charente-Maritime",
  "Charente",
  "Corr[eè]ze",
  "Dordogne",
  "Landes",
  "Lot-et-Garonne",
  "Pyr[eé]n[eé]es-Atlantiques",
  "Deux-S[eè]vres",
  "Haute-Vienne",
  "Vienne",
].join("|");
export const NON_OFFER_PATTERN =
  "point of sale|point de vente|selling tickets|vente de billets|sales team|service commercial";

const SALE_RE = new RegExp(SALE_PATTERN, "i");
const DATA_RE = new RegExp(DATA_PATTERN, "i");
const NA_RE = new RegExp(NA_PATTERN, "i");
const NON_OFFER_RE = new RegExp(NON_OFFER_PATTERN, "i");

export type ResaleCandidate = {
  id: string | number;
  source: string;
  /** Title or claim hint only; summaries and TLP:RED bodies are never read. */
  text: string | null;
  department?: string | null;
  domainHint?: string | null;
  origin?: string;
};

export type ResaleListing = {
  id: string;
  source: string;
  basis: "department" | "locality" | "domain";
};

const NA_LABELS: ReadonlySet<string> = new Set(Object.values(DEPT_LABELS));

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Accepts an INSEE code ("33") or a department label ("Gironde"). */
export function isNaDepartment(department: string | null | undefined): boolean {
  if (!department) return false;
  const value = fold(department);
  const label = /^\d{2}$/.test(value) ? DEPT_LABELS[value] : value;
  return label !== undefined && NA_LABELS.has(label);
}

/** True when a text explicitly offers data (not merely mentions a sale). */
export function isSaleOffer(text: string | null | undefined): boolean {
  if (!text) return false;
  return SALE_RE.test(text) && DATA_RE.test(text) && !NON_OFFER_RE.test(text);
}

/** True when a text names Nouvelle-Aquitaine or one of its departments/cities. */
export function mentionsNa(text: string | null | undefined): boolean {
  return !!text && NA_RE.test(text);
}

/**
 * Classifies candidates into anonymized listings. One candidate is counted at
 * most once, even when it is read from two tables or repeated by a collector.
 */
export function detectResaleListings(
  candidates: readonly ResaleCandidate[],
  naDomains: ReadonlySet<string> = new Set(),
): ResaleListing[] {
  const listings: ResaleListing[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!isSaleOffer(candidate.text)) continue;
    const origin = candidate.origin ?? "source";
    const key = `${origin}:${candidate.source}:${candidate.id}`;
    if (seen.has(key)) continue;

    let basis: ResaleListing["basis"] | null = null;
    if (isNaDepartment(candidate.department)) basis = "department";
    else if (mentionsNa(candidate.text)) basis = "locality";
    else {
      const root = domaineRacine(candidate.domainHint);
      if (root !== null && naDomains.has(root)) basis = "domain";
    }
    if (basis === null) continue;

    seen.add(key);
    listings.push({ id: `${origin}:${candidate.id}`, source: candidate.source, basis });
  }
  return listings;
}

/** Count of distinct NA resale listings. */
export function countResaleListings(
  candidates: readonly ResaleCandidate[],
  naDomains: ReadonlySet<string> = new Set(),
): number {
  return detectResaleListings(candidates, naDomains).length;
}
