/**
 * Bounded, order-independent deduplication for public ransomware claim feeds.
 *
 * A claim feed is a small, rolling window (RansomLook exposes 100 posts). Its
 * `discovered` timestamp is set by the group, not by the feed: a post can be
 * published late, or be reordered, and still be new to us. A single
 * `lastDate` watermark silently drops such claims, which is exactly what a
 * first-claim latency metric must not do.
 *
 * This module keeps a bounded set of claim keys instead. Keys use the same
 * seed as the collector's dedup key, so no event identity changes. Nothing
 * here touches the network or the database.
 */
import { createHash } from "node:crypto";

/** Minimal shape shared by the feed entries we care about. */
export type ClaimPost = {
  post_title?: unknown;
  group_name?: unknown;
  discovered?: unknown;
  description?: unknown;
};

export type ClaimFeedCursor = {
  /** Most recently accepted claim keys, oldest first. Bounded by `maxSeen`. */
  seen?: unknown;
  /** Kept for compatibility with cursors written by older versions. */
  lastDate?: unknown;
};

export type ClaimFeedOptions = {
  /** Injected clock, so the lookback window is testable without waiting. */
  now?: Date | number;
  /** Ignore claims published before this many days ago. Default: 7. */
  lookbackDays?: number;
  /** Maximum number of keys kept in the cursor. Default: 500. */
  maxSeen?: number;
};

export type ClaimFeedSelection<T extends ClaimPost> = {
  /** New posts, in feed order. */
  posts: T[];
  /** Stable key for each selected post, in the same order. */
  keys: string[];
  cursor: { seen: string[]; lastDate: string };
};

const DAY_MS = 24 * 3600 * 1000;
const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_MAX_SEEN = 500;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Same seed as `ransomlook.collector.ts` — event identity must not change. */
export function claimKey(post: ClaimPost): string | null {
  const title = text(post.post_title);
  const group = text(post.group_name);
  const discovered = text(post.discovered);
  if (!title && !group) return null;
  if (!discovered) return null;
  const seed = `${group}|${title}|${discovered}`;
  return createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

/** Publication timestamp as an ISO string, or null when unusable. */
export function publishedAt(post: ClaimPost): string | null {
  const raw = text(post.discovered);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Select the posts that this feed has not handed us yet.
 *
 * A post older than the lookback window is not selected: replaying a month of
 * backfill on every restart would flood the queue and measure the age of the
 * claim, not our latency. A post that is older than the previous maximum but
 * within the window IS selected — that is the bug this replaces.
 */
export function selectNewClaimPosts<T extends ClaimPost>(
  posts: readonly T[],
  cursor: ClaimFeedCursor = {},
  options: ClaimFeedOptions = {},
): ClaimFeedSelection<T> {
  const rawNow = options.now instanceof Date ? options.now.getTime() : (options.now ?? Date.now());
  const nowMs = Number.isFinite(rawNow) ? rawNow : Date.now();
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
  const maxSeen = Math.max(1, options.maxSeen ?? DEFAULT_MAX_SEEN);
  const cutoff = nowMs - Math.max(0, lookbackDays) * DAY_MS;

  const seen = new Set(
    Array.isArray(cursor.seen)
      ? cursor.seen.filter((key): key is string => typeof key === "string")
      : [],
  );
  const accepted: T[] = [];
  const acceptedKeys: string[] = [];
  let lastDate = text(cursor.lastDate);

  for (const post of posts) {
    const published = publishedAt(post);
    if (!published) continue;
    if (Date.parse(published) > Date.parse(lastDate || "0")) lastDate = published;
    if (Date.parse(published) < cutoff) continue;
    const key = claimKey(post);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    accepted.push(post);
    acceptedKeys.push(key);
  }

  return {
    posts: accepted,
    keys: acceptedKeys,
    cursor: {
      seen: [...seen].slice(-maxSeen),
      lastDate: lastDate || new Date(nowMs).toISOString(),
    },
  };
}
