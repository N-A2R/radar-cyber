/**
 * Passive typosquat scan for the top organisations of Nouvelle-Aquitaine.
 *
 * The target set comes from the live referential (dns_domaine joined to org),
 * not from a hard-coded list. Every probe is injected so tests stay offline.
 * New code and CLI output are English; the written report is French.
 */
import { query } from "../db.js";
import { sondeReelle } from "./phishing-scan.js";
import {
  classerUsurpation,
  deaccent,
  genererVariantes,
  similarite,
  variantesTld,
  type CertSnapshot,
  type PageSnapshot,
  type TyposquatFinding,
  type Variant,
  type Verdict,
} from "./typosquat.js";

export const NA_DEPARTMENTS = ["16", "17", "18", "23", "24", "33", "40", "47", "64", "79", "86", "87"] as const;

/** Ranked by workforce first, then by domain so the order is reproducible. */
export const TOP_TARGETS_SQL = `
WITH ranked AS (
  SELECT d.domain,
         min(d.label) AS label,
         max(o.effectif_min) AS effectif,
         (array_agg(o.id ORDER BY o.id))[1] AS org_id,
         min(o.dept) AS dept,
         row_number() OVER (
           ORDER BY max(o.effectif_min) DESC NULLS LAST, d.domain ASC
         ) AS rank
  FROM dns_domaine d
  JOIN org o ON o.id = ANY (d.org_ids)
  WHERE o.dept IN ('16', '17', '18', '23', '24', '33', '40', '47', '64', '79', '86', '87')
    AND o.valid_to IS NULL
    AND d.domain ~ '^[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}$'
  GROUP BY d.domain
)
SELECT rank, org_id, label, domain, dept, effectif
FROM ranked
WHERE rank > $2 AND rank <= $2 + $1
ORDER BY rank
`;

export interface ScanTarget {
  rank: number;
  orgId: number;
  orgName: string;
  domain: string;
  dept: string | null;
  effectif: number | null;
}

type RawTarget = { rank: number | string; org_id: number | string; label: string | null; domain: string; dept: string | null; effectif: number | string | null };
type QueryRunner = (sql: string, params: unknown[]) => Promise<{ rows: RawTarget[] }>;

/** Pure mapping: one row per official domain, stable rank, no foreign organisations. */
export function mapTargetRows(rows: RawTarget[]): ScanTarget[] {
  const unique = new Map<string, ScanTarget>();
  for (const row of rows) {
    const domain = (row.domain ?? "").trim().toLowerCase();
    const orgName = (row.label ?? "").trim();
    const orgId = Number(row.org_id);
    if (!domain.includes(".") || !orgName || !Number.isInteger(orgId)) continue;
    if (unique.has(domain)) continue;
    unique.set(domain, {
      rank: Number(row.rank),
      orgId,
      orgName,
      domain,
      dept: row.dept ?? null,
      effectif: row.effectif === null ? null : Number(row.effectif),
    });
  }
  return [...unique.values()].sort((a, b) => a.rank - b.rank);
}

export async function loadTopTargets(
  options: { limit?: number; offset?: number; runner?: QueryRunner } = {},
): Promise<ScanTarget[]> {
  const limit = options.limit ?? 1000;
  const offset = options.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) {
    throw new Error("limit and offset must be non-negative integers");
  }
  const runner = options.runner ?? query;
  const res = await runner(TOP_TARGETS_SQL, [limit, offset]);
  return mapTargetRows(res.rows);
}

const VARIANT_KINDS: { kind: Variant["kind"]; weight: number }[] = [
  { kind: "omission", weight: 0.3 },
  { kind: "transposition", weight: 0.25 },
  { kind: "substitution", weight: 0.2 },
  { kind: "tiret", weight: 0.15 },
  { kind: "homoglyphe", weight: 0.1 },
];

/** Spread the budget across typo kinds; a large budget keeps every generated typo. */
export function buildVariants(target: ScanTarget, max = 8): Variant[] {
  const all = genererVariantes(target.domain, Math.max(200, max));
  const out = new Map<string, Variant>();
  for (const { kind, weight } of VARIANT_KINDS) {
    const pool = all.filter((v) => v.kind === kind);
    const quota = Math.min(pool.length, Math.max(1, Math.round(max * weight)));
    for (let k = 0; k < quota; k++) {
      const index = quota === 1 ? 0 : Math.round((k * (pool.length - 1)) / (quota - 1));
      const variant = pool[index];
      if (variant && !out.has(variant.domain)) out.set(variant.domain, variant);
    }
  }
  for (const variant of variantesTld(target.domain)) {
    if (!out.has(variant.domain)) out.set(variant.domain, variant);
  }
  return [...out.values()];
}

export interface DomainProbe {
  dns(domain: string): Promise<{ a: string[]; aaaa: string[] }>;
  certificate(domain: string): Promise<CertSnapshot | null>;
  page(domain: string): Promise<PageSnapshot | null>;
}

/** Reuses the passive probes already verified by the earlier typosquat scan. */
export const liveProbe: DomainProbe = {
  dns: (domain) => sondeReelle.dns(domain),
  certificate: (domain) => sondeReelle.certificat(domain),
  page: (domain) => sondeReelle.page(domain),
};

const PARKING = [
  "domain for sale", "domain name for sale", "en vente", "parked", "namecheap",
  "coming soon", "website temporarily unavailable", "acheter ce domaine",
];
const CREDENTIAL_TITLE = /password|login|connexion|mot de passe|credential|verify your/i;
const PASSWORD_FIELD = /type=["']password["']/i;
const GENERIC: Record<string, true> = {
  commune: true, ville: true, mairie: true, societe: true, etablissement: true,
  centre: true, hopital: true, universite: true, association: true, groupe: true,
  france: true, de: true, du: true, la: true, le: true, des: true,
};

function organisationTokens(name: string): string[] {
  return deaccent(name)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 5 && GENERIC[t] !== true);
}

function pageHost(page: PageSnapshot): string {
  try { return new URL(page.url).hostname.toLowerCase(); } catch { return ""; }
}

/**
 * Independent page evidence, used when Certificate Transparency has no record.
 * A lookalike is reported only when it copies the organisation name AND shows
 * a credential form; parking pages and official redirects are always rejected.
 */
export function pageProof(finding: TyposquatFinding, now = new Date()): { confirmed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (finding.similarity < 0.8 || !finding.page) return { confirmed: false, reasons: ["no-readable-page-or-low-similarity"] };
  if (finding.kind === "tld") return { confirmed: false, reasons: ["alternate-tld-is-not-a-typo"] };
  const host = pageHost(finding.page);
  if (finding.officialDomains.some((o) => host === o || host.endsWith(`.${o}`))) {
    return { confirmed: false, reasons: ["official-redirect"] };
  }
  const title = deaccent(finding.page.title).toLowerCase();
  const body = deaccent(finding.page.text).toLowerCase();
  if (PARKING.some((m) => title.includes(m) || body.includes(m))) {
    return { confirmed: false, reasons: ["parking-or-sale"] };
  }
  const tokens = organisationTokens(finding.orgName);
  const copied = tokens.filter((t) => title.includes(t) || body.includes(t));
  if (tokens.length === 0 || copied.length / tokens.length < 0.6) {
    return { confirmed: false, reasons: ["organisation-name-not-reproduced"] };
  }
  if (!CREDENTIAL_TITLE.test(finding.page.title) && !PASSWORD_FIELD.test(finding.page.text)) {
    return { confirmed: false, reasons: ["no-credential-form"] };
  }
  reasons.push(`dns-active`, `similarity-${finding.similarity.toFixed(2)}`, `name:${copied.slice(0, 3).join(",")}`, "credential-form");
  if (!classerUsurpation(finding, now).usurpation) reasons.push("certificate-absent");
  return { confirmed: true, reasons };
}

export interface Detection {
  finding: TyposquatFinding;
  method: "certificate-and-page" | "page-evidence";
  verdict: Verdict;
  proof: string[];
}

export interface TopScanResult {
  targets: number;
  variants: number;
  active: TyposquatFinding[];
  detections: Detection[];
  alarms: number;
  falsePositives: number;
  falsePositiveRate: number;
  probes: { dns: number; certificate: number; page: number };
}

export function isAlarm(f: TyposquatFinding): boolean {
  return (f.a.length > 0 || f.aaaa.length > 0) && f.similarity >= 0.8;
}

async function mapLimited<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/** DNS gate first; only resolved variants get the slower certificate and page probes. */
export async function scanTargets(
  targets: ScanTarget[],
  probe: DomainProbe,
  options: { maxVariantes?: number; concurrence?: number; now?: Date } = {},
): Promise<TopScanResult> {
  const pairs = targets.flatMap((target) => buildVariants(target, options.maxVariantes ?? 8).map((variant) => ({ target, variant })));
  const probes = { dns: 0, certificate: 0, page: 0 };
  const active: TyposquatFinding[] = [];
  await mapLimited(pairs, options.concurrence ?? 32, async ({ target, variant }) => {
    probes.dns++;
    const { a, aaaa } = await probe.dns(variant.domain);
    if (a.length + aaaa.length === 0) return;
    probes.certificate++;
    const cert = await probe.certificate(variant.domain);
    probes.page++;
    const page = await probe.page(variant.domain);
    active.push({
      orgId: target.orgId,
      orgName: target.orgName,
      dept: target.dept,
      officialDomains: [target.domain],
      base: target.domain,
      domain: variant.domain,
      kind: variant.kind,
      similarity: similarite(target.domain, variant.domain),
      a,
      aaaa,
      cert,
      page,
    });
  });
  active.sort((x, y) => x.domain.localeCompare(y.domain));
  const detections: Detection[] = [];
  for (const finding of active) {
    const verdict = classerUsurpation(finding, options.now ?? new Date());
    const proof = pageProof(finding, options.now ?? new Date());
    if (!proof.confirmed || finding.kind === "tld") continue;
    if (verdict.usurpation) {
      detections.push({ finding, method: "certificate-and-page", verdict, proof: [...verdict.motifs, ...proof.reasons] });
    } else {
      detections.push({ finding, method: "page-evidence", verdict, proof: proof.reasons });
    }
  }
  const confirmed = new Set(detections.map((d) => d.finding.domain));
  const alarms = active.filter(isAlarm);
  const falsePositives = alarms.filter((f) => !confirmed.has(f.domain)).length;
  return {
    targets: targets.length,
    variants: pairs.length,
    active,
    detections,
    alarms: alarms.length,
    falsePositives,
    falsePositiveRate: alarms.length === 0 ? 0 : falsePositives / alarms.length,
    probes,
  };
}
