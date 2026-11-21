/**
 * Fuites documentées touchant les organisations de Nouvelle-Aquitaine.
 *
 * Quatre sources publiques, interrogées réellement, sans clé privée :
 *  1. HIBP /api/v3/breaches — index des violations, métadonnées publiques ;
 *  2. LeakIX — recherche publique (`scope=leak`) par domaine du référentiel ;
 *  3. DataBreaches.net — flux RSS d'incidents documentés ;
 *  4. Pwned Passwords — préfixe k-anonyme, sans jamais stocker de suffixe ni
 *     de mot de passe.
 *
 * Seules les métadonnées des fuites sont conservées (nom, date, domaine,
 * nombre de comptes, URL source, contexte factuel). Aucune donnée personnelle
 * de victime — ni mot de passe, ni adresse e-mail, ni IP d'hôte — n'est
 * persistée. Un hôte LeakIX qui n'est pas un nom de domaine rattaché à une
 * organisation est ignoré.
 *
 * Le rapprochement est strict : domaine identique, sous-domaine ou domaine
 * parent d'un même domaine enregistrable. Aucune correspondance sur le nom
 * seul (risque de faux positif sur les clubs et succursales locales).
 */
import { createHash } from "node:crypto";
import type { CollectContext, Collector } from "@radar/shared";
import { ingestQuery, query } from "../db.js";
import { domaineRacine, normalizeDomainValue } from "../match/domaine.js";

type HibpBreach = {
  Name?: unknown;
  Domain?: unknown;
  BreachDate?: unknown;
  AddedDate?: unknown;
  PwnCount?: unknown;
  Source?: unknown;
  IsVerified?: unknown;
  IsFabricated?: unknown;
  DataClasses?: unknown;
};

type OrgRow = { id: number; name: string; domain: string | null; website: string | null };

export type ReferenceFuite = {
  id: string;
  source: string;
  name: string;
  domain: string | null;
  breachDate: string | null;
  accounts: number | null;
  sourceUrl: string;
  evidence: Record<string, unknown>;
};

export type CorrespondanceFuite = {
  fuiteId: string;
  orgId: number;
  domain: string;
  matchedBy: string;
  evidence: Record<string, unknown>;
};

export type StatSource = {
  source: string;
  tentatives: number;
  echecs: number;
  detail: Record<string, unknown>;
};

export type ResultatFuites = {
  references: number;
  correspondances: number;
  organisations: number;
  domainesOrganisations: number;
  stats: StatSource[];
  prochainIndexLeakix: number;
};

type HitLeakix = {
  host: string;
  plugin: string;
  severity: string;
  country: string;
  firstSeen: string | null;
  lastSeen: string | null;
  fingerprint: string;
  matchedBy: string;
};

type ItemRss = { title: string; link: string; pubDate: string; description: string };

const HIBP_URL = "https://haveibeenpwned.com/api/v3/breaches";
const DATABREACHES_URL = "https://www.databreaches.net/feed/";
const LEAKIX_BASE = "https://leakix.net/search?scope=leak&q=";
const PWNED_PREFIX = createHash("sha256").update("radar-cyber-nouvelle-aquitaine").digest("hex").slice(0, 5);
const LEAKIX_PAR_CYCLE = 40;
const MAX_TEXTE = 300;

/** Nettoie les entités HTML minimales nécessaires aux flux RSS et à LeakIX. */
function decoderHtml(texte: string): string {
  return texte
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tronquer(texte: string, max = MAX_TEXTE): string {
  return texte.length > max ? texte.slice(0, max - 1) + "…" : texte;
}

/** Date `YYYY-MM-DD`, ou null plutôt qu'une valeur fabriquée. */
function dateIso(valeur: unknown): string | null {
  if (typeof valeur !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(valeur)) return null;
  const d = new Date(valeur);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Rapprochement par domaine : égalité, sous-domaine ou parent, dans la même
 * racine enregistrable. `co.uk`/`com.br` sont exclus par `domaineRacine`.
 */
export function correspondreDomaine(
  domaineFuite: string | null | undefined,
  domaineOrg: string | null | undefined,
): "exact" | "sous-domaine" | "parent" | null {
  const fuite = normalizeDomainValue(domaineFuite ?? "");
  const org = normalizeDomainValue(domaineOrg ?? "");
  if (!fuite || !org) return null;
  if (fuite === org) return "exact";
  const racineFuite = domaineRacine(fuite);
  if (!racineFuite || racineFuite !== domaineRacine(org)) return null;
  if (fuite.endsWith(`.${org}`)) return "sous-domaine";
  if (org.endsWith(`.${fuite}`)) return "parent";
  return null;
}

/** Présence d'un domaine comme token entier dans un texte libre. */
export function domaineDansTexte(domaine: string, texte: string): boolean {
  const net = normalizeDomainValue(domaine);
  if (!net) return false;
  const echappe = net.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9-])${echappe}(?![a-z0-9-])`, "i").test(texte);
}

/** Extrait les résultats LeakIX d'une page publique, sans IP ni secret. */
export function extraireHitsLeakix(html: string, domaineOrg: string): HitLeakix[] {
  const hits: HitLeakix[] = [];
  const blocs = html.split(/<hr\s*\/?>/i);
  for (const bloc of blocs) {
    const host = decoderHtml(bloc.match(/<a href="\/host\/[^"]*">\s*([^<]+?)\s*<\/a>/i)?.[1] ?? "");
    if (!host || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) continue;
    const matchedBy = correspondreDomaine(host, domaineOrg);
    if (!matchedBy) continue;
    const parametre = (nom: string): string => {
      const m = bloc.match(new RegExp(`${nom}%3A%22([^"%]+)%22`, "i"))?.[1] ?? "";
      try { return decoderHtml(decodeURIComponent(m)); } catch { return decoderHtml(m); }
    };
    const dates = [...bloc.matchAll(/\b(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\b/g)].map((m) =>
      m[1]?.replace(" ", "T") + ":00Z",
    );
    hits.push({
      host,
      plugin: tronquer(parametre("plugin"), 100),
      severity: tronquer(parametre("events\\.leak\\.severity"), 40),
      country: tronquer(parametre("country"), 80),
      firstSeen: dates[0] ?? null,
      lastSeen: dates[1] ?? null,
      fingerprint: (bloc.match(/l9fp%3A%22([a-f0-9]+)%22/i)?.[1] ?? "").slice(0, 100),
      matchedBy,
    });
  }
  return hits;
}

/** Analyse minimale d'un flux RSS : ni contenu d'article, ni donnée personnelle. */
export function extraireItemsRss(xml: string): ItemRss[] {
  const champ = (bloc: string, nom: string): string => {
    const m = bloc.match(new RegExp(`<${nom}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${nom}>`, "i"));
    return decoderHtml(m?.[1] ?? "");
  };
  return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []).map((bloc) => ({
    title: tronquer(champ(bloc, "title")),
    link: tronquer(champ(bloc, "link"), 500),
    pubDate: champ(bloc, "pubDate"),
    description: tronquer(champ(bloc, "description"), 1000),
  }));
}

function empreinte(valeur: string): string {
  return createHash("sha256").update(valeur).digest("hex").slice(0, 24);
}

async function insererReferences(refs: ReferenceFuite[]): Promise<void> {
  if (refs.length === 0) return;
  await ingestQuery(
    `INSERT INTO fuite_reference (id, source, name, domain, breach_date, accounts, source_url, evidence)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[],
                          $5::date[], $6::bigint[], $7::text[], $8::jsonb[])
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, domain = EXCLUDED.domain,
       breach_date = EXCLUDED.breach_date, accounts = EXCLUDED.accounts,
       source_url = EXCLUDED.source_url, evidence = EXCLUDED.evidence,
       collected_at = now()`,
    [
      refs.map((r) => r.id),
      refs.map((r) => r.source),
      refs.map((r) => r.name),
      refs.map((r) => r.domain),
      refs.map((r) => r.breachDate),
      refs.map((r) => r.accounts),
      refs.map((r) => r.sourceUrl),
      refs.map((r) => JSON.stringify(r.evidence)),
    ],
  );
}

async function insererCorrespondances(matches: CorrespondanceFuite[]): Promise<void> {
  if (matches.length === 0) return;
  await ingestQuery(
    `INSERT INTO fuite_org (fuite_id, org_id, domain, matched_by, evidence)
     SELECT * FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::jsonb[])
     ON CONFLICT (fuite_id, org_id) DO UPDATE SET
       domain = EXCLUDED.domain, matched_by = EXCLUDED.matched_by,
       evidence = EXCLUDED.evidence`,
    [
      matches.map((m) => m.fuiteId),
      matches.map((m) => m.orgId),
      matches.map((m) => m.domain),
      matches.map((m) => m.matchedBy),
      matches.map((m) => JSON.stringify(m.evidence)),
    ],
  );
}

async function insererStats(stats: StatSource[]): Promise<void> {
  for (const s of stats) {
    await ingestQuery(
      `INSERT INTO fuite_stat (source, tentatives, echecs, detail)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (source) DO UPDATE SET
         tentatives = EXCLUDED.tentatives, echecs = EXCLUDED.echecs,
         detail = EXCLUDED.detail, collected_at = now()`,
      [s.source, s.tentatives, s.echecs, JSON.stringify(s.detail)],
    );
  }
}

/** Map domaine normalisé -> organisations du référentiel qui le portent. */
export async function chargerDomainesOrganisations(): Promise<Map<string, OrgRow[]>> {
  const { rows } = await query<OrgRow>(
    `SELECT id, name, domain, website FROM org
      WHERE (domain IS NOT NULL AND btrim(domain) <> '')
         OR (website IS NOT NULL AND btrim(website) <> '')`,
  );
  const index = new Map<string, OrgRow[]>();
  for (const org of rows) {
    const domaines = new Set(
      [normalizeDomainValue(org.domain), normalizeDomainValue(org.website)].filter(
        (d): d is string => Boolean(d),
      ),
    );
    for (const domaine of domaines) {
      const liste = index.get(domaine) ?? [];
      liste.push(org);
      index.set(domaine, liste);
    }
  }
  return index;
}

function ajouterCorrespondances(
  reference: ReferenceFuite,
  domaineFuite: string | null,
  index: Map<string, OrgRow[]>,
  matches: CorrespondanceFuite[],
  source: string,
): void {
  if (!domaineFuite) return;
  for (const [domaineOrg, orgs] of index) {
    const matchedBy = correspondreDomaine(domaineFuite, domaineOrg);
    if (!matchedBy) continue;
    for (const org of orgs) {
      matches.push({
        fuiteId: reference.id,
        orgId: org.id,
        domain: domaineOrg,
        matchedBy,
        evidence: { source, domaine_fuite: domaineFuite, organisation: org.name },
      });
    }
  }
}

/** Collecte complète : sources publiques, rapprochement strict, écriture probe. */
export async function collecterFuites(ctx: CollectContext): Promise<ResultatFuites> {
  const index = await chargerDomainesOrganisations();
  const references: ReferenceFuite[] = [];
  const matches: CorrespondanceFuite[] = [];
  const stats: StatSource[] = [];

  // 1. HIBP — index des violations (aucune clé, aucun compte demandé).
  const hibp: StatSource = { source: "hibp", tentatives: 1, echecs: 0, detail: {} };
  try {
    const breaches = await ctx.fetchJson<HibpBreach[]>(HIBP_URL);
    const liste = Array.isArray(breaches) ? breaches : [];
    let avecDomaine = 0;
    for (const b of liste) {
      const nom = tronquer(String(b.Name ?? "").trim(), 200);
      if (!nom) continue;
      const domaine = normalizeDomainValue(String(b.Domain ?? ""));
      if (domaine) avecDomaine++;
      const reference: ReferenceFuite = {
        id: `hibp:${empreinte(nom)}`,
        source: "hibp",
        name: nom,
        domain: domaine,
        breachDate: dateIso(b.BreachDate),
        accounts: Number.isFinite(Number(b.PwnCount)) && Number(b.PwnCount) >= 0
          ? Number(b.PwnCount)
          : null,
        sourceUrl: HIBP_URL,
        evidence: {
          added_date: dateIso(b.AddedDate),
          verified: b.IsVerified === true,
          fabricated: b.IsFabricated === true,
          data_classes: Array.isArray(b.DataClasses) ? b.DataClasses.slice(0, 40) : [],
          reference: b.Source == null ? null : tronquer(String(b.Source), 200),
        },
      };
      references.push(reference);
      ajouterCorrespondances(reference, domaine, index, matches, "hibp");
    }
    stats.push({ ...hibp, detail: { breaches: liste.length, avec_domaine: avecDomaine } });
  } catch (e) {
    stats.push({ ...hibp, echecs: 1, detail: { erreur: tronquer(String(e), 200) } });
    ctx.log(`fuites: HIBP indisponible — ${String(e)}`);
  }

  // 2. Index documenté (RSS) : seul le domaine explicite déclenche un rattachement.
  const rss: StatSource = { source: "databreaches", tentatives: 1, echecs: 0, detail: {} };
  try {
    const items = extraireItemsRss(await ctx.fetchText(DATABREACHES_URL));
    let retenus = 0;
    for (const item of items) {
      const domaines = [...index.keys()].filter((d) =>
        domaineDansTexte(d, `${item.title} ${item.description}`),
      );
      if (domaines.length === 0 || !item.link) continue;
      retenus++;
      const reference: ReferenceFuite = {
        id: `dbnet:${empreinte(item.link)}`,
        source: "databreaches",
        name: item.title || "Incident documenté",
        domain: domaines[0] ?? null,
        breachDate: dateIso(item.pubDate),
        accounts: null,
        sourceUrl: item.link,
        evidence: { feed: "databreaches.net", domaines },
      };
      references.push(reference);
      for (const domaine of domaines) {
        ajouterCorrespondances(reference, domaine, index, matches, "databreaches");
      }
    }
    stats.push({ ...rss, detail: { items: items.length, retenus } });
  } catch (e) {
    stats.push({ ...rss, echecs: 1, detail: { erreur: tronquer(String(e), 200) } });
    ctx.log(`fuites: flux DataBreaches indisponible — ${String(e)}`);
  }

  // 3. LeakIX — recherche publique par domaine du référentiel, par lots.
  const tousLesDomaines = [...index.keys()].sort();
  const cursor = (ctx.cursor ?? {}) as { idx?: number; toutLeReferentiel?: boolean };
  const depart = cursor.toutLeReferentiel === true ? 0 : Math.max(0, Number(cursor.idx) || 0) % (tousLesDomaines.length || 1);
  const taille = cursor.toutLeReferentiel === true ? tousLesDomaines.length : LEAKIX_PAR_CYCLE;
  const lot = tousLesDomaines.slice(depart, depart + taille);
  const leakix: StatSource = {
    source: "leakix",
    tentatives: lot.length,
    echecs: 0,
    detail: { domaines_du_referentiel: tousLesDomaines.length, domaines_interroges: lot.length, hits: 0 },
  };
  for (const domaine of lot) {
    try {
      const html = await ctx.fetchText(`${LEAKIX_BASE}${encodeURIComponent(domaine)}`);
      for (const hit of extraireHitsLeakix(html, domaine)) {
        const reference: ReferenceFuite = {
          id: `leakix:${hit.fingerprint || empreinte(`${hit.host}|${hit.plugin}|${hit.firstSeen ?? ""}`)}`,
          source: "leakix",
          name: hit.plugin || "Exposition indexée par LeakIX",
          domain: hit.host,
          breachDate: dateIso(hit.firstSeen),
          accounts: null,
          sourceUrl: `https://leakix.net/host/${encodeURIComponent(hit.host)}`,
          evidence: {
            plugin: hit.plugin,
            severity: hit.severity,
            country: hit.country,
            first_seen: hit.firstSeen,
            last_seen: hit.lastSeen,
            fingerprint: hit.fingerprint,
          },
        };
        references.push(reference);
        ajouterCorrespondances(reference, hit.host, index, matches, "leakix");
        leakix.detail.hits = (leakix.detail.hits as number) + 1;
      }
    } catch (e) {
      leakix.echecs++;
      ctx.log(`fuites: LeakIX ${domaine} indisponible — ${String(e)}`);
    }
  }
  stats.push(leakix);

  // 4. k-anonymat : on ne garde que le nombre de suffixes renvoyés.
  const pwned: StatSource = { source: "pwned-passwords", tentatives: 1, echecs: 0, detail: {} };
  try {
    const reponse = await ctx.fetchText(`https://api.pwnedpasswords.com/range/${PWNED_PREFIX}`);
    stats.push({
      ...pwned,
      detail: {
        prefixe: PWNED_PREFIX,
        suffixes_recus: reponse.split("\n").filter((l) => l.includes(":")).length,
        suffixes_stockes: 0,
        donnees_personnelles_stockees: 0,
      },
    });
  } catch (e) {
    stats.push({ ...pwned, echecs: 1, detail: { erreur: tronquer(String(e), 200) } });
    ctx.log(`fuites: Pwned Passwords indisponible — ${String(e)}`);
  }

  await insererReferences(references);
  await insererCorrespondances(matches);
  await insererStats(stats);

  const organisations = new Set(matches.map((m) => m.orgId)).size;
  ctx.log(
    `fuites: ${references.length} référence(s), ${matches.length} rattachement(s), ` +
    `${organisations} organisation(s) NA, échecs ` +
    stats.map((s) => `${s.source} ${s.echecs}/${s.tentatives}`).join(", "),
  );
  const prochainIndex = cursor.toutLeReferentiel === true
    ? 0
    : (depart + taille) % (tousLesDomaines.length || 1);
  return {
    references: references.length,
    correspondances: matches.length,
    organisations,
    domainesOrganisations: tousLesDomaines.length,
    stats,
    prochainIndexLeakix: prochainIndex,
  };
}

export const collector: Collector = {
  id: "fuites",
  family: "leaks",
  intervalSec: 86_400,
  async run(ctx) {
    const resultat = await collecterFuites(ctx);
    return { events: [], cursor: { idx: resultat.prochainIndexLeakix } };
  },
};
