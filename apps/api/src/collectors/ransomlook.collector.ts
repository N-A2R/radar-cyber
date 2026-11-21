import type { Collector, NormalizedEvent } from "@radar/shared";
import { publishedAt, selectNewClaimPosts, type ClaimFeedCursor } from "./claim-feed.js";

type Post = {
  post_title?: unknown;
  group_name?: unknown;
  discovered?: unknown;
  description?: unknown;
};

export const collector: Collector = {
  id: "ransomlook",
  family: "ransomware",
  intervalSec: 300,
  async run(ctx) {
    const raw = await ctx.fetchJson<Post[]>("https://www.ransomlook.io/api/recent");
    const posts = Array.isArray(raw) ? raw : [];
    const selection = selectNewClaimPosts(posts, ctx.cursor as ClaimFeedCursor, { now: ctx.now() });
    const events: NormalizedEvent[] = [];

    for (let index = 0; index < selection.posts.length; index++) {
      const post = selection.posts[index]!;
      const title = String(post.post_title ?? "").trim();
      const group = String(post.group_name ?? "").trim();
      const description = String(post.description ?? "").trim();
      const observedAt = publishedAt(post)!;

      // Revendication : on ne la présente jamais comme un incident confirmé.
      const dedupKey = `ransomlook:${selection.keys[index]}`;

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

    }

    return { events, cursor: selection.cursor };
  },
};
