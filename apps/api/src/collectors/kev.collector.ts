import type { Collector, NormalizedEvent } from "@radar/shared";

interface KevVuln {
  cveID: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  knownRansomwareCampaignUse: string;
  vendorProject: string;
  product: string;
}

export const collector: Collector = {
  id: "cisa_kev",
  family: "vuln",
  intervalSec: 21600,
  async run(ctx) {
    const data = await ctx.fetchJson<{ vulnerabilities?: KevVuln[] }>(
      "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
    );
    const vulns = Array.isArray(data?.vulnerabilities) ? data.vulnerabilities : [];

    const cursor = ctx.cursor as { lastDate?: string };
    const lastDate = cursor?.lastDate;
    const lastTs = lastDate ? Date.parse(lastDate) : NaN;

    const events: NormalizedEvent[] = [];
    let maxObserved = lastDate ?? "";

    for (const v of vulns) {
      const cveID = String(v.cveID ?? "").trim();
      if (!cveID) continue;
      const dateAdded = String(v.dateAdded ?? "").trim();
      const observedAt = dateAdded ? new Date(dateAdded).toISOString() : undefined;
      if (!observedAt) continue;
      if (!isNaN(lastTs) && Date.parse(observedAt) <= lastTs) continue;

      const ransomware = String(v.knownRansomwareCampaignUse ?? "").trim();
      const severity = ransomware === "Known" ? 5 : 3;
      const title = `${cveID} — ${String(v.vulnerabilityName ?? "").trim()}`.slice(0, 300);

      events.push({
        dedupKey: `kev:${cveID}`,
        family: "vuln",
        assertionType: "confirmed_incident",
        title,
        summary: String(v.shortDescription ?? "").trim() || undefined,
        observedAt,
        severity,
        confidence: "A1",
        sourceId: "cisa_kev",
        sourceUrl: `https://nvd.nist.gov/vuln/detail/${cveID}`,
        evidence: {
          vendor: String(v.vendorProject ?? "").trim(),
          product: String(v.product ?? "").trim(),
          ransomware,
          description: String(v.shortDescription ?? "").trim(),
        },
        geoType: "unknown",
      });

      if (observedAt > maxObserved) maxObserved = observedAt;
    }

    return { events, cursor: { lastDate: maxObserved || lastDate } };
  },
};
