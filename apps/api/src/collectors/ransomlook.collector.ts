import type { Collector, NormalizedEvent } from "@radar/shared";
import { createHash } from "node:crypto";

type Post = {
  post_title?: unknown;
  group_name?: unknown;
  discovered?: unknown;
  description?: unknown;
};

export const collector: Collector = {
  id: "ransomlook",
  family: "ransomware",
  intervalSec: 3600,
  async run(ctx) {
    const raw = await ctx.fetchJson<Post[]>("https://www.ransomlook.io/api/recent");
    const posts = Array.isArray(raw) ? raw : [];
    const cursor = ctx.cursor as { lastDate?: string };
    const lastTs = cursor?.lastDate ? Date.parse(cursor.lastDate) : NaN;

    const events: NormalizedEvent[] = [];
    let maxObserved = cursor?.lastDate ?? "";

    for (const post of posts) {
      const title = String(post.post_title ?? "").trim();
      const group = String(post.group_name ?? "").trim();
      const discovered = String(post.discovered ?? "").trim();
      const description = String(post.description ?? "").trim();

      const observedAt = discovered ? new Date(discovered).toISOString() : undefined;
      if (!observedAt) continue;
      if (!Number.isNaN(lastTs) && Date.parse(observedAt) <= lastTs) continue;

      // Revendication : on ne la présente jamais comme un incident confirmé.
      const seed = `${group}|${title}|${discovered}`;
      const dedupKey = `ransomlook:${createHash("sha256").update(seed).digest("hex").slice(0, 24)}`;

      events.push({
        dedupKey,
        family: "ransomware",
        assertionType: "third_party_claim",
        title: `${title || "Revendication"} — revendiqué par ${group || "groupe inconnu"}`.slice(0, 400),
        summary: description ? description.slice(0, 4000) : undefined,
        observedAt,
        severity: 4,
        confidence: "C3",
        sourceId: "ransomlook",
        sourceUrl: "https://www.ransomlook.io/",
        evidence: { group, description: description.slice(0, 500) },
        geoType: "claimed_origin",
      });

      if (observedAt > maxObserved) maxObserved = observedAt;
    }

    return { events, cursor: { lastDate: maxObserved || cursor?.lastDate } };
  },
};
