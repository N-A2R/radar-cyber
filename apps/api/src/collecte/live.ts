/**
 * Continuous collection stream for opted-in Nouvelle-Aquitaine sources.
 *
 * The general cycle loads a very large gazetteer and polls every 60 seconds.
 * A live source needs a much shorter publication-to-record delay, so this loop
 * uses a lightweight path: resilient HTTP fetch, feed parsing, relevance and
 * admission checks, then a direct event insert. The database trigger installed
 * in migrate-063 records the delay between the feed publication timestamp and
 * the write, so the published number is measured at insert time.
 *
 * Only Nouvelle-Aquitaine sources are eligible: region or department. Sources
 * outside the region are ignored even if mistakenly flagged live.
 */
import { createHash } from "node:crypto";
import { ingestQuery, query } from "../db.js";
import { admitEvent } from "../contract/admit.js";
import { isFamily } from "../collectors/classify.js";
import { parseObservedAt } from "../collectors/dates.js";
import { fetchResilient } from "../collectors/http.js";
import { languageVerdict } from "../collectors/filter.js";
import { parseNarrativeItems } from "../collectors/generic.js";
import { evaluatePertinence, loadRelevanceConfig } from "../collectors/pertinence.js";
import { porteeRegionale } from "../match/territorial.js";

export const NA_DEPARTMENTS: readonly string[] = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
export const DEFAULT_LIVE_INTERVAL_MS = 15_000;
const TITLE_FIELDS = ["title", "name", "headline", "description", "summary"];
const LINK_FIELDS = ["link", "url", "guid", "permalink", "href"];
const DATE_FIELDS = ["pubDate", "date", "published", "updated", "timestamp", "created"];
const SUMMARY_FIELDS = ["description", "summary", "content", "excerpt", "body"];
const CONCURRENCY = 4;

export type LiveSource = {
  id: string;
  name: string;
  url: string;
  format: string;
  parser: Record<string, unknown>;
  family: string;
  relevance: string;
  intervalMs: number;
};
export type LiveCycle = { sourceIds: string[]; sources: number; items: number; inserted: number };

export function liveTickMs(): number {
  const configured = Number(process.env.RADAR_LIVE_TICK_MS ?? DEFAULT_LIVE_INTERVAL_MS);
  return Number.isFinite(configured) && configured >= 1000 ? configured : DEFAULT_LIVE_INTERVAL_MS;
}

/** Eligible sources, read from the catalogue on every cycle (no stale cache). */
export async function listLiveSources(): Promise<LiveSource[]> {
  const { rows } = await query<{
    id: string; name: string; url: string; format: string; parser: Record<string, unknown> | null;
    family: string; relevance: string; interval_ms: number;
  }>(
    `SELECT id, name, url, format, parser, family, relevance, GREATEST(1000, live_interval_ms) AS interval_ms
       FROM source
      WHERE enabled AND live
        AND (lower(coalesce(region, '')) = 'nouvelle-aquitaine' OR department = ANY($1::text[]))
      ORDER BY id`,
    [[...NA_DEPARTMENTS]],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    format: row.format ?? "rss",
    parser: row.parser ?? {},
    family: row.family,
    relevance: row.relevance ?? "context",
    intervalMs: Number(row.interval_ms),
  }));
}

function pick(item: Record<string, unknown>, declared: unknown, candidates: readonly string[]): string {
  if (typeof declared === "string" && typeof item[declared] === "string") return item[declared] as string;
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return "";
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return ""; }
}

/**
 * One pass over all live sources. Each source is isolated: a dead feed must
 * never stop the others. Only items with a real feed publication timestamp are
 * inserted, because an inferred timestamp cannot measure publication latency.
 */
export async function collectLiveSourcesOnce(log: (message: string) => void): Promise<LiveCycle> {
  const sources = await listLiveSources();
  if (sources.length === 0) return { sourceIds: [], sources: 0, items: 0, inserted: 0 };
  const config = loadRelevanceConfig();
  const counts = { items: 0, inserted: 0 };
  const fetchedAt = new Date();
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < sources.length) {
      const source = sources[cursor++] as LiveSource;
      try {
        const response = await fetchResilient(source.url, { timeoutMs: 8000, maxAttempts: 1, source: source.id });
        if (response.notModified) {
          await noteRun(source.id, 0, 0);
          continue;
        }
        const items = parseNarrativeItems(response.text, source.parser, source.format);
        let itemsNew = 0;
        for (const item of items) {
          const title = pick(item, source.parser.titleField, TITLE_FIELDS).slice(0, 400);
          const summary = pick(item, source.parser.summaryField, SUMMARY_FIELDS).slice(0, 2000);
          const link = pick(item, source.parser.linkField, LINK_FIELDS);
          const dateRaw = pick(item, source.parser.dateField, DATE_FIELDS);
          if (title.length === 0) continue;
          const parsed = parseObservedAt(dateRaw, { fetchedAt });
          if (parsed.source !== "feed" || parsed.at === null) continue;
          const langue = languageVerdict(title, summary);
          if (!langue.keep) continue;
          if (source.relevance !== "strict") {
            const verdict = evaluatePertinence(
              { title, summary, url: link, sourceUrl: link },
              { config, ignoreDomains: [hostOf(source.url)] },
            );
            if (!verdict.relevant) continue;
          }
          const family = isFamily(source.family) && source.family !== "presse" ? source.family : "cti";
          const fingerprint = createHash("sha256").update(`${source.id}|${title}|${parsed.at.toISOString()}`).digest("hex");
          const admitted = admitEvent({
            dedupKey: `live:${fingerprint}`,
            family,
            assertionType: "ambient_signal",
            title,
            summary,
            observedAt: parsed.at.toISOString(),
            severity: 2,
            confidence: "C3",
            sourceId: source.id,
            sourceUrl: link || undefined,
            evidence: { live: true, feed: source.name, dateSource: parsed.source },
            geoType: "unknown",
          });
          if (!admitted.ok) continue;
          counts.items++;
          const event = admitted.event;
          const portee = porteeRegionale(`${title} ${summary}`, null);
          const inserted = await ingestQuery<{ inserted: boolean }>(
            `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at,
               valid_at, at, date_source, date_confidence, severity, confidence, source_id, source_url,
               evidence, geo_type, regional, regional_motif)
             VALUES ($1,$2,$3,$4,$5,$6,$6,now(),$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (dedup_key) DO NOTHING
             RETURNING (xmax = 0) AS inserted`,
            [event.dedupKey, event.family, event.assertionType, event.title, event.summary ?? null,
              event.observedAt ?? null, parsed.source, parsed.confidence, event.severity,
              event.confidence ?? "C3", event.sourceId, event.sourceUrl ?? null,
              JSON.stringify(event.evidence ?? {}), event.geoType, portee.regional, portee.motif],
          );
          if (inserted.rows[0]?.inserted) {
            itemsNew++;
            counts.inserted++;
          }
        }
        await noteRun(source.id, items.length, itemsNew);
        log(`live source ${source.id}: ${items.length} item(s), ${itemsNew} new`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await ingestQuery(
          "UPDATE source SET last_error_at=now(), last_error=$1 WHERE id=$2",
          [message.slice(0, 500), source.id],
        ).catch(() => {});
        await ingestQuery(
          "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, error) VALUES ($1, now(), 'error', 0, 0, $2)",
          [source.id, message.slice(0, 500)],
        ).catch(() => {});
        log(`live source ${source.id} failed: ${message.slice(0, 160)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, sources.length) }, worker));
  return { sourceIds: sources.map((source) => source.id), sources: sources.length, ...counts };
}

async function noteRun(sourceId: string, itemsIn: number, itemsNew: number): Promise<void> {
  await ingestQuery("UPDATE source SET last_ok_at=now(), last_error=NULL, last_error_at=NULL WHERE id=$1", [sourceId]);
  await ingestQuery(
    "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'ok', $2, $3)",
    [sourceId, itemsIn, itemsNew],
  );
}

/**
 * Start the independent loop. Returns a stop function so tests and scripts
 * can own the timer. `RADAR_LIVE=0` disables it without touching the config.
 */
export function startLiveStream(log: (message: string) => void): () => void {
  if (process.env.RADAR_LIVE === "0") return () => {};
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    const started = Date.now();
    try {
      const cycle = await collectLiveSourcesOnce(log);
      log(`live stream: ${cycle.sources} source(s), ${cycle.inserted} item(s) in ${Date.now() - started} ms`);
    } catch (error) {
      log(`live stream error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void tick(); }, liveTickMs());
  timer.unref();
  return () => clearInterval(timer);
}
