import type { CollectContext, Collector, NormalizedEvent } from "@radar/shared";
import { query } from "../db.js";

interface NvdCve {
  id: string;
  published?: string;
  lastModified?: string;
  descriptions?: { lang: string; value: string }[];
  metrics?: {
    cvssMetricV31?: { cvssData?: { baseScore?: number; vectorString?: string } }[];
  };
  references?: { url?: string }[];
}

interface NvdResponse {
  totalResults?: number;
  vulnerabilities?: { cve: NvdCve }[];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isoWindow(d: Date) {
  // NVD expects ISO with offset; use UTC Z
  return d.toISOString();
}

const DAY_MS = 86_400_000;
/** L'API NVD refuse une fenêtre de plus de 120 jours. */
const MAX_QUERY_DAYS = 120;
/** L'API NVD refuse startIndex + resultsPerPage > 2000 : une fenêtre est scindée au-delà. */
const MAX_RESULTS = 2000;
const DEFAULT_SINCE_DAYS = 30;

interface Window {
  start: Date;
  end: Date;
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Fenêtres de PUBLICATION (`pubStartDate`/`pubEndDate`), et non de dernière
 * modification : `lastModStartDate` renvoie les CVE de 1999 dès qu'un éditeur
 * les retouche, ce qui remplissait la veille d'historique.
 *
 * Défaut : `NVD_SINCE_DAYS` jours (30). Le rattrapage historique est opt-in via
 * `NVD_BACKFILL=1` (+ `NVD_BACKFILL_START=AAAA-MM-JJ`), découpé en tranches.
 */
function collectionWindows(now: Date): Window[] {
  const end = now;
  const backfillStart = process.env.NVD_BACKFILL_START?.trim() ?? "";
  const backfill = backfillStart !== "" || /^(1|true|yes|on)$/i.test(process.env.NVD_BACKFILL ?? "");
  let start: Date;
  if (backfill) {
    const parsed = backfillStart ? new Date(backfillStart) : new Date(Date.UTC(1999, 0, 1));
    start = Number.isNaN(parsed.getTime()) ? new Date(Date.UTC(1999, 0, 1)) : parsed;
  } else {
    start = new Date(end.getTime() - envInt("NVD_SINCE_DAYS", DEFAULT_SINCE_DAYS, 1, MAX_QUERY_DAYS) * DAY_MS);
  }
  if (start.getTime() >= end.getTime()) start = new Date(end.getTime() - DAY_MS);

  const windows: Window[] = [];
  const step = MAX_QUERY_DAYS * DAY_MS;
  for (let from = start.getTime(); from < end.getTime(); from += step) {
    windows.push({ start: new Date(from), end: new Date(Math.min(from + step, end.getTime())) });
  }
  return windows;
}

function pageUrl(w: Window, startIndex: number, pageSize: number): string {
  return (
    `https://services.nvd.nist.gov/rest/json/cves/2.0` +
    `?pubStartDate=${encodeURIComponent(isoWindow(w.start))}` +
    `&pubEndDate=${encodeURIComponent(isoWindow(w.end))}` +
    `&resultsPerPage=${pageSize}` +
    `&startIndex=${startIndex}`
  );
}

function severityFromScore(score: number | undefined): number {
  const s = typeof score === "number" ? score : 0;
  if (s >= 9) return 5;
  if (s >= 7) return 4;
  if (s >= 4) return 3;
  if (s > 0) return 2;
  return 3;
}

function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^[^.!?]*[.!?]/);
  return (m ? m[0] : t).trim();
}

// Cache org domain -> name mapping for the run
async function loadOrgDomains(): Promise<{ domain: string; name: string }[]> {
  const rows: { domain: string; name: string }[] = [];
  const orgs = await query<{ name: string; domain: string | null }>(
    "SELECT name, domain FROM org WHERE domain IS NOT NULL AND domain <> ''"
  );
  for (const r of orgs.rows) rows.push({ domain: r.domain!.toLowerCase(), name: r.name });
  const assets = await query<{ org_name: string; value: string }>(
    "SELECT o.name AS org_name, a.value FROM asset a JOIN org o ON o.id=a.org_id WHERE a.kind IN ('domain','subdomain') AND a.status IN ('confirme','candidat')"
  );
  for (const r of assets.rows) rows.push({ domain: r.value.toLowerCase(), name: r.org_name });
  return rows;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findOrgHint(text: string, domains: { domain: string; name: string }[]): string | undefined {
  const low = text.toLowerCase();
  for (const d of domains) {
    const re = new RegExp(`(?<![a-z0-9.-])${escapeRe(d.domain)}(?![a-z0-9.-])`, "i");
    if (re.test(low)) return d.name;
  }
  return undefined;
}

export const collector: Collector = {
  id: "nvd_cve",
  family: "vuln",
  intervalSec: 21600,
  async run(ctx: CollectContext) {
    const now = ctx.now();
    const windows = collectionWindows(now);
    const since = windows[0]?.start ?? now;
    const backfill = /^(1|true|yes|on)$/i.test(process.env.NVD_BACKFILL ?? "") || Boolean(process.env.NVD_BACKFILL_START);
    ctx.log(
      `nvd : ${windows.length} fenêtre(s) de publication ${isoWindow(since)} → ${isoWindow(now)}` +
        (backfill ? " (rattrapage historique opt-in)" : "")
    );

    const orgDomains = await loadOrgDomains();

    const events: NormalizedEvent[] = [];
    const seen = new Set<string>();

    const emit = (c: NvdCve, w: Window): void => {
      const cveId = String(c.id ?? "").trim();
      if (!cveId || seen.has(cveId)) return;
      // Ceinture et bretelles : l'API filtre déjà sur pubStartDate/pubEndDate.
      const publishedMs = c.published ? Date.parse(c.published) : Number.NaN;
      if (Number.isFinite(publishedMs) && (publishedMs < w.start.getTime() || publishedMs > w.end.getTime())) return;
      seen.add(cveId);

      const descEn = (c.descriptions ?? []).find((d) => d.lang === "en")?.value ?? (c.descriptions?.[0]?.value ?? "");
      const title = `${cveId}: ${firstSentence(descEn)}`.slice(0, 400);
      const published = c.published ? new Date(c.published).toISOString() : undefined;
      const metric = c.metrics?.cvssMetricV31?.[0];
      const score = metric?.cvssData?.baseScore;
      const vector = metric?.cvssData?.vectorString;
      const refs = (c.references ?? []).map((r) => r.url).filter(Boolean).slice(0, 3) as string[];

      const textForOrg = `${descEn}\n${refs.join("\n")}`;
      const orgHint = findOrgHint(textForOrg, orgDomains);

      events.push({
        dedupKey: `nvd:${cveId}`,
        family: "vuln",
        assertionType: "technical_indicator",
        title,
        summary: descEn.slice(0, 4000) || undefined,
        observedAt: published,
        severity: severityFromScore(score),
        confidence: "B2",
        sourceId: "nvd_cve",
        sourceUrl: `https://nvd.nist.gov/vuln/detail/${cveId}`,
        evidence: {
          cvss: score ?? null,
          vectorString: vector ?? null,
          references: refs,
        },
        geoType: "unknown",
        orgHint,
      });
    };

    const collectWindow = async (w: Window): Promise<void> => {
      let startIndex = 0;
      let total = 0;
      let firstPage = true;
      while (true) {
        if (!firstPage) await sleep(6000);
        firstPage = false;
        const data = await ctx.fetchJson<NvdResponse>(pageUrl(w, startIndex, MAX_RESULTS));
        const vulns = Array.isArray(data?.vulnerabilities) ? data.vulnerabilities : [];
        total = typeof data?.totalResults === "number" ? data.totalResults : total;

        // NVD plafonne startIndex + resultsPerPage à 2000 : on scinde la fenêtre.
        if (total > MAX_RESULTS && w.end.getTime() - w.start.getTime() > 3_600_000) {
          const mid = new Date(Math.floor((w.start.getTime() + w.end.getTime()) / 2));
          await collectWindow({ start: w.start, end: mid });
          await collectWindow({ start: mid, end: w.end });
          return;
        }
        if (total > MAX_RESULTS) {
          ctx.log(`nvd : ${total} résultats sur une fenêtre d'une heure, seuls ${MAX_RESULTS} sont récupérables`);
        }

        for (const v of vulns) emit(v.cve, w);

        startIndex += vulns.length;
        if (startIndex >= total || vulns.length === 0) break;
      }
    };

    for (const w of windows) await collectWindow(w);

    return {
      events,
      cursor: { window: "published", since: since.toISOString(), until: now.toISOString() },
    };
  },
};
