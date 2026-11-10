/**
 * Moteur d'ingestion générique : absorbe tous les flux déclarés dans `source`.
 *   - kind='indicator' (IP, domaines, URL, hash, CVE…) → table `indicator` (détection par ligne, lots de 1000)
 *   - kind='narrative' (RSS, JSON)                       → table `event`
 * Les sources hors catalogue (collecteurs dédiés) sont gérées par server.ts.
 */
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { query } from "../db.js";

type SourceRow = {
  id: string;
  name: string;
  family: string;
  url: string;
  kind: "narrative" | "indicator";
  format: string;
  parser: Record<string, unknown>;
  interval_sec: number;
  last_ok_at: string | null;
  last_error_at: string | null;
};

type IngestResult = { items: number; added: number };

const MAX_BODY_BYTES = 25 * 1024 * 1024;
const BATCH_SIZE = 1000;

const TITLE_FIELDS = ["title", "name", "cveID", "cve", "value", "indicator", "description", "summary", "vulnerabilityName", "post_title"];
const LINK_FIELDS = ["link", "url", "reference", "href", "source_url", "permalink"];
const DATE_FIELDS = ["date", "pubDate", "dateAdded", "published", "created", "timestamp", "last_seen", "discovered"];

function detectIndicatorType(line: string): string | null {
  const value = line.trim();
  if (!value || value.startsWith("#")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return "ip";
  if (/^[0-9a-fA-F]{32}$/.test(value) || /^[0-9a-fA-F]{40}$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value)) return "hash";
  if (/^https?:\/\//.test(value)) return "url";
  if (/^cve-\d{4}-\d+$/i.test(value)) return "cve";
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return "domain";
  return null;
}

function hashKey(value: string): string {
  // 24 caractères base64url = 18 octets : tronquer un encodage direct faisait
  // s'effondrer sur une même clé tous les liens partageant le même préfixe
  // d'URL (tout www.ici.fr, par exemple). On hache d'abord.
  return createHash("sha256").update(value).digest("base64url").slice(0, 24);
}

function pickAny(item: Record<string, unknown>, candidates: string[]): string {
  for (const field of candidates) {
    const v = item[field];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      const first = v.find((x) => typeof x === "string");
      if (first) return String(first);
      continue;
    }
    if (typeof v === "object") {
      const nested = v as Record<string, unknown>;
      for (const key of ["cveID", "id", "name", "value", "url", "link"]) {
        if (typeof nested[key] === "string") return nested[key] as string;
      }
      continue;
    }
    return String(v);
  }
  return "";
}

function explicitOr(item: Record<string, unknown>, field: unknown, candidates: string[]): string {
  if (typeof field === "string" && field && typeof item[field] === "string") return item[field] as string;
  return pickAny(item, candidates);
}

function findFirstObjectArray(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    const objs = node.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null && !Array.isArray(i));
    if (objs.length > 0) return objs;
    for (const item of node) {
      const nested = findFirstObjectArray(item);
      if (nested.length > 0) return nested;
    }
    return [];
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) {
      const nested = findFirstObjectArray(value);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function parseRss(xml: string, parser: Record<string, unknown>): Record<string, unknown>[] {
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml) as Record<string, unknown>;
  const path = String(parser.itemsPath ?? "rss.channel.item");
  let node: unknown = parsed;
  for (const key of path.split(".")) {
    if (node && typeof node === "object") node = (node as Record<string, unknown>)[key];
    else { node = undefined; break; }
  }
  const items = Array.isArray(node) ? node : node ? [node] : [];
  return items.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null);
}

function parseJsonItems(body: string, parser: Record<string, unknown>): Record<string, unknown>[] {
  let data: unknown;
  try { data = JSON.parse(body); } catch { return []; }
  const path = String(parser.itemsPath ?? "");
  if (path) {
    let node: unknown = data;
    for (const key of path.split(".")) {
      if (node && typeof node === "object") node = (node as Record<string, unknown>)[key];
      else return [];
    }
    return Array.isArray(node)
      ? node.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
      : [];
  }
  return findFirstObjectArray(data);
}

async function fetchText(url: string, timeoutMs = 30000): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "radar-cyber-na/0.1 (+veille passive)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new Error(`flux trop volumineux (${(declared / 1048576).toFixed(1)} Mo)`);
  const body = await res.text();
  if (body.length > MAX_BODY_BYTES) throw new Error(`flux trop volumineux (${(body.length / 1048576).toFixed(1)} Mo)`);
  return body;
}

async function ingestIndicator(source: SourceRow, body: string): Promise<IngestResult> {
  const seen = new Set<string>();
  const batch: { type: string; value: string }[] = [];
  let items = 0;
  let added = 0;

  const flush = async (): Promise<number> => {
    if (batch.length === 0) return 0;
    const rows = batch.splice(0, batch.length);
    const values = rows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, now(), now(), 'WHITE', 'C3', $${rows.length * 2 + 1})`).join(", ");
    const params: string[] = [];
    for (const row of rows) {
      params.push(row.type, row.value);
    }
    params.push(source.id);
    const r = await query(
      `INSERT INTO indicator (type, value, first_seen, last_seen, tlp, confidence, source_id)
       VALUES ${values}
       ON CONFLICT (type, value) DO UPDATE SET last_seen=now(), source_id=EXCLUDED.source_id`,
      params
    );
    return r.rowCount ?? 0;
  };

  for (const line of body.split(/\r?\n/)) {
    const type = detectIndicatorType(line);
    if (!type) continue;
    items++;
    const value = line.trim();
    const key = `${type}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    batch.push({ type, value });
    if (batch.length >= BATCH_SIZE) added += await flush();
  }
  added += await flush();
  return { items, added };
}

async function ingestNarrative(source: SourceRow, body: string): Promise<IngestResult> {
  const parser = source.parser ?? {};
  const items = source.format === "rss"
    ? parseRss(body, parser)
    : parseJsonItems(body, parser);

  let added = 0;
  for (const item of items) {
    const title = explicitOr(item, parser.titleField, TITLE_FIELDS).slice(0, 400);
    if (!title) continue;
    const link = explicitOr(item, parser.linkField, LINK_FIELDS);
    const dateRaw = explicitOr(item, parser.dateField, DATE_FIELDS);
    const observedAt = dateRaw && !Number.isNaN(Date.parse(dateRaw)) ? new Date(dateRaw).toISOString() : undefined;
    const dedupKey = `feed:${source.id}:${hashKey(link || title)}`;

    const r = await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, severity, confidence,
        source_id, source_url, evidence, geo_type)
       VALUES ($1,$2,'ambient_signal',$3,NULL,$4,2,'C3',$5,$6,$7,'unknown')
       ON CONFLICT (dedup_key) DO NOTHING`,
      [dedupKey, source.family, title, observedAt ?? null, source.id, link || null, JSON.stringify({ feed: source.name })]
    );
    if ((r.rowCount ?? 0) > 0) added++;
  }
  return { items: items.length, added };
}

function looksLikeBlocklist(url: string): boolean {
  return /\.(txt|csv|json|zip)(\?|$)/i.test(url) || /blocklist|blacklist|hostfile|feed-osint/i.test(url);
}

async function processSource(source: SourceRow): Promise<void> {
  const lastOk = source.last_ok_at ? Date.parse(source.last_ok_at) : NaN;
  const minInterval = (source.interval_sec ?? 3600) * 1000 * 0.8;
  if (!Number.isNaN(lastOk) && Date.now() - lastOk < minInterval) return;

  try {
    const body = await fetchText(source.url);
    const asIndicator = source.kind === "indicator" || (source.format !== "rss" && looksLikeBlocklist(source.url));
    let result = asIndicator
      ? await ingestIndicator(source, body)
      : await ingestNarrative(source, body);
    if (!asIndicator && result.items === 0) {
      const fallback = await ingestIndicator(source, body);
      if (fallback.items > 0) result = fallback;
    }
    await query(
      "UPDATE source SET last_ok_at=now(), last_error=NULL, last_error_at=NULL, items_total=$1, last_items=$2 WHERE id=$3",
      [result.items, result.added, source.id]
    );
    await query(
      "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'ok', $2, $3)",
      [source.id, result.items, result.added]
    );
  } catch (e) {
    const err = String((e as Error)?.message ?? e);
    await query("UPDATE source SET last_error_at=now(), last_error=$1 WHERE id=$2", [err, source.id]).catch(() => {});
    await query(
      "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, error) VALUES ($1, now(), 'error', 0, 0, $2)",
      [source.id, err]
    ).catch(() => {});
  }
}

export async function runGenericSources(log: (msg: string) => void): Promise<void> {
  const { rows } = await query<SourceRow>(
    "SELECT id, name, family, url, kind, format, parser, interval_sec, last_ok_at, last_error_at FROM source WHERE enabled AND id NOT IN ('cert_fr','cisa_kev','ransomlook','epss','hermes_radar_cyber')"
  );
  log(`ingestion générique : ${rows.length} sources candidat(es)`);

  const CONCURRENCY = 8;
  let index = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < rows.length) {
      const source = rows[index++];
      await processSource(source);
    }
  });
  await Promise.all(workers);
}
