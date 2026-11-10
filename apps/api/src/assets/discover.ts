// Découverte d'actifs à partir des domaines déclarés par les orgs.
//
// Deux sources externes, chacune limitée à une requête par seconde :
//   - DNS over HTTPS (Cloudflare) → adresses IP (A/AAAA) ;
//   - crt.sh → sous-domaines observés dans les certificats.
//
// Statuts : le domaine et les IP résolus sont « confirme » (preuve directe) ;
// un sous-domaines issu d'un certificat ancien reste « candidat ».

import { ingestQuery, query } from "../db.js";
import { doh } from "../enrich/dns.js";
import { certificatesFor } from "../enrich/certs.js";

/** Types produits par la découverte (la table asset en accepte d'autres). */
export type DiscoveredKind = "domain" | "subdomain" | "ip";

export interface OrgDomain {
  id: number;
  name: string;
  domain: string;
}

export interface FoundAssets {
  orgId: number;
  domain: string;
  ips: string[];
  subdomains: string[];
}

interface AssetRow {
  org_id: number;
  kind: DiscoveredKind;
  value: string;
  status: "confirme" | "candidat";
}

export interface SourceStat {
  calls: number;
  errors: number;
  items: number;
}

export type SourceStats = Record<"doh" | "crtsh", SourceStat>;

export interface DiscoverySummary {
  orgs: number;
  candidates: number;
  inserted: number;
  alreadyKnown: number;
  bySource: SourceStats;
}

export interface DiscoveryOptions {
  limit?: number;
  slug?: string;
  /** Sans `apply`, aucun candidat n'est écrit en base. */
  apply?: boolean;
  log?: (msg: string) => void;
}

/** Une requête par seconde et par source externe. */
const MIN_GAP_MS = 1000;
const DNS_CACHE_MS = 60_000;
/** crt.sh dépasse souvent 8 s (28 s observés) : on allonge le timeout. */
const CRT_TIMEOUT_MS = 20_000;

/**
 * File d'attente par source : les requêtes sont espacées d'au moins
 * `minGapMs` et exécutées l'une après l'autre. Deux sources distinctes
 * (DoH, crt.sh) ne se bloquent donc pas mutuellement.
 */
class RateLimiter {
  private lastAt = 0;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly minGapMs: number) {}

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      const wait = this.minGapMs - (Date.now() - this.lastAt);
      if (wait > 0) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, wait);
        await promise;
      }
      this.lastAt = Date.now();
      return fn();
    });
    // La file continue même si la requête échoue.
    this.tail = run.catch(() => undefined);
    return run;
  }
}

const dohLimiter = new RateLimiter(MIN_GAP_MS);
const crtLimiter = new RateLimiter(MIN_GAP_MS);

// Cache court : un même domaine peut revenir dans une liste d'orgs.
const dnsCache = new Map<string, { value: string[]; exp: number }>();

function cachedDns(key: string, fn: () => Promise<string[]>): Promise<string[]> {
  const hit = dnsCache.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.value);
  return fn().then((value) => {
    dnsCache.set(key, { value, exp: Date.now() + DNS_CACHE_MS });
    return value;
  });
}

/** Domaine nu, minuscule, sans protocole, ni `www.`, ni `*.` initial. */
export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\*\./, "")
    .replace(/^www\./, "");
}

async function resolveRecords(stats: SourceStats, name: string, type: "A" | "AAAA"): Promise<string[]> {
  stats.doh.calls++;
  try {
    const records = await cachedDns(`${type}:${name}`, () => dohLimiter.schedule(() => doh(name, type)));
    stats.doh.items += records.length;
    return records;
  } catch {
    stats.doh.errors++;
    return [];
  }
}

async function fetchCertNames(stats: SourceStats, domain: string): Promise<string[]> {
  stats.crtsh.calls++;
  try {
    const certs = await crtLimiter.schedule(() => certificatesFor(domain, CRT_TIMEOUT_MS));
    const names = certs.map((c) => c.name).filter((n) => n.length > 0);
    stats.crtsh.items += names.length;
    return names;
  } catch {
    stats.crtsh.errors++;
    return [];
  }
}

/** Noms de certificat → sous-domaines du domaine, dédupliqués. */
export function subdomainCandidates(domain: string, names: string[]): string[] {
  const root = normalizeDomain(domain);
  const out = new Set<string>();
  for (const raw of names) {
    // crt.sh concatène plusieurs noms (\n) dans name_value.
    for (const line of raw.split("\n")) {
      const name = normalizeDomain(line);
      if (!name || name === root || !name.endsWith(`.${root}`)) continue;
      out.add(name);
    }
  }
  return [...out].sort();
}

/** Découvre les actifs d'une org à partir de son domaine. */
export async function discoverOrgAssets(org: OrgDomain, stats: SourceStats): Promise<FoundAssets> {
  const domain = normalizeDomain(org.domain);
  const [a, aaaa, certNames] = await Promise.all([
    resolveRecords(stats, domain, "A"),
    resolveRecords(stats, domain, "AAAA"),
    fetchCertNames(stats, domain),
  ]);
  return {
    orgId: org.id,
    domain,
    ips: [...new Set([...a, ...aaaa])].sort(),
    subdomains: subdomainCandidates(domain, certNames),
  };
}

/** Orgs avec un domaine, optionnellement limitées à un slug. */
export async function loadOrgs(limit?: number, slug?: string): Promise<OrgDomain[]> {
  const params: unknown[] = [];
  let sql = "SELECT id, name, domain FROM org WHERE domain IS NOT NULL AND btrim(domain) <> ''";
  if (slug) {
    params.push(slug);
    sql += ` AND slug = $${params.length}`;
  }
  sql += " ORDER BY id";
  if (limit !== undefined) {
    params.push(limit);
    sql += ` LIMIT $${params.length}`;
  }
  const res = await query<OrgDomain>(sql, params);
  return res.rows;
}

/** Insertion idempotent : un asset déjà connu n'est pas recréé. */
export async function insertAssets(rows: AssetRow[]): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };
  const params: unknown[] = [];
  const values = rows.map((row) => {
    const base = params.length;
    params.push(row.org_id, row.kind, row.value, row.status);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  });
  const res = await ingestQuery(
    `INSERT INTO asset (org_id, kind, value, status) VALUES ${values.join(", ")} ON CONFLICT DO NOTHING`,
    params,
  );
  return { inserted: res.rowCount ?? 0 };
}

/**
 * Découvre les actifs des orgs et, avec `apply`, les écrit en base.
 * Sans `apply`, seuls les candidats sont comptés (dry-run).
 */
export async function discoverAssets(opts: DiscoveryOptions = {}): Promise<DiscoverySummary> {
  const log = opts.log ?? (() => {});
  const stats: SourceStats = {
    doh: { calls: 0, errors: 0, items: 0 },
    crtsh: { calls: 0, errors: 0, items: 0 },
  };
  const orgs = await loadOrgs(opts.limit, opts.slug);
  let candidates = 0;
  let inserted = 0;
  let alreadyKnown = 0;

  for (const org of orgs) {
    const found = await discoverOrgAssets(org, stats);
    const rows: AssetRow[] = [
      { org_id: org.id, kind: "domain", value: found.domain, status: "confirme" },
      ...found.ips.map(
        (value): AssetRow => ({ org_id: org.id, kind: "ip", value, status: "confirme" }),
      ),
      ...found.subdomains.map(
        (value): AssetRow => ({ org_id: org.id, kind: "subdomain", value, status: "candidat" }),
      ),
    ];
    candidates += rows.length;
    if (opts.apply) {
      const res = await insertAssets(rows);
      inserted += res.inserted;
      alreadyKnown += rows.length - res.inserted;
    }
    log(`${org.name} [${found.domain}] : ${found.ips.length} IP, ${found.subdomains.length} sous-domaine(s)`);
  }

  return { orgs: orgs.length, candidates, inserted, alreadyKnown, bySource: stats };
}
