/**
 * Harvest of ransomware claim sites.
 *
 * The groups' `.onion` blogs are unreachable from this host (local SOCKS:
 * curl error 97, HTTP 000). The collector therefore goes through the two
 * public aggregators that relay them: RansomLook (JSON API, groups, posts,
 * evidence URL) and ransomwatch (posts.json on GitHub). Each blog is still
 * queried through RansomLook's `/api/group/<slug>` endpoint so that the
 * result — answered or blocked — is measured site by site.
 * A claim is never presented as a confirmed incident. Nouvelle-Aquitaine
 * attachment requires an explicit signal: department (the `relevance.ts`
 * rules), a commune from the referential, or a referential organisation
 * recognised by a distinctive name or an exact domain.
 */
import { createHash } from "node:crypto";
import { ingestQuery } from "../db.js";
import { DEPT_LABELS, PREFECTURES, admitsDepartment } from "./relevance.js";

const RANSOMLOOK = "https://www.ransomlook.io";
const RANSOMWATCH = "https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json";
const NA_DEPTS: readonly string[] = Object.keys(DEPT_LABELS);
const NA_DEPT_LABELS: readonly string[] = Object.values(DEPT_LABELS);

/** Les communes génériques ne prouvent rien sur la région. */
const GENERIC_CITIES: Record<string, true> = {
  saint: true, sainte: true, saintes: true, office: true, groupe: true,
  centre: true, region: true, france: true, europe: true, national: true,
  nouvelle: true, aquitaine: true, services: true, societe: true, technologie: true,
};

export type ClaimSource = "ransomlook" | "ransomwatch";

export type ReponseJson = { status: number; body: unknown; error?: string };
export type FetchJson = (url: string) => Promise<ReponseJson>;

export const fetchJson: FetchJson = async (url) => {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "radar-cyber-leak-sites/1.0" },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return { status: res.status, body: null, error: `HTTP ${res.status}` };
    try {
      return { status: res.status, body: await res.json() };
    } catch {
      return { status: res.status, body: null, error: "JSON illisible" };
    }
  } catch (err) {
    return { status: 0, body: null, error: err instanceof Error ? err.message : String(err) };
  }
};

export type Claim = {
  fingerprint: string;
  source: ClaimSource;
  siteSlug: string;
  groupName: string;
  victim: string;
  country: string | null;
  sector: string | null;
  publishedAt: string | null;
  description: string | null;
  evidenceUrl: string | null;
};

export type ClaimEnrichie = Claim & {
  na: boolean;
  naMotifs: string[];
  orgId: number | null;
  orgName: string | null;
  rattachementVia: "domain" | "name" | null;
};

export type SiteResultat = {
  source: ClaimSource;
  slug: string;
  groupName: string;
  siteUrl: string | null;
  httpStatus: number;
  ok: boolean;
  claims: number;
  error: string | null;
};

export type ErreurSource = { url: string; status: number; message: string };

export type RapportMoisson = {
  generatedAt: string;
  sites: SiteResultat[];
  claims: ClaimEnrichie[];
  errors: ErreurSource[];
  stats: {
    sitesHarvested: number;
    sitesBlocked: number;
    claims: number;
    claimsNa: number;
    claimsAttached: number;
    bySource: Record<string, number>;
  };
};

export type OptionsMoisson = {
  fetchJson?: FetchJson;
  maxSites?: number;
  years?: number[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function records(body: unknown): Record<string, unknown>[] {
  return Array.isArray(body)
    ? body.filter((value): value is Record<string, unknown> => value !== null && typeof value === "object")
    : [];
}

/** Normalisation sans accents, utilisée pour les comparaisons territoriales. */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ");
}

function normalizeName(raw: string): string {
  return normalize(raw)
    .replace(/\b(sarl|sas|sa|eurl|sci|scp|association|assoc|groupe|group|inc|llc|ltd|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function groupSlug(name: string): string {
  return normalize(name).trim().replace(/\s+/g, "-");
}

function dateIso(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const iso = /^\d{4}-\d{2}-\d{2}/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : new Date(ts).toISOString();
}

function evidenceUrl(link: unknown, source: ClaimSource): string | null {
  const raw = text(link);
  if (raw.startsWith("/")) return `${RANSOMLOOK}${raw}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  // ransomwatch ne publie que titre/groupe/date : la preuve est la liste elle-même.
  return source === "ransomwatch" ? RANSOMWATCH : null;
}

function countryFrom(description: string): string | null {
  const d = description.toLowerCase();
  const countries: [RegExp, string][] = [
    [/\bfrance\b|\bfrench\b|\bfrancais\b/, "France"],
    [/\bunited states\b|\busa\b|\bu\.s\.a\b/, "United States"],
    [/\bbrazil\b|\bbrasil\b/, "Brazil"],
    [/\bgermany\b|\bdeutschland\b/, "Germany"],
    [/\bunited kingdom\b|\b UK\b/, "United Kingdom"],
    [/\bspain\b|\bespana\b/, "Spain"],
    [/\bitaly\b|\bitalia\b/, "Italy"],
    [/\bcanada\b/, "Canada"],
    [/\bindia\b/, "India"],
  ];
  for (const [pattern, label] of countries) if (pattern.test(d)) return label;
  return null;
}

function sectorFrom(description: string): string | null {
  const d = description.toLowerCase();
  const sectors: [RegExp, string][] = [
    [/health|medical|hospital|clinic|pharma|sante/, "Healthcare"],
    [/software|saas|it services|technology/, "Software"],
    [/manufactur|industrial|factory|industrie/, "Manufacturing"],
    [/bank|finance|insurance|assurance|financial/, "Finance"],
    [/education|university|school|ecole|universite/, "Education"],
    [/logistic|transport|freight|transport/, "Logistics"],
    [/retail|commerce|shop|distribution/, "Retail"],
    [/energy|electric|oil|gas|energie/, "Energy"],
    [/agricultur|wine|viticol|farm|agricole/, "Agriculture"],
    [/government|municipal|public sector|collectivite|mairie/, "Public sector"],
    [/construction|btp|building/, "Construction"],
  ];
  for (const [pattern, label] of sectors) if (pattern.test(d)) return label;
  return null;
}

export function parseClaim(post: unknown, source: ClaimSource): Claim | null {
  if (post === null || typeof post !== "object") return null;
  const p = post as Record<string, unknown>;
  const victim = text(p.post_title);
  if (victim.length < 2) return null;
  const groupName = text(p.group_name) || "unknown";
  const publishedAt = dateIso(p.discovered);
  const description = text(p.description) || null;
  const seed = `${source}|${groupName}|${victim}|${publishedAt ?? ""}`;
  return {
    fingerprint: createHash("sha256").update(seed).digest("hex").slice(0, 24),
    source,
    siteSlug: groupSlug(groupName),
    groupName,
    victim: victim.slice(0, 400),
    country: countryFrom(description ?? ""),
    sector: sectorFrom(description ?? ""),
    publishedAt,
    description: description?.slice(0, 4000) ?? null,
    evidenceUrl: evidenceUrl(p.link, source),
  };
}

export function extractDomains(raw: string): string[] {
  const found = raw.toLowerCase().match(/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:fr|com|net|org|eu|info|io|biz)\b/g) ?? [];
  return [...new Set(found.filter((domain) => domain.length <= 120))];
}

export type OrgRef = { id: number; name: string; dept: string | null; city: string | null };
export type Reference = {
  cities: Set<string>;
  names: Map<string, OrgRef[]>;
  domains: Map<string, OrgRef[]>;
};

function add(map: Map<string, OrgRef[]>, key: string, org: OrgRef): void {
  const list = map.get(key) ?? [];
  if (!list.some((entry) => entry.id === org.id)) list.push(org);
  map.set(key, list);
}

/** Charge les trois index de rattachement, par lots bornés (hash join côté SQL). */
export async function loadReference(claims: readonly Claim[]): Promise<Reference> {
  const names = [...new Set(claims.map((c) => normalizeName(c.victim)).filter((n) => n.length >= 5))];
  const domains = [...new Set(claims.flatMap((c) => extractDomains(`${c.victim} ${c.description ?? ""}`)))];
  const towns = await ingestQuery<{ city: string }>(
    "SELECT DISTINCT lower(city) AS city FROM org WHERE dept = ANY($1::text[]) AND city IS NOT NULL AND length(city) >= 5",
    [NA_DEPTS],
  );
  const cities = new Set(
    towns.rows.map((r) => normalizeName(r.city))
      .filter((city) => city.length >= 5 && GENERIC_CITIES[city] !== true),
  );
  for (const prefecture of PREFECTURES) cities.add(normalizeName(prefecture));

  const byName = new Map<string, OrgRef[]>();
  const byDomain = new Map<string, OrgRef[]>();
  const chunked = <T,>(list: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  };
  for (const chunk of chunked(names, 4000)) {
    const r = await ingestQuery<{ cle: string; id: number; name: string; dept: string | null; city: string | null }>(
      `WITH n AS (SELECT DISTINCT unnest($1::text[]) AS cle)
         SELECT n.cle, o.id, o.name, o.dept, o.city
           FROM n JOIN org o ON o.name_norm = n.cle AND o.dept = ANY($2::text[])`,
      [chunk, NA_DEPTS],
    );
    for (const row of r.rows) add(byName, row.cle, row);
    const a = await ingestQuery<{ cle: string; id: number; name: string; dept: string | null; city: string | null }>(
      `WITH n AS (SELECT DISTINCT unnest($1::text[]) AS cle)
         SELECT n.cle, o.id, o.name, o.dept, o.city
           FROM n JOIN org_alias al ON al.nom_normalise = n.cle AND al.status = 'active'
           JOIN org o ON o.id = al.org_id AND o.dept = ANY($2::text[])`,
      [chunk, NA_DEPTS],
    );
    for (const row of a.rows) add(byName, row.cle, row);
  }
  for (const chunk of chunked(domains, 4000)) {
    const r = await ingestQuery<{ cle: string; id: number; name: string; dept: string | null; city: string | null }>(
      `WITH d AS (SELECT DISTINCT unnest($1::text[]) AS cle)
         SELECT d.cle, o.id, o.name, o.dept, o.city
           FROM d JOIN org o ON lower(o.domain) = d.cle AND o.dept = ANY($2::text[])`,
      [chunk, NA_DEPTS],
    );
    for (const row of r.rows) add(byDomain, row.cle, row);
  }
  return { cities, names: byName, domains: byDomain };
}

export type Rattachement = { orgId: number; orgName: string; via: "domain" | "name" };

/** N'attache que si la correspondance est unique, ou désambiguïsée par la commune. */
export function attachOrg(claim: Claim, ref: Reference): Rattachement | null {
  const hay = normalize(`${claim.victim} ${claim.description ?? ""}`);
  const resolve = (list: OrgRef[] | undefined, via: "domain" | "name"): Rattachement | null => {
    if (!list?.length) return null;
    const seen = new Set<number>();
    const distinct = list.filter((org) => (seen.has(org.id) ? false : (seen.add(org.id), true)));
    const byCity = distinct.length > 1
      ? distinct.filter((org) => org.city && hay.includes(` ${normalizeName(org.city)} `))
      : [];
    const org = distinct.length === 1 ? distinct[0] : byCity.length === 1 ? byCity[0] : null;
    return org ? { orgId: org.id, orgName: org.name, via } : null;
  };
  for (const domain of extractDomains(claim.victim)) {
    const match = resolve(ref.domains.get(domain), "domain");
    if (match) return match;
  }
  for (const domain of extractDomains(claim.description ?? "").slice(0, 6)) {
    const match = resolve(ref.domains.get(domain), "domain");
    if (match) return match;
  }
  const key = normalizeName(claim.victim);
  const tokens = key.split(" ").filter((token) => token.length >= 2);
  const distinctive = tokens.length >= 2 ? tokens.some((token) => token.length >= 5) : key.length >= 10;
  return distinctive ? resolve(ref.names.get(key), "name") : null;
}

/** Signals territoriaux admis : département, commune du référentiel, rattachement. */
export function detectNA(raw: string, ref: Reference): string[] {
  const motifs: string[] = [];
  if (admitsDepartment(raw, NA_DEPT_LABELS)) motifs.push("departement");
  const hay = normalize(raw);
  const tokens = hay.split(/[^a-z0-9]+/).filter((token) => token.length >= 5 && GENERIC_CITIES[token] !== true);
  if (tokens.some((token) => ref.cities.has(token))) motifs.push("commune");
  if (PREFECTURES.some((prefecture) => prefecture.includes(" ") && hay.includes(` ${prefecture} `))) motifs.push("commune");
  return motifs;
}

async function loadPosts(fetcher: FetchJson, url: string, source: ClaimSource, errors: ErreurSource[]): Promise<Claim[]> {
  const res = await fetcher(url);
  if (res.status !== 200) {
    errors.push({ url, status: res.status, message: res.error ?? `HTTP ${res.status}` });
    return [];
  }
  const posts = Array.isArray(res.body) ? res.body : [];
  return posts.map((post) => parseClaim(post, source)).filter((claim): claim is Claim => claim !== null);
}

async function harvestSites(
  fetcher: FetchJson,
  groups: string[],
  perGroup: Map<string, number>,
  maxSites: number,
  errors: ErreurSource[],
): Promise<SiteResultat[]> {
  const ordered = [...groups].sort(
    (a, b) => (perGroup.get(b) ?? 0) - (perGroup.get(a) ?? 0) || a.localeCompare(b),
  );
  const candidates = ordered.filter((slug) => (perGroup.get(slug) ?? 0) > 0).slice(0, maxSites);
  const sites: SiteResultat[] = [];
  for (const slug of candidates) {
    const url = `${RANSOMLOOK}/api/group/${encodeURIComponent(slug)}`;
    const res = await fetcher(url);
    const entries = records(res.body);
    const locations = entries[0]?.locations;
    const first = Array.isArray(locations) ? records(locations)[0] : undefined;
    const siteUrl = text(first?.slug) || null;
    const ok = res.status === 200 && siteUrl !== null;
    const error = ok ? null : (res.error ?? "aucune adresse de blog publiée");
    if (error) errors.push({ url, status: res.status, message: error });
    sites.push({
      source: "ransomlook",
      slug,
      groupName: entries[0]?.name ? text(entries[0].name) : slug,
      siteUrl,
      httpStatus: res.status,
      ok,
      claims: perGroup.get(slug) ?? 0,
      error,
    });
  }
  return sites;
}

export async function harvest(options: OptionsMoisson = {}): Promise<RapportMoisson> {
  const fetcher = options.fetchJson ?? fetchJson;
  const maxSites = options.maxSites ?? 60;
  const year = new Date().getUTCFullYear();
  const years = options.years ?? [year, year - 1];
  const errors: ErreurSource[] = [];

  const groupsRes = await fetcher(`${RANSOMLOOK}/api/groups`);
  if (groupsRes.status !== 200) {
    errors.push({ url: `${RANSOMLOOK}/api/groups`, status: groupsRes.status, message: groupsRes.error ?? `HTTP ${groupsRes.status}` });
  }
  const groups = Array.isArray(groupsRes.body)
    ? groupsRes.body.filter((group): group is string => typeof group === "string").map(groupSlug)
    : [];

  const urls = [`${RANSOMLOOK}/api/recent/5000`, ...years.map((y) => `${RANSOMLOOK}/api/posts/${y}`)];
  const raw: Claim[] = [];
  for (const url of urls) raw.push(...await loadPosts(fetcher, url, "ransomlook", errors));
  raw.push(...await loadPosts(fetcher, RANSOMWATCH, "ransomwatch", errors));

  const uniqueClaims = new Map<string, Claim>();
  for (const claim of raw) if (!uniqueClaims.has(claim.fingerprint)) uniqueClaims.set(claim.fingerprint, claim);
  const claims = [...uniqueClaims.values()];
  const perGroup = new Map<string, number>();
  for (const claim of claims) perGroup.set(claim.siteSlug, (perGroup.get(claim.siteSlug) ?? 0) + 1);

  const sites = await harvestSites(fetcher, groups, perGroup, maxSites, errors);
  const ref = await loadReference(claims);
  const enriched: ClaimEnrichie[] = claims.map((claim) => {
    const attached = attachOrg(claim, ref);
    const motifs = detectNA(`${claim.victim} ${claim.description ?? ""}`, ref);
    if (attached) motifs.push("rattachement");
    const na = motifs.length > 0;
    return {
      ...claim,
      country: na && claim.country === null ? "France" : claim.country,
      na,
      naMotifs: [...new Set(motifs)],
      orgId: attached?.orgId ?? null,
      orgName: attached?.orgName ?? null,
      rattachementVia: attached?.via ?? null,
    };
  });

  const bySource: Record<string, number> = {};
  for (const claim of enriched) bySource[claim.source] = (bySource[claim.source] ?? 0) + 1;
  return {
    generatedAt: new Date().toISOString(),
    sites,
    claims: enriched,
    errors,
    stats: {
      sitesHarvested: sites.filter((site) => site.ok).length,
      sitesBlocked: sites.filter((site) => !site.ok).length,
      claims: enriched.length,
      claimsNa: enriched.filter((claim) => claim.na).length,
      claimsAttached: enriched.filter((claim) => claim.orgId !== null).length,
      bySource,
    },
  };
}

/** Écrit le rapport en base, de façon idempotente, par lots de 500. */
export async function enregistrer(rapport: RapportMoisson): Promise<{ sites: number; claims: number }> {
  for (const site of rapport.sites) {
    await ingestQuery(
      `INSERT INTO leak_site (source, slug, group_name, site_url, http_status, claim_count)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (source, slug) DO UPDATE SET
         group_name = EXCLUDED.group_name,
         site_url = EXCLUDED.site_url,
         http_status = EXCLUDED.http_status,
         claim_count = EXCLUDED.claim_count,
         harvested_at = now()`,
      [site.source, site.slug, site.groupName, site.siteUrl, site.httpStatus, site.claims],
    );
  }
  const columns = "fingerprint, source, site_slug, group_name, victim, country, sector, published_at, description, evidence_url, org_id, na, na_motif";
  let written = 0;
  for (let i = 0; i < rapport.claims.length; i += 500) {
    const batch = rapport.claims.slice(i, i + 500);
    const values: unknown[] = [];
    const tuples = batch.map((claim) => {
      const start = values.length;
      values.push(
        claim.fingerprint, claim.source, claim.siteSlug, claim.groupName, claim.victim,
        claim.country, claim.sector, claim.publishedAt, claim.description, claim.evidenceUrl,
        claim.orgId, claim.na, claim.naMotifs.join("+") || null,
      );
      return `(${Array.from({ length: 13 }, (_, j) => `$${start + j + 1}`).join(",")})`;
    });
    const result = await ingestQuery(
      `INSERT INTO leak_claim (${columns}) VALUES ${tuples.join(",")}
       ON CONFLICT (fingerprint) DO UPDATE SET
         org_id = EXCLUDED.org_id, na = EXCLUDED.na, na_motif = EXCLUDED.na_motif,
         country = EXCLUDED.country, sector = EXCLUDED.sector`,
      values,
    );
    written += result.rowCount ?? 0;
  }
  return { sites: rapport.sites.length, claims: written };
}
