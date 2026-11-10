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

// réexport type OrgRef pour compat
export type { OrgRef };
