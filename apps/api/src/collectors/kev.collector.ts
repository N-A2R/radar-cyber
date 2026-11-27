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

type KevCursor = { lastDate?: unknown; seen?: unknown };

/** Une entrée KEV peut apparaître après la date portée par le catalogue. */
export const KEV_LOOKBACK_DAYS = 7;
/** Borne du curseur : le catalogue tient quelques milliers de CVE, pas un flux infini. */
export const KEV_MAX_SEEN = 2000;
const DAY_MS = 24 * 3600 * 1000;

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
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

    const cursor = ctx.cursor as KevCursor;
    // `dateAdded` est un jour : deux CVE ajoutées le même jour ont la même
    // horodatage. Un simple `lastDate` les confond et perd toutes celles qui
    // apparaissent après le premier passage. On garde donc les clés déjà vues,
    // exactement comme pour les flux de revendications.
    const seen = new Set(
      Array.isArray(cursor?.seen)
        ? cursor.seen.filter((key): key is string => typeof key === "string" && key.length > 0)
        : [],
    );
    const nowMs = ctx.now().getTime();
    const cutoff = nowMs - KEV_LOOKBACK_DAYS * DAY_MS;

    const events: NormalizedEvent[] = [];
    let maxObserved = text(cursor?.lastDate);

    for (const v of vulns) {
      const cveID = String(v.cveID ?? "").trim();
      if (!cveID) continue;
      const dateAdded = String(v.dateAdded ?? "").trim();
      const observedAt = dateAdded ? new Date(dateAdded).toISOString() : undefined;
      if (!observedAt) continue;
      const ts = Date.parse(observedAt);
      if (!Number.isFinite(ts) || ts < cutoff) continue;
      if (seen.has(cveID)) continue;
      seen.add(cveID);
      if (observedAt > maxObserved) maxObserved = observedAt;

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
          // Le flux KEV recense des vulnérabilités activement exploitées.
          exploited: true,
          product: String(v.product ?? "").trim(),
          ransomware,
          description: String(v.shortDescription ?? "").trim(),
        },
        geoType: "unknown",
      });

    }

    return {
      events,
      cursor: { lastDate: maxObserved, seen: [...seen].slice(-KEV_MAX_SEEN) },
    };
  },
};
