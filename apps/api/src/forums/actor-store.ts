/**
 * Storage for passive actor mentions observed in public forum messages.
 *
 * Each row names a public actor, the dedup key of the message that mentioned
 * it and the time of that public message. No forum account, no author field,
 * no victim detail and no message body leave the admission layer.
 */
import { query } from "../db.js";
import { findActorMentions, isFrancophoneMessage } from "./actors.js";
import { dedupKey } from "./classify.js";
import type { ForumCollection } from "./collect.js";

export type ForumActorRow = {
  key: string;
  label: string;
  kind: string;
  messages: number;
  sources: number;
  firstSeen: string | null;
  lastSeen: string | null;
};

export type ForumActorStats = {
  actorsIdentified: number;
  mentions: number;
  byActor: readonly ForumActorRow[];
};

const iso = (value: string | null): string | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

/** Insert one row per actor and message; replaying a feed never doubles it. */
export async function persistForumActorMentions(collection: ForumCollection): Promise<number> {
  let inserted = 0;
  for (const message of collection.admitted) {
    if (!isFrancophoneMessage(message)) continue;
    const verdict = collection.verdicts.find((v) => v.dedupKey === dedupKey(message));
    if (!verdict?.relevant) continue;
    for (const mention of findActorMentions(message)) {
      const result = await query(
        `INSERT INTO forum_actor_mention
           (message_key, actor_key, actor_label, actor_kind, source_id, observed_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (message_key, actor_key) DO NOTHING`,
        [mention.messageKey, mention.actorKey, mention.label, mention.kind,
          mention.sourceId, iso(mention.observedAt)],
      );
      inserted += result.rowCount ?? 0;
    }
  }
  return inserted;
}

/** Aggregate counts and per-actor activity windows from stored mentions. */
export async function readForumActorStats(): Promise<ForumActorStats> {
  const { rows } = await query<{
    actorsIdentified: number;
    mentions: number;
  }>(
    `SELECT count(DISTINCT actor_key)::int AS "actorsIdentified", count(*)::int AS mentions
       FROM forum_actor_mention`,
  );
  const detail = await query<{
    key: string; label: string; kind: string;
    messages: number; sources: number; firstSeen: string | null; lastSeen: string | null;
  }>(
    `SELECT actor_key AS key, max(actor_label) AS label, max(actor_kind) AS kind,
            count(DISTINCT message_key)::int AS messages,
            count(DISTINCT source_id)::int AS sources,
            min(observed_at)::text AS "firstSeen", max(observed_at)::text AS "lastSeen"
       FROM forum_actor_mention
      GROUP BY actor_key
      ORDER BY messages DESC, actor_key ASC`,
  );
  return {
    actorsIdentified: rows[0]?.actorsIdentified ?? 0,
    mentions: rows[0]?.mentions ?? 0,
    byActor: detail.rows,
  };
}
