// pertinence cyber pour les flux de presse généraliste
import { ingestQuery } from "../db.js";
import type { OrgRef } from "@radar/shared";

interface MatchOrgRow {
  id: number;
  name: string;
  slug?: string | null;
  domain?: string | null;
}

export interface OrgMatch {
  orgId: number;
  confidence: number;
}

interface CachedOrg extends MatchOrgRow {
  normName: string;
  normSlug: string;
  normDomain: string;
  nameTokens: string[];
  slugTokens: string[];
}

const ORG_MATCH_CACHE_TTL_MS = 10 * 60 * 1000;
let orgMatchCache: { at: number; orgs: CachedOrg[] } | null = null;

const STOPWORDS: Record<string, true> = {
  pour: true, avec: true, dans: true, sur: true, les: true, des: true, une: true, aux: true,
  par: true, est: true, sont: true, son: true, ses: true, leur: true, leurs: true, que: true,
  qui: true, pas: true, plus: true, du: true, de: true, la: true, le: true, et: true, en: true,
  au: true, nos: true, vos: true, ces: true, cet: true, cette: true, mais: true, ou: true,
  donc: true, car: true, ni: true, ne: true, se: true, sa: true, ce: true, un: true, dun: true,
};

const LEGAL_FORMS_RE = /\b(sas|sarl|sa|sci|scp|eurl)\b/g;

export interface RelevanceOrg {
  name: string;
  slug?: string | null;
  domain?: string | null;
  assets?: string[];
}

export const CYBER_KEYWORDS: string[] = [
  "cyberattaque",
  "cyber-attaque",
  "ransomware",
  "rançongiciel",
  "fuite de données",
  "violation de données",
  "vulnérabilité",
  "faille",
  "CVE-",
  "zero-day",
  "phishing",
  "hameçonnage",
  "DDoS",
  "ANSSI",
  "CNIL",
  "compromis",
  "intrusion",
  "piratage",
  "rançon",
  "données personnelles",
  "sécurité informatique",
  "maliciel",
  "cheval de Troie",
  "exfiltration",
  "APT",
  "botnet",
  "serveur compromis",
  "identifiants volés",
  "revendication",
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function normalizeMatchText(s: string): string {
  return normalize(s)
    .replace(/[^a-z0-9.\s-]+/g, " ")
    .replace(LEGAL_FORMS_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMatchText(s: string): string[] {
  const out: string[] = [];
  const seen: Record<string, true> = {};
  for (const token of normalizeMatchText(s).split(/[^a-z0-9]+/g)) {
    if (token.length < 4 || STOPWORDS[token] || seen[token]) continue;
    seen[token] = true;
    out.push(token);
  }
  return out;
}

function prepareOrgForMatch(org: MatchOrgRow): CachedOrg {
  const normName = normalizeMatchText(org.name ?? "");
  const normSlug = normalizeMatchText(org.slug ?? "");
  const normDomain = normalizeMatchText(org.domain ?? "");
  return {
    ...org,
    normName,
    normSlug,
    normDomain,
    nameTokens: tokenizeMatchText(org.name ?? ""),
    slugTokens: tokenizeMatchText(org.slug ?? ""),
  };
}

export function matchOrgForTextFromList(text: string, orgs: MatchOrgRow[]): OrgMatch | null {
  const normText = normalizeMatchText(text);
  if (!normText) return null;
  const textTokens: Record<string, true> = {};
  for (const token of tokenizeMatchText(text)) textTokens[token] = true;
  if (Object.keys(textTokens).length === 0 && !normText.includes(".")) return null;

  const candidates: Array<{ orgId: number; confidence: number; score: number }> = [];
  for (const row of orgs) {
    const org = prepareOrgForMatch(row);
    let score = 0;
    let confidence = 0;

    if (org.normDomain && org.normDomain.length >= 4 && normText.includes(org.normDomain)) {
      score += 100;
      confidence = Math.max(confidence, 0.95);
    }

    let tokenHits = 0;
    for (const token of org.nameTokens) {
      if (textTokens[token]) tokenHits++;
    }
    for (const token of org.slugTokens) {
      if (textTokens[token] && !org.nameTokens.includes(token)) tokenHits++;
    }
    if (tokenHits > 0) {
      score += tokenHits * 10;
      confidence = Math.max(confidence, tokenHits >= 2 ? 0.9 : 0.8);
    }

    const threshold = org.normDomain && normText.includes(org.normDomain) ? 100 : 10;
    if (score >= threshold) candidates.push({ orgId: org.id, confidence, score });
  }

  candidates.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  if (candidates.length !== 1) return null;
  return { orgId: candidates[0].orgId, confidence: candidates[0].confidence };
}

async function loadOrgMatchCache(): Promise<CachedOrg[]> {
  const now = Date.now();
  if (orgMatchCache && now - orgMatchCache.at < ORG_MATCH_CACHE_TTL_MS) return orgMatchCache.orgs;
  const res = await ingestQuery<MatchOrgRow>("SELECT id, name, slug, domain FROM org");
  const orgs = (res.rows ?? []).map(prepareOrgForMatch);
  orgMatchCache = { at: now, orgs };
  return orgs;
}

export async function matchOrgForText(text: string): Promise<OrgMatch | null> {
  try {
    const normText = normalizeMatchText(text);
    if (!normText) return null;
    const textTokens: Record<string, true> = {};
    for (const token of tokenizeMatchText(text)) textTokens[token] = true;
    if (Object.keys(textTokens).length === 0 && !normText.includes(".")) return null;
    const orgs = await loadOrgMatchCache();
    const candidates: Array<{ orgId: number; confidence: number; score: number }> = [];
    for (const org of orgs) {
      let score = 0;
      let confidence = 0;
      if (org.normDomain && org.normDomain.length >= 4 && normText.includes(org.normDomain)) {
        score += 100;
        confidence = Math.max(confidence, 0.95);
      }
      let tokenHits = 0;
      for (const token of org.nameTokens) {
        if (textTokens[token]) tokenHits++;
      }
      for (const token of org.slugTokens) {
        if (textTokens[token] && !org.nameTokens.includes(token)) tokenHits++;
      }
      if (tokenHits > 0) {
        score += tokenHits * 10;
        confidence = Math.max(confidence, tokenHits >= 2 ? 0.9 : 0.8);
      }
      const threshold = org.normDomain && normText.includes(org.normDomain) ? 100 : 10;
      if (score >= threshold) candidates.push({ orgId: org.id, confidence, score });
    }
    candidates.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
    if (candidates.length !== 1) return null;
    return { orgId: candidates[0].orgId, confidence: candidates[0].confidence };
  } catch {
    return null;
  }
}

function normalizeOrgName(name: string): string {
  let n = normalize(name);
  // retirer suffixes juridiques courants
  n = n.replace(/\b(sarl|sas|sa|eurl|sci|scp|association|assoc\.?|groupe|group)\b/g, "").trim();
  n = n.replace(/\s+/g, " ");
  return n;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function loadRelevanceOrgIndex(orgs: { name: string; slug?: string | null; domain?: string | null; assets?: string[] }[] = []): RelevanceOrg[] {
  return orgs.map((o) => ({
    name: o.name,
    slug: o.slug ?? null,
    domain: o.domain ?? null,
    assets: o.assets ?? [],
  }));
}

export function isRelevant(
  item: { title?: string | null; summary?: string | null; url?: string | null; sourceUrl?: string | null },
  opts: { orgs: RelevanceOrg[]; ignoreDomains?: string[] },
): { relevant: boolean; reason: "keyword" | "org" | "none"; match?: string } {
  const haystack = [item.title, item.summary, item.url, item.sourceUrl]
    .filter(Boolean)
    .join(" ");
  const hayNorm = normalize(haystack);
  const hayNoAcc = stripAccents(haystack).toLowerCase();

  // L'URL porte le nom du média (www.sudouest.fr → « sudouest ») : le matching
  // d'entités se fait donc sur le TEXTE seul, sinon chaque article d'un média
  // régional matche l'org « Sud Ouest » et passe la porte par sa propre URL.
  const text = [item.title, item.summary].filter(Boolean).join(" ");
  const textNorm = normalize(text);
  const textLower = text.toLowerCase();

  // mots-clés
  for (const kw of CYBER_KEYWORDS) {
    const kwNorm = normalize(kw);
    const kwNoAcc = stripAccents(kw).toLowerCase();
    if (hayNorm.includes(kwNorm) || hayNoAcc.includes(kwNoAcc)) {
      return { relevant: true, reason: "keyword", match: kw };
    }
  }

  // Entités org. `ignoreDomains` porte l'hôte du flux lui-même : sans ça, une
  // org « Sud Ouest » fait matcher TOUS les articles de sudouest.fr par leur
  // propre URL, et la porte de pertinence laisse passer la une entière.
  const ignored = (opts.ignoreDomains ?? []).map((d) => d.toLowerCase().trim()).filter(Boolean);
  const isSelfDomain = (dom: string): boolean =>
    ignored.some((host) => host === dom || host.endsWith(`.${dom}`) || dom.endsWith(`.${host}`));

  // entités org
  for (const org of opts.orgs ?? []) {
    const nameNorm = normalizeOrgName(org.name);
    if (nameNorm && nameNorm.length >= 4 && textNorm.includes(nameNorm)) {
      return { relevant: true, reason: "org", match: org.name };
    }
    const candidates = [org.domain, ...(org.assets ?? [])].filter(Boolean) as string[];
    for (const d of candidates) {
      const dom = d.toLowerCase().trim();
      if (dom && !isSelfDomain(dom) && textLower.includes(dom)) {
        return { relevant: true, reason: "org", match: dom };
      }
    }
  }

  return { relevant: false, reason: "none" };
}

// ---------------------------------------------------------------------------
// Couverture élargie : deux règles d'admission supplémentaires, décidées par
// l'utilisateur (2026-11-10) et bornées par des mesures (docs/couverture.md).
//
//   (a) CVE exploitable : le CVE de l'item a un score EPSS ≥ seuil dans la
//       source `epss` déjà en base (aucun appel réseau).
//   (b) département cité : un département de Nouvelle-Aquitaine ou une
//       préfecture apparaît en mot entier dans le titre ou le résumé — jamais
//       dans l'URL, sinon chaque article d'un média local passerait.
//
// Les items admis par ces règles mais sans organisation rattachée reçoivent
// `event.admission_rule = 'epss' | 'dept'` ; ceux rattachés gardent 'org'.
// ---------------------------------------------------------------------------

/** Code INSEE → libellé normalisé (minuscules, sans accents) du département. */
export const DEPT_LABELS: Readonly<Record<string, string>> = {
  "16": "charente",
  "17": "charente-maritime",
  "19": "correze",
  "23": "creuse",
  "24": "dordogne",
  "33": "gironde",
  "40": "landes",
  "47": "lot-et-garonne",
  "64": "pyrenees-atlantiques",
  "79": "deux-sevres",
  "86": "vienne",
  "87": "haute-vienne",
};

/** Préfectures de Nouvelle-Aquitaine : une commune citée vaut le département. */
export const PREFECTURES: readonly string[] = [
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
];

/**
 * Noms qui désignent aussi autre chose (fleuve, ville d'une autre région) :
 * « Vienne » est une ville d'Isère, « Lot » et « Dordogne » sont des rivières.
 * Seule une mention explicite du contexte administratif les retient.
 */
const AMBIGUOUS_PLACES: Readonly<Record<string, true>> = {
  vienne: true,
  lot: true,
  pau: true,
  niort: true,
  saintes: true,
  dax: true,
  charente: true,
  dordogne: true,
  creuse: true,
  correze: true,
  sevre: true,
  isle: true,
  landes: true,
};

/**
 * Contexte administratif explicite : autorise l'homonyme où qu'il soit dans la
 * phrase (« le département du Lot », « la ville de Pau »). Volontairement
 * resserré au vocabulaire administratif — « région » en est exclu, il apparaît
 * dans « région Nouvelle-Aquitaine » aussi bien que dans « la région de Pau »
 * sans rien dire du statut du toponyme.
 */
const ADMIN_CUE_RE =
  /\b(departement|prefecture|prefet|prefectoral|prefectorale|conseil departemental|commune de|commune d|ville de|ville d|agglomeration|metropole)\b/;

/**
 * Indice locatif immédiatement antérieur (« en Vienne », « à Pau », « dans le
 * Lot »). Ne vaut que collé au toponyme : le reste de la phrase ne suffit pas,
 * sinon « à » et « en », omniprésents en français, valideraient n'importe quel
 * homonyme et la règle redeviendrait inerte.
 */
const LOCATIVE_CUE_RE = /\b(?:en|au|aux|a|dans|sur|vers|depuis|pres de|autour de)\s+$/;

/** Occurrences d'URL : elles ne disent rien du sujet de l'article. */
const URL_OCCURRENCE_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

/**
 * Seuil EPSS retenu, mesuré (docs/couverture.md) : 0,10 capte la moitié des
 * CVE 2025-2026 de l'échantillon (136/272) et reste le bar « exploitation
 * probable sous 30 jours » de FIRST ; 0,01 en admettrait 94 % (256/272), ce
 * qui ne distingue plus rien.
 */
export const EPSS_ADMISSION_THRESHOLD = 0.1;

/** Contexte d'admission transmis par le collecteur (chargé une fois par run). */
export interface CoverageContext {
  epssByCve: ReadonlyMap<string, number>;
  epssThreshold: number;
  deptNames: readonly string[];
}

const CVE_ID_RE = /\bCVE-\d{4}-\d{4,}\b/gi;

/** Identifiants CVE d'un texte, en majuscules, sans doublon. */
export function extractCveIds(text: string): string[] {
  const found = text.match(CVE_ID_RE);
  if (!found) return [];
  return [...new Set(found.map((cve) => cve.toUpperCase()))];
}

/**
 * Règle (a) : un CVE de l'item dépasse le seuil EPSS. Le score vient de la
 * table `event` (source `epss`), jamais du réseau.
 */
export function admitByEpss(text: string, ctx: CoverageContext): { cve: string; score: number } | null {
  for (const cve of extractCveIds(text)) {
    const score = ctx.epssByCve.get(cve);
    if (score !== undefined && score >= ctx.epssThreshold) return { cve, score };
  }
  return null;
}

const deptPatternCache = new Map<string, RegExp>();

/** Motif « mot entier » unicode sur des libellés déjà normalisés. */
function deptPattern(names: readonly string[]): RegExp {
  const key = names.join("|");
  const cached = deptPatternCache.get(key);
  if (cached) return cached;
  const sorted = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
  const escaped = sorted.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  deptPatternCache.set(key, re);
  return re;
}

/**
 * Règle (b) : département ou préfecture cité en mot entier dans le texte
 * fourni (titre + résumé — l'URL est exclue par l'appelant et retirée ici par
 * précaution). Un homonyme ambigu (`AMBIGUOUS_PLACES`) n'est retenu que :
 *   - collé à une préposition locative (« en Vienne », « à Pau »), ou
 *   - accompagné d'un terme administratif dans la même phrase, ou
 *   - sous une forme composée non ambiguë (`lot-et-garonne`,
 *     `charente-maritime`, `pyrénées-atlantiques`…).
 * Mesure de l'effet : `scripts/audit-dept.mts` (docs/couverture.md).
 */
export function admitsDepartment(text: string, deptNames: readonly string[]): boolean {
  if (!text || deptNames.length === 0) return false;
  const hay = normalize(text.replace(URL_OCCURRENCE_RE, " "));
  const pattern = deptPattern(deptNames);
  pattern.lastIndex = 0;
  for (const match of hay.matchAll(pattern)) {
    const name = match[1]?.toLowerCase() ?? "";
    const at = match.index;
    if (!name || at === undefined) continue;
    // Forme composée : le trait d'union lève l'ambiguïté (« lot » vs
    // « lot-et-garonne », « vienne » vs « haute-vienne »).
    if (name.includes("-")) return true;
    if (AMBIGUOUS_PLACES[name] !== true) return true;
    const before = hay.slice(Math.max(0, at - 32), at);
    if (LOCATIVE_CUE_RE.test(before)) return true;
    if (ADMIN_CUE_RE.test(deptSentenceWindow(hay, at, at + name.length))) return true;
  }
  return false;
}

/** Fenêtre bornée à la phrase autour de `[start, end)`, pour juger du contexte. */
function deptSentenceWindow(hay: string, start: number, end: number): string {
  const from = Math.max(0, start - 120);
  const to = Math.min(hay.length, end + 120);
  let left = from;
  const head = hay.slice(from, start);
  const cutLeft = Math.max(
    head.lastIndexOf("."),
    head.lastIndexOf("!"),
    head.lastIndexOf("?"),
    head.lastIndexOf(";"),
    head.lastIndexOf("\n")
  );
  if (cutLeft >= 0) left = from + cutLeft + 1;
  let right = to;
  const tail = hay.slice(end, to);
  const cutRight = tail.search(/[.!?;\n]/);
  if (cutRight >= 0) right = end + cutRight;
  return hay.slice(left, right);
}

/**
 * Migration idempotente : marqueur d'admission sur `event`. Valeurs écrites par
 * `generic.ts` : `org`, `epss`, `dept`, ou null. Aucun accès à `org_id`.
 */
export async function ensureCoverageSchema(): Promise<void> {
  await ingestQuery("ALTER TABLE event ADD COLUMN IF NOT EXISTS admission_rule text");
}

// réexport type OrgRef pour compat
export type { OrgRef };
