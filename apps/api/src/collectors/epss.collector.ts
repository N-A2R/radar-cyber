import type { Collector, NormalizedEvent } from "@radar/shared";

type EpssRow = {
  cve?: unknown;
  epss?: unknown;
  percentile?: unknown;
};

type EpssResponse = { data?: unknown[] };

export const collector: Collector = {
  id: "epss",
  family: "vuln",
  intervalSec: 86400,
  async run(ctx) {
    const raw = await ctx.fetchJson<EpssResponse>("https://api.first.org/data/v1/epss?order=!epss&limit=100");
    const rows = Array.isArray(raw?.data) ? (raw.data as EpssRow[]) : [];

    const events: NormalizedEvent[] = [];

    for (const row of rows) {
      const cve = String(row.cve ?? "").trim();
      if (!cve) continue;
      const epss = Number(row.epss);
      const percentile = row.percentile === undefined ? undefined : String(row.percentile);

      events.push({
        dedupKey: `epss:${cve}`,
        family: "vuln",
        assertionType: "technical_indicator",
        title: `${cve} — EPSS ${Number.isFinite(epss) ? epss : "n/a"}`.slice(0, 400),
        severity: Number.isFinite(epss) && epss >= 0.5 ? 5 : 3,
        confidence: "A2",
        sourceId: "epss",
        sourceUrl: `https://www.first.org/epss/`,
        evidence: { epss, percentile },
        geoType: "unknown",
      });
    }

    return { events };
  },
};
