/**
 * Collection and storage of public forum messages.
 *
 * The fetch step is injectable so tests and the measurement script never need
 * the network. Each source is isolated: one dead forum cannot stop the others.
 * Only admitted messages are persisted, with a stable dedup key.
 */
import { XMLParser } from "fast-xml-parser";
import { query } from "../db.js";
import { languageVerdict } from "../collectors/filter.js";
import {
  classifyForumMessage,
  dedupKey,
  summarizeForumVerdicts,
  type ForumMessage,
  type ForumSummary,
  type ForumVerdict,
} from "./classify.js";
import { FORUM_SOURCES, type ForumSource } from "./sources.js";
import { persistForumActorMentions } from "./actor-store.js";
import { closeRun, openRun, withRunId, type RunOutcome } from "../collecte/runs.js";

export type ForumCollection = {
  verdicts: ForumVerdict[];
  messages: ForumMessage[];
  admitted: ForumMessage[];
  summary: ForumSummary;
  errors: string[];
};

type FetchLike = typeof globalThis.fetch;

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:quot|#x27|#039|amp|lt|gt|nbsp|#x2F);/g, (entity) => ({
      "&quot;": '"', "&#x27;": "'", "&#039;": "'", "&amp;": "&",
      "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&#x2F;": "/",
    }[entity] ?? entity))
    .replace(/\s+/g, " ")
    .trim();
}

function textOf(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return clean(value);
  if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    return clean(node["#text"] ?? node["_"] ?? "");
  }
  return "";
}

function hrefOf(value: unknown): string {
  if (typeof value === "string") return clean(value);
  if (value && typeof value === "object") {
    const node = value as Record<string, unknown>;
    return clean(node["@_href"] ?? node["#text"] ?? "");
  }
  return "";
}

/** Public feed payload -> normalized messages; no admission decision here. */
export function parseForumFeed(source: ForumSource, body: string): ForumMessage[] {
  if (source.format === "json") {
    const payload = JSON.parse(body) as { hits?: unknown[] };
    return asArray(payload.hits).map((raw, index) => {
      const hit = (raw ?? {}) as Record<string, unknown>;
      const story = clean(hit.story_text ?? hit.comment_text ?? "");
      const title = textOf(hit.title) || story.slice(0, 140);
      const id = String(hit.objectID ?? `${source.id}:${index}`);
      return {
        id,
        sourceId: source.id,
        title,
        summary: story,
        url: hrefOf(hit.url) || `https://news.ycombinator.com/item?id=${encodeURIComponent(id)}`,
        observedAt: typeof hit.created_at === "string" ? hit.created_at : null,
      };
    });
  }
  const parsed = new XMLParser({ ignoreAttributes: false, trimValues: true }).parse(body) as Record<string, unknown>;
  const root = (parsed?.rss ?? parsed?.feed ?? {}) as Record<string, unknown>;
  const channel = (root?.channel ?? root) as Record<string, unknown>;
  const items = asArray(channel.item ?? channel.entry);
  return items.map((raw, index) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const title = textOf(item.title);
    const link = hrefOf(item.link) || hrefOf(item.guid);
    return {
      id: String(item.guid ?? link ?? `${source.id}:${index}`),
      sourceId: source.id,
      title,
      summary: textOf(item.description ?? item.summary ?? item.content),
      url: link || null,
      observedAt: textOf(item.pubDate ?? item.published ?? item.updated) || null,
    };
  });
}

export async function fetchForumFeed(
  source: ForumSource,
  fetchImpl: FetchLike = globalThis.fetch,
  timeoutMs = 8000,
): Promise<ForumMessage[]> {
  const response = await fetchImpl(source.url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": "radar-cyber-forums/1.0 (+public OSINT)" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return parseForumFeed(source, await response.text());
}

export async function collectForums(options: {
  sources?: readonly ForumSource[];
  fetchImpl?: FetchLike;
  timeoutMs?: number;
} = {}): Promise<ForumCollection> {
  const sources = options.sources ?? FORUM_SOURCES;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const verdicts: ForumVerdict[] = [];
  const messages: ForumMessage[] = [];
  const admitted: ForumMessage[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    let feed: ForumMessage[];
    try {
      feed = await fetchForumFeed(source, fetchImpl, options.timeoutMs);
    } catch (error) {
      errors.push(`${source.id}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    for (const message of feed) {
      const verdict = classifyForumMessage(message, source);
      if (seen.has(verdict.dedupKey)) continue;
      seen.add(verdict.dedupKey);
      messages.push(message);
      verdicts.push(verdict);
      if (verdict.relevant) admitted.push(message);
    }
  }
  return { verdicts, messages, admitted, summary: summarizeForumVerdicts(verdicts), errors };
}

/** Persist admitted messages as events; a second pass never doubles the count. */
export async function persistForumMessages(collection: ForumCollection): Promise<number> {
  let inserted = 0;
  const bySource = new Map<string, Array<{ message: ForumMessage; verdict: ForumVerdict }>>();
  for (const message of collection.admitted) {
    const verdict = collection.verdicts.find((v) => v.dedupKey === dedupKey(message));
    if (!verdict?.relevant) continue;
    const entries = bySource.get(message.sourceId) ?? [];
    entries.push({ message, verdict });
    bySource.set(message.sourceId, entries);
  }
  for (const [sourceId, entries] of bySource) {
    // Migration 206 : les événements doivent citer un run réel. Un run par
    // source traitée, ouvert avant les inserts et toujours refermé.
    let runId: number;
    try {
      runId = await openRun(sourceId, "ingest");
    } catch {
      continue;
    }
    let itemsNew = 0;
    let outcome: RunOutcome = { itemsIn: entries.length, itemsNew: 0 };
    try {
      const { rows } = await query<{ url: string | null }>(
        "SELECT url FROM source WHERE id = $1",
        [sourceId],
      );
      const sourceUrl = rows[0]?.url ?? null;
      for (const { message, verdict } of entries) {
        // Une ligne sans URL violerait `event_source_url_required` : on préfère
        // ne pas l'insérer plutôt que rompre la chaîne de preuve.
        const url = message.url || sourceUrl;
        if (!url) continue;
        const language = languageVerdict(message.title, message.summary ?? null).language;
        const result = await query(
          `INSERT INTO event
             (dedup_key, family, assertion_type, title, summary, observed_at, valid_at, at,
              severity, confidence, source_id, source_url, evidence, geo_type,
              regional, regional_motif, pertinence_score, langue)
           VALUES ($1, 'forum_message', 'ambient_signal', $2, $3, $4, $4, now(),
                   3, 'C3', $5, $6, $7::jsonb, 'unknown', true, $8, $9, $10)
           ON CONFLICT (dedup_key) DO NOTHING`,
          [
            verdict.dedupKey, message.title, message.summary || null, message.observedAt || null,
            message.sourceId, url,
            JSON.stringify(withRunId(
              { scope: verdict.place, score: verdict.score, reason: verdict.reason },
              runId,
            )),
            verdict.place, verdict.score,
            language === "fr" || language === "en" ? language : null,
          ],
        );
        const added = result.rowCount ?? 0;
        inserted += added;
        itemsNew += added;
      }
      outcome = { itemsIn: entries.length, itemsNew };
    } catch (error) {
      outcome = {
        status: "error",
        itemsIn: entries.length,
        itemsNew,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await closeRun(runId, outcome).catch(() => {});
  }
  return inserted;
}

export type ForumStats = { followedForums: number; relevantMessages: number };

/** Counts exposed by the public API and used by the reproduction command. */
export async function readForumStats(): Promise<ForumStats> {
  const { rows } = await query<{ followedForums: number; relevantMessages: number }>(
    `SELECT (SELECT count(*) FROM source WHERE family = 'forum' AND enabled)::int AS "followedForums",
            (SELECT count(*) FROM event WHERE family = 'forum_message' AND regional)::int AS "relevantMessages"`,
  );
  return rows[0] ?? { followedForums: 0, relevantMessages: 0 };
}

export async function runForumCycle(log: (msg: string) => void): Promise<void> {
  const collection = await collectForums();
  const inserted = await persistForumMessages(collection);
  const actorMentions = await persistForumActorMentions(collection);
  log(`forum actors: ${actorMentions} new mention(s)`);
  log(
    `forums: ${collection.summary.followedForums} followed, ` +
    `${collection.summary.relevantMessages} relevant message(s), ${inserted} new`,
  );
  if (collection.errors.length > 0) log(`forums: ${collection.errors.join(" | ")}`);
}
