import type { Collector, NormalizedEvent } from "@radar/shared";
import { XMLParser } from "fast-xml-parser";

export const collector: Collector = {
  id: "cert_fr",
  family: "cert_fr",
  intervalSec: 900,
  async run(ctx) {
    const xml = await ctx.fetchText("https://www.cert.ssi.gouv.fr/feed/");
    const parser = new XMLParser({ ignoreAttributes: false });
    const parsed = parser.parse(xml) as Record<string, unknown>;
    const rss = (parsed?.rss ?? {}) as Record<string, unknown>;
    const channel = ((rss?.channel ?? parsed?.channel ?? {}) as Record<string, unknown>);
    const rawItems = channel?.item;
    const items: unknown[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    const cursor = ctx.cursor as { lastDate?: string };
    const lastDate = cursor?.lastDate;
    const lastTs = lastDate ? Date.parse(lastDate) : NaN;

    const events: NormalizedEvent[] = [];
    let maxObserved = lastDate ?? "";

    for (const raw of items) {
      const it = (raw ?? {}) as Record<string, unknown>;
      const title = String(it.title ?? "").trim();
      const link = String(it.link ?? "").trim();
      const pubDate = String(it.pubDate ?? "").trim();
      const description = String(it.description ?? "").trim();
      const guidRaw = it.guid;
      const guid = typeof guidRaw === "object" && guidRaw !== null ? String((guidRaw as Record<string, unknown>)["#text"] ?? "") : String(guidRaw ?? "");

      const observedAt = pubDate ? new Date(pubDate).toISOString() : undefined;
      if (!observedAt) continue;
      if (!isNaN(lastTs) && Date.parse(observedAt) <= lastTs) continue;

      const id = link.split("/").filter(Boolean).pop() ?? link;
      const dedupKey = `certfr:${id}`;

      events.push({
        dedupKey,
        family: "cert_fr",
        assertionType: "ambient_signal",
        title: (title || "Cert-FR alert").slice(0, 400),
        summary: description ? description.slice(0, 4000) : undefined,
        observedAt,
        severity: 3,
        confidence: "A1",
        sourceId: "cert_fr",
        sourceUrl: link || undefined,
        evidence: { description: description.slice(0, 500), guid },
        geoType: "unknown",
      });

      if (observedAt > maxObserved) maxObserved = observedAt;
    }

    return { events, cursor: { lastDate: maxObserved || lastDate } };
  },
};
