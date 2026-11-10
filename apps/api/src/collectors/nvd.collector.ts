import type { CollectContext, Collector } from "@radar/shared";
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
    const cursor = (ctx.cursor ?? {}) as { lastMod?: string };
    let start: Date;
    if (cursor.lastMod) {
      start = new Date(cursor.lastMod);
    } else {
      start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    }
    // cap window to 120 days
    const maxWindow = 120 * 24 * 3600 * 1000;
    if (now.getTime() - start.getTime() > maxWindow) {
      start = new Date(now.getTime() - maxWindow);
    }
    const end = now;

    const orgDomains = await loadOrgDomains();

    const events: any[] = [];
    let startIndex = 0;
    const pageSize = 2000;
    let total = 0;
    let firstPage = true;

    while (true) {
      if (!firstPage) await sleep(7000);
      firstPage = false;
      const url =
        `https://services.nvd.nist.gov/rest/json/cves/2.0` +
        `?lastModStartDate=${encodeURIComponent(isoWindow(start))}` +
        `&lastModEndDate=${encodeURIComponent(isoWindow(end))}` +
        `&resultsPerPage=${pageSize}` +
        `&startIndex=${startIndex}`;
      const data = await ctx.fetchJson<NvdResponse>(url);
      const vulns = Array.isArray(data?.vulnerabilities) ? data.vulnerabilities : [];
      total = typeof data?.totalResults === "number" ? data.totalResults : total;

      for (const v of vulns) {
        const c = v.cve;
        const cveId = String(c.id ?? "").trim();
        if (!cveId) continue;
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
      }

      startIndex += vulns.length;
      if (startIndex >= total || vulns.length === 0) break;
    }

    const lastMod = end.toISOString();
    return { events, cursor: { lastMod } };
  },
};
