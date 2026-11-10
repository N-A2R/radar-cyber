// pertinence cyber pour les flux de presse généraliste
import type { OrgRef } from "@radar/shared";

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

function normalizeOrgName(name: string): string {
  let n = normalize(name);
  // retirer suffixes juridiques courants
  n = n.replace(/\b(sarl|sas|sa|eurl|sci|association|assoc\.?|groupe|group)\b/g, "").trim();
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
