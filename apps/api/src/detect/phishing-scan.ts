// Analyse passive de domaines usurpateurs visant des organisations de Nouvelle-Aquitaine.
//
// Trois sources publiques, aucune écriture sur un système tiers :
//   - résolution DNS A/AAAA (node:dns) ;
//   - certificats TLS observés dans crt.sh (Certificate Transparency) ;
//   - lecture de la page d'accueil publique et de flux phishing ouverts.
//
// Les appels réseau sont injectables : les tests n'ouvrent aucune connexion.

import { resolve4, resolve6 } from "node:dns/promises";
import { ingestQuery, query } from "../db.js";
import {
  classerUsurpation,
  deaccent,
  genererVariantes,
  mesurerFauxPositifs,
  similarite,
  slugify,
  variantesTld,
  type CertSnapshot,
  type MesureFauxPositifs,
  type PageSnapshot,
  type TyposquatFinding,
  type Verdict,
  type Variant,
} from "./typosquat.js";

/** Établissements publics vérifiés sur leur site officiel (nom, domaine, département). */
const CIBLES_INSTITUTIONNELLES: Cible[] = [
  { orgId: null, orgName: "Université de Bordeaux", domain: "univ-bordeaux.fr", dept: "33" },
  { orgId: null, orgName: "Université de Poitiers", domain: "univ-poitiers.fr", dept: "86" },
  { orgId: null, orgName: "Université de Limoges", domain: "univ-limoges.fr", dept: "87" },
  { orgId: null, orgName: "Université de Nantes", domain: "univ-nantes.fr", dept: "44" },
  { orgId: null, orgName: "Université de La Rochelle", domain: "univ-larochelle.fr", dept: "17" },
  { orgId: null, orgName: "CHU de Bordeaux", domain: "chu-bordeaux.fr", dept: "33" },
  { orgId: null, orgName: "CHU de Poitiers", domain: "chu-poitiers.fr", dept: "86" },
  { orgId: null, orgName: "CHU de Limoges", domain: "chu-limoges.fr", dept: "87" },
  { orgId: null, orgName: "Mairie de Bordeaux", domain: "bordeaux.fr", dept: "33" },
  { orgId: null, orgName: "Mairie de Poitiers", domain: "poitiers.fr", dept: "86" },
  { orgId: null, orgName: "Mairie de Limoges", domain: "limoges.fr", dept: "87" },
  { orgId: null, orgName: "Mairie de La Rochelle", domain: "la-rochelle.fr", dept: "17" },
];
const CRT_URL = "https://crt.sh/?q=";
const FEEDS = [
  { id: "openphish", url: "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt" },
  { id: "phishingarmy", url: "https://phishing.army/download/phishing_army_blocklist_extended.txt" },
] as const;

export interface Cible {
  orgId: number | null;
  orgName: string;
  domain: string;
  dept: string | null;
  /** Une cible issue du référentiel sans ligne `org` est créée si --apply. */
  referentiel?: boolean;
}

export interface Sonde {
  dns(domain: string): Promise<{ a: string[]; aaaa: string[] }>;
  certificat(domain: string): Promise<CertSnapshot | null>;
  page(domain: string): Promise<PageSnapshot | null>;
  urlsPhishing(feed: { id: string; url: string }): Promise<string[]>;
}

export interface UrlRattachee {
  feed: string;
  url: string;
  orgId: number | null;
  orgName: string;
  base: string;
  dept: string | null;
  motif: string;
}

export interface ResultatScan {
  cibles: number;
  variantesTestees: number;
  domainesActifs: TyposquatFinding[];
  findings: TyposquatFinding[];
  usurpations: { finding: TyposquatFinding; verdict: Verdict }[];
  urlsPhishing: UrlRattachee[];
  sources: Record<string, { requetes: number; reponses: number }>;
  mesure: MesureFauxPositifs;
}

export interface OptionsScan {
  maxVariantes?: number;
  tailleEchantillon?: number;
  concurrence?: number;
  maintenant?: Date;
  log?: (msg: string) => void;
}

/** Domaine nu, sans `www.`, sans protocole et sans slash final. */
export function domaineNu(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

function avecTimeout<T>(promise: Promise<T>, ms: number, valeur: T): Promise<T> {
  const { promise: delai, resolve } = Promise.withResolvers<T>();
  const timer = setTimeout(() => resolve(valeur), ms);
  return Promise.race([promise.catch(() => valeur), delai]).finally(() => clearTimeout(timer));
}

function titreHtml(html: string): string {
  return html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function texteHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|#39);/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10_000);
}

/** Sonde réelle : DNS direct, crt.sh, page publique et flux publics. */
export const sondeReelle: Sonde = {
  async dns(domain) {
    const [a, aaaa] = await Promise.all([
      avecTimeout(resolve4(domain), 5_000, [] as string[]),
      avecTimeout(resolve6(domain), 5_000, [] as string[]),
    ]);
    return { a, aaaa };
  },

  async certificat(domain) {
    try {
      const res = await fetch(`${CRT_URL}${encodeURIComponent(domain)}&output=json`, {
        signal: AbortSignal.timeout(20_000),
        headers: { accept: "application/json" },
      });
      if (!res.ok) return null;
      const rows = (await res.json()) as {
        issuer_name?: string;
        name_value?: string;
        not_before?: string;
        not_after?: string;
      }[];
      const valides = rows.filter((r) => r.not_before && r.not_after);
      if (valides.length === 0) return null;
      const recent = valides.reduce((a, b) => ((a.not_before ?? "") > (b.not_before ?? "") ? a : b));
      return {
        issuer: recent.issuer_name ?? "",
        notBefore: recent.not_before ?? "",
        notAfter: recent.not_after ?? "",
        dnsNames: [...new Set(rows.flatMap((r) => (r.name_value ?? "").split("\n").map((n) => n.trim()).filter(Boolean)))],
      };
    } catch {
      return null;
    }
  },

  async page(domain) {
    try {
      const res = await fetch(`https://${domain}/`, {
        signal: AbortSignal.timeout(10_000),
        redirect: "follow",
        headers: {
          "user-agent": "RadarCyberNA/1.0 (lecture publique passive)",
          accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
      const html = (await res.text()).slice(0, 200_000);
      return { status: res.status, url: res.url, title: titreHtml(html), text: texteHtml(html) };
    } catch {
      return null;
    }
  },

  async urlsPhishing(feed) {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(25_000) });
      if (!res.ok) return [];
      return (await res.text()).split(/\r?\n/).map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l));
    } catch {
      return [];
    }
  },
};

/**
 * Communes du référentiel qui déclarent un domaine (extrait vérifié de `org`).
 * Le slug sert de clé stable : `assurerOrg` retrouve la ligne existante sans
 * balayer la table des 1,6 M d'organisations.
 */
const COMMUNES_REFERENTIEL: Cible[] = [
  { orgId: null, orgName: "Commune de Charmé", domain: "mairie-charme.fr", dept: "16", referentiel: true },
  { orgId: null, orgName: "Commune de Charras", domain: "mairie-charras.fr", dept: "16", referentiel: true },
  { orgId: null, orgName: "Commune de Chassors", domain: "mairie-chassors.fr", dept: "16", referentiel: true },
  { orgId: null, orgName: "Commune de Claix", domain: "ville-claix.fr", dept: "16", referentiel: true },
  { orgId: null, orgName: "Commune de Cognac", domain: "ville-cognac.fr", dept: "16", referentiel: true },
  { orgId: null, orgName: "Commune de Confolens", domain: "mairie-confolens.fr", dept: "16", referentiel: true },
  { orgId: null, orgName: "Commune de Étriac", domain: "mairie-etriac.fr", dept: "16", referentiel: true },
];

export async function chargerCibles(): Promise<Cible[]> {
  return [...COMMUNES_REFERENTIEL, ...CIBLES_INSTITUTIONNELLES];
}

async function mapLimite<T, R>(items: T[], concurrence: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultats = new Array<R>(items.length);
  let curseur = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrence, items.length || 1)) }, async () => {
    for (;;) {
      const i = curseur++;
      if (i >= items.length) return;
      resultats[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return resultats;
}

/** Fautes de frappe puis changements de TLD, dans cet ordre. */
function variantsPour(cible: Cible, max: number): Variant[] {
  const variantes = genererVariantes(cible.domain, max);
  return [...variantes, ...variantesTld(cible.domain)];
}
/** Une URL de flux n'est rattachée que si son hôte imite le domaine officiel. */
export function rattacherUrl(
  url: string,
  feed: string,
  cibles: Cible[],
  variants: Map<string, Cible>,
): UrlRattachee | null {
  let hote: string;
  try {
    hote = domaineNu(new URL(url).hostname);
  } catch {
    return null;
  }
  const cibleVariant = variants.get(hote);
  if (cibleVariant) {
    return { feed, url, orgId: cibleVariant.orgId, orgName: cibleVariant.orgName, base: cibleVariant.domain, dept: cibleVariant.dept, motif: "variante-generee" };
  }
  for (const cible of cibles) {
    const base = domaineNu(cible.domain).split(".")[0] ?? "";
    if (base.length < 8) continue;
    const hoteLabel = hote.split(".")[0] ?? "";
    const tokens = deaccent(cible.orgName).split(/[^a-z0-9]+/).filter((t) => t.length >= 6);
    if (similarite(base, hote) >= 0.88 && tokens.some((t) => hoteLabel.includes(t.slice(0, 7)))) {
      return { feed, url, orgId: cible.orgId, orgName: cible.orgName, base: cible.domain, dept: cible.dept, motif: "hote-similaire" };
    }
  }
  return null;
}

/** Scan complet ; la sonde est injectée pour rester testable hors réseau. */
export async function analyserCibles(
  cibles: Cible[],
  sonde: Sonde,
  options: OptionsScan = {},
): Promise<ResultatScan> {
  const log = options.log ?? (() => {});
  const concurrence = options.concurrence ?? 8;
  const maintenant = options.maintenant ?? new Date();
  const sources: Record<string, { requetes: number; reponses: number }> = {
    dns: { requetes: 0, reponses: 0 },
    crtsh: { requetes: 0, reponses: 0 },
    page: { requetes: 0, reponses: 0 },
  };
  const tout: Variant[] = [];
  const variantesParCible = cibles.map((cible) => {
    const variants = variantsPour(cible, options.maxVariantes ?? 30);
    tout.push(...variants);
    return variants;
  });
  const variantToCible = new Map<string, Cible>();
  cibles.forEach((cible, i) => variantesParCible[i].forEach((v) => variantToCible.set(v.domain, cible)));

  const findings = await mapLimite(tout, concurrence, async (variant) => {
    const cible = variantToCible.get(variant.domain);
    if (!cible) throw new Error("variante orpheline");
    sources.dns.requetes++;
    const { a, aaaa } = await sonde.dns(variant.domain);
    if (a.length + aaaa.length === 0) {
      return null;
    }
    sources.dns.reponses++;
    sources.crtsh.requetes++;
    const cert = await sonde.certificat(variant.domain);
    if (cert) sources.crtsh.reponses++;
    sources.page.requetes++;
    const page = await sonde.page(variant.domain);
    if (page) sources.page.reponses++;
    return {
      orgId: cible.orgId,
      orgName: cible.orgName,
      dept: cible.dept,
      officialDomains: [cible.domain],
      base: cible.domain,
      domain: variant.domain,
      kind: variant.kind,
      similarity: similarite(cible.domain, variant.domain),
      a,
      aaaa,
      cert,
      page,
    } satisfies TyposquatFinding;
  });

  const actifs = findings.filter((f): f is TyposquatFinding => f !== null);
  const usurpations = actifs.flatMap((finding) => {
    const verdict = classerUsurpation(finding, maintenant);
    return verdict.usurpation ? [{ finding, verdict }] : [];
  });

  const urlsPhishing: UrlRattachee[] = [];
  for (const feed of FEEDS) {
    const urls = await sonde.urlsPhishing(feed);
    for (const url of urls) {
      const rattachee = rattacherUrl(url, feed.id, cibles, variantToCible);
      if (rattachee) urlsPhishing.push(rattachee);
    }
  }

  log(`${cibles.length} cible(s), ${tout.length} variante(s), ${actifs.length} domaine(s) actif(s)`);
  return {
    cibles: cibles.length,
    variantesTestees: tout.length,
    domainesActifs: actifs,
    findings: actifs,
    usurpations,
    urlsPhishing,
    sources,
    mesure: mesurerFauxPositifs(actifs, options.tailleEchantillon ?? 100, maintenant),
  };
}

/** Crée l'org absente du référentiel avant d'y rattacher une preuve. */
export async function assurerOrg(cible: Cible): Promise<number | null> {
  if (cible.orgId !== null) return cible.orgId;
  const slug = slugify(cible.orgName);
  if (!slug) return null;
  await ingestQuery(
    `INSERT INTO org (name, slug, kind, dept, domain, status)
     VALUES ($1, $2, $3, $4, $5, 'confirme') ON CONFLICT (slug) DO NOTHING`,
    [cible.orgName, slug, cible.orgName.toLowerCase().includes("universit") ? "enseignement" : "collectivite", cible.dept, cible.domain],
  );
  const res = await query<{ id: number }>("SELECT id FROM org WHERE slug = $1", [slug]);
  return res.rows[0]?.id ?? null;
}

async function assurerSource(id: string, family: string, url: string): Promise<void> {
  await ingestQuery(
    `INSERT INTO source (id, name, family, url) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET family = EXCLUDED.family, url = EXCLUDED.url`,
    [id, `${id} (détection passive)`, family, url],
  );
}

/** Événements vérifiables, un par domaine confirmé ou URL de flux rattachée. */
export async function enregistrerResultats(resultat: ResultatScan): Promise<{ evenements: number }> {
  const sourceId = "typosquat-passif";
  let evenements = 0;
  if (resultat.usurpations.length === 0 && resultat.urlsPhishing.length === 0) return { evenements };
  await assurerSource(sourceId, "typosquat", "https://crt.sh/");

  for (const { finding, verdict } of resultat.usurpations) {
    const cible: Cible = {
      orgId: finding.orgId,
      orgName: finding.orgName,
      domain: finding.base,
      dept: finding.dept,
      referentiel: true,
    };
    const orgId = await assurerOrg(cible);
    const url = `https://${finding.domain}/`;
    const res = await ingestQuery(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, severity,
        confidence, source_id, source_url, evidence, org_id)
       VALUES ($1, 'typosquat', 'technical_indicator', $2, $3, now(), 4, $4, $5, $6, $7::jsonb, $8)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        `typosquat:${finding.domain}:${orgId ?? "org"}`,
        `Domaine usurpateur probable : ${finding.domain}`,
        `Variante ${finding.kind} du domaine ${finding.base} (${finding.orgName}). ${verdict.motifs.join(", ")}.`,
        verdict.confiance === "eleve" ? "B2" : "C3",
        sourceId,
        url,
        JSON.stringify({
          orgName: finding.orgName,
          base: finding.base,
          kind: finding.kind,
          similarity: finding.similarity,
          a: finding.a,
          aaaa: finding.aaaa,
          cert: finding.cert,
          page: finding.page ? { status: finding.page.status, url: finding.page.url, title: finding.page.title } : null,
          verdict,
          sources: ["dns", "crt.sh", "page-publique"],
        }),
        orgId,
      ],
    );
    evenements += res.rowCount ?? 0;
  }

  for (const feed of [...new Set(resultat.urlsPhishing.map((u) => u.feed))]) {
    await assurerSource(feed, "phishing", FEEDS.find((f) => f.id === feed)?.url ?? "");
  }
  for (const url of resultat.urlsPhishing) {
    const cible: Cible = {
      orgId: url.orgId,
      orgName: url.orgName,
      domain: url.base,
      dept: url.dept,
      referentiel: true,
    };
    const orgId = await assurerOrg(cible);
    const res = await ingestQuery(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, severity, confidence,
        source_id, source_url, evidence, org_id)
       VALUES ($1, 'phishing', 'third_party_claim', $2, $3, 4, 'C3', $4, $5, $6::jsonb, $7)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        `phishing-feed:${url.feed}:${url.url}`,
        `URL phishing visant ${url.orgName}`,
        `URL signalée par ${url.feed} et rattachée à ${url.orgName} (${url.motif}).`,
        url.feed,
        url.url,
        JSON.stringify({ orgName: url.orgName, base: url.base, motif: url.motif, feed: url.feed }),
        orgId,
      ],
    );
    evenements += res.rowCount ?? 0;
  }
  return { evenements };
}
