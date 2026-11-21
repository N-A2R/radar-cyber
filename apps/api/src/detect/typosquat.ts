/**
 * Détection d'usurpation de noms d'organisations de Nouvelle-Aquitaine.
 *
 * Tout est passif : noms de domaine générés depuis le référentiel, résolution
 * DNS publique, certificats CT et lecture de la page d'accueil publique.
 * Aucun port n'est scanné, aucune donnée personnelle n'est stockée.
 */
import { domainToASCII, domainToUnicode } from "node:url";

export type VariantKind = "omission" | "transposition" | "substitution" | "tiret" | "homoglyphe" | "tld";

export interface Variant {
  domain: string;
  base: string;
  kind: VariantKind;
}

export interface CertSnapshot {
  issuer: string;
  notBefore: string;
  notAfter: string;
  dnsNames: string[];
}

export interface PageSnapshot {
  status: number;
  url: string;
  title: string;
  text: string;
}

export interface TyposquatFinding {
  orgId: number | null;
  orgName: string;
  officialDomains: string[];
  base: string;
  domain: string;
  kind: VariantKind;
  similarity: number;
  a: string[];
  aaaa: string[];
  cert: CertSnapshot | null;
  page: PageSnapshot | null;
}

export interface Verdict {
  usurpation: boolean;
  motifs: string[];
  confiance: "eleve" | "moyen" | "faible";
}

const HOMOGLYPHS: Record<string, string> = {
  a: "а", o: "о", e: "е", c: "с", p: "р", x: "х", y: "у",
  i: "і", n: "п", b: "Ь", h: "һ", k: "κ", m: "м", t: "т",
  s: "ѕ", v: "ν", w: "ш", g: "ğ", d: "ԁ", l: "ӏ", r: "г",
};

const SUBSTITUTIONS: Record<string, string[]> = {
  a: ["e", "o"], e: ["a", "i"], i: ["e", "o"], o: ["a", "u"],
  u: ["o", "i"], y: ["i", "u"], s: ["z"], c: ["k"],
  l: ["i", "t"], n: ["m", "h"], r: ["t", "n"], t: ["r", "f"],
  m: ["n"], b: ["v"], v: ["b"], p: ["b"], d: ["l"], g: ["q"],
  q: ["g"], f: ["t"], h: ["b"], j: ["i"], k: ["c"], x: ["z"], z: ["s"],
};

export function deaccent(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function slugify(value: string): string {
  return deaccent(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Domaine ASCII (punycode) pour un homoglyphe saisi en unicode. */
function ascii(domain: string): string {
  return domainToASCII(domain).toLowerCase();
}

function unique(values: Variant[], max: number): Variant[] {
  const seen = new Set<string>();
  const out: Variant[] = [];
  for (const v of values) {
    if (seen.has(v.domain)) continue;
    seen.add(v.domain);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Variantes plausibles d'un domaine officiel. L'ordre est délibéré : les
 * fautes de frappe les plus courantes (omission, transposition) arrivent
 * avant les homoglyphes et les changements de TLD.
 */
export function genererVariantes(base: string, max = 40): Variant[] {
  const asciiBase = ascii(base.trim().toLowerCase());
  const point = asciiBase.indexOf(".");
  if (point < 3) return [];
  const label = asciiBase.slice(0, point);
  const tld = asciiBase.slice(point + 1);
  if (!/^[a-z0-9-]+$/.test(label)) return [];
  const out: Variant[] = [];
  const ajouter = (domaine: string, kind: VariantKind) => {
    const a = ascii(domaine);
    if (a !== asciiBase && a.endsWith(`.${tld}`) && domainToASCII(a) !== "") {
      out.push({ domain: a, base: asciiBase, kind });
    }
  };

  for (let i = 0; i < label.length; i++) {
    ajouter(`${label.slice(0, i)}${label.slice(i + 1)}.${tld}`, "omission");
  }
  for (let i = 0; i < label.length - 1; i++) {
    ajouter(`${label.slice(0, i)}${label[i + 1]}${label[i]}${label.slice(i + 2)}.${tld}`, "transposition");
  }
  for (let i = 0; i < label.length; i++) {
    for (const remplacement of SUBSTITUTIONS[label[i]] ?? []) {
      ajouter(`${label.slice(0, i)}${remplacement}${label.slice(i + 1)}.${tld}`, "substitution");
    }
  }
  for (let i = 1; i < label.length; i++) {
    if (label[i - 1] !== "-") ajouter(`${label.slice(0, i)}-${label.slice(i)}.${tld}`, "tiret");
  }
  for (let i = 0; i < label.length; i++) {
    const h = HOMOGLYPHS[label[i]];
    if (h) ajouter(`${label.slice(0, i)}${h}${label.slice(i + 1)}.${tld}`, "homoglyphe");
  }
  return unique(out, max);
}

/** Variantes de TLD, ajoutées à part pour ne pas noyer les fautes de frappe. */
export function variantesTld(base: string): Variant[] {
  const asciiBase = ascii(base.trim().toLowerCase());
  const point = asciiBase.indexOf(".");
  if (point < 3) return [];
  const label = asciiBase.slice(0, point);
  const tld = asciiBase.slice(point + 1);
  return unique(
    ["com", "net", "org"]
      .filter((autre) => autre !== tld)
      .map((autre) => ({ domain: `${label}.${autre}`, base: asciiBase, kind: "tld" as const })),
    3,
  );
}

/** Distance de Levenshtein sur les libellés (homoglyphes décodés). */
export function distance(a: string, b: string): number {
  const x = domainToUnicode(a).toLowerCase();
  const y = domainToUnicode(b).toLowerCase();
  if (x === y) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length] as number;
}

export function similarite(base: string, candidat: string): number {
  const x = domainToUnicode(ascii(base).split(".")[0] ?? "");
  const y = domainToUnicode(ascii(candidat).split(".")[0] ?? "");
  const taille = Math.max(x.length, y.length);
  return taille === 0 ? 0 : Math.max(0, 1 - distance(x, y) / taille);
}

export function certificatRecent(cert: CertSnapshot | null, maintenant = new Date()): boolean {
  if (!cert || !cert.notBefore || !cert.notAfter) return false;
  const debut = new Date(cert.notBefore).getTime();
  const fin = new Date(cert.notAfter).getTime();
  if (!Number.isFinite(debut) || !Number.isFinite(fin)) return false;
  const ageMax = 400 * 24 * 3_600_000;
  return fin > maintenant.getTime() && debut <= maintenant.getTime() && maintenant.getTime() - debut <= ageMax;
}

const STATIONNEMENT = [
  "domain for sale", "domain name for sale", "prochainement disponible", "en vente",
  "parked", "sedoparking", "namecheap", "domain is for sale", "coming soon",
  "website temporarily unavailable", "index of /", "acheter ce domaine",
];

const CONNEXION = [
  "connexion", "login", "password", "mot de passe", "compte", "credential",
  "verify your", "vérifiez votre", "facture", "urgent",
];

function host(domaine: string): string {
  try { return new URL(domaine.startsWith("http") ? domaine : `https://${domaine}`).hostname.toLowerCase(); }
  catch { return domaine.toLowerCase(); }
}

function estOfficiel(hote: string, officiels: string[]): boolean {
  return officiels.some((o) => hote === host(o) || hote.endsWith(`.${host(o)}`));
}

/** Décision indépendante de la détection : sert aussi à mesurer les faux positifs. */
export function classerUsurpation(f: TyposquatFinding, maintenant = new Date()): Verdict {
  const motifs: string[] = [];
  if (f.a.length === 0 && f.aaaa.length === 0) return { usurpation: false, motifs: ["dns-inactif"], confiance: "faible" };
  motifs.push("dns-actif");
  if (!certificatRecent(f.cert, maintenant)) return { usurpation: false, motifs: [...motifs, "certificat-absent-ou-ancien"], confiance: "faible" };
  motifs.push("certificat-recent");

  const titre = f.page?.title ?? "";
  const pageHote = f.page ? host(f.page.url) : "";
  const corps = (f.page?.text ?? "").slice(0, 40_000).toLowerCase();
  const officiels = f.officialDomains.length > 0 ? f.officialDomains : [f.base];

  if (pageHote && estOfficiel(pageHote, officiels)) {
    return { usurpation: false, motifs: [...motifs, "redirection-officielle"], confiance: "eleve" };
  }
  if (f.cert?.dnsNames.some((n) => estOfficiel(n, officiels) && n.toLowerCase() === host(f.domain))) {
    return { usurpation: false, motifs: [...motifs, "certificat-officiel-partage"], confiance: "eleve" };
  }
  if (STATIONNEMENT.some((m) => titre.toLowerCase().includes(m) || corps.includes(m))) {
    return { usurpation: false, motifs: [...motifs, "domaine-de-vente-ou-parked"], confiance: "eleve" };
  }
  if (f.similarity < 0.8) return { usurpation: false, motifs: [...motifs, "ressemblance-insuffisante"], confiance: "eleve" };

  const nom = deaccent(f.orgName).replace(/[^a-z0-9 ]/g, " ");
  const tokens = nom.split(/\s+/).filter((t) => t.length >= 4 && !["commune", "ville", "mairie", "hopital", "chu", "centre", "universite", "de", "du", "la", "le", "des"].includes(t));
  const titreNorm = deaccent(titre).replace(/[^a-z0-9 ]/g, " ");
  const titreUsurpe = tokens.some((t) => titreNorm.includes(t)) ||
    (titreNorm.includes("university of") && nom.includes("universite")) ||
    (titreNorm.includes("universite") && nom.includes("universite"));
  const champConnexion = CONNEXION.some((m) => titre.toLowerCase().includes(m) || /type=["']password["']|type=["']email["']/.test(corps));

  if (!f.page) {
    return { usurpation: false, motifs: [...motifs, "page-illisible"], confiance: "faible" };
  }
  motifs.push("page-publique-lue");
  if (f.kind === "homoglyphe") motifs.push("homoglyphe");
  if (titreUsurpe) motifs.push("titre-usurpe");
  if (champConnexion) motifs.push("champ-connexion");

  if (!titreUsurpe && !champConnexion && f.kind !== "homoglyphe") {
    return { usurpation: false, motifs: [...motifs, "contenu-sans-usurpation"], confiance: "eleve" };
  }
  return {
    usurpation: true,
    motifs,
    confiance: f.kind === "homoglyphe" || champConnexion ? "eleve" : "moyen",
  };
}

export interface MesureFauxPositifs {
  echantillon: number;
  fauxPositifs: number;
  taux: number;
  detail: { domain: string; usurpation: boolean; motifs: string[] }[];
}

/** Échantillon déterministe, trié par domaine : la mesure est reproductible. */
export function mesurerFauxPositifs(
  findings: TyposquatFinding[],
  taille = 20,
  maintenant = new Date(),
): MesureFauxPositifs {
  const echantillon = [...findings]
    .filter((f) => f.a.length > 0 || f.aaaa.length > 0)
    .sort((a, b) => a.domain.localeCompare(b.domain))
    .slice(0, taille);
  const detail = echantillon.map((f) => {
    const v = classerUsurpation(f, maintenant);
    return { domain: f.domain, usurpation: v.usurpation, motifs: v.motifs };
  });
  const fauxPositifs = detail.filter((d) => !d.usurpation).length;
  return {
    echantillon: detail.length,
    fauxPositifs,
    taux: detail.length === 0 ? 0 : fauxPositifs / detail.length,
    detail,
  };
}
