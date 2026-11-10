/**
 * Moteur d'ingestion générique : absorbe tous les flux déclarés dans `source`.
 *   - kind='indicator' (IP, domaines, URL, hash, CVE…) → table `indicator` (détection par ligne, lots de 1000)
 *   - kind='narrative' (RSS, JSON)                       → table `event`
 * Les sources hors catalogue (collecteurs dédiés) sont gérées par server.ts.
 */
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { ingestQuery } from "../db.js";
import { parseObservedAt } from "./dates.js";
import { fetchResilient } from "./http.js";
import { isRelevant, loadRelevanceOrgIndex, type RelevanceOrg } from "./relevance.js";
import { isActionableIndicator, loadActiveIndex, type ActiveIndex } from "./filter.js";

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
  relevance: string;
};

/** `skipped` = éléments écartés (porte de pertinence ou filtre anti-bruit). */
type IngestResult = { items: number; added: number; skipped: number };

const MAX_BODY_BYTES = 25 * 1024 * 1024;
const BATCH_SIZE = 1000;
/** Index des actifs surveillés : chargé une fois par run dans `runGenericSources`. */
let activeIndex: ActiveIndex | null = null;

const TITLE_FIELDS = ["title", "name", "cveID", "cve", "value", "indicator", "description", "summary", "vulnerabilityName", "post_title"];
const LINK_FIELDS = ["link", "url", "reference", "href", "source_url", "permalink"];
const DATE_FIELDS = ["date", "pubDate", "dateAdded", "published", "created", "timestamp", "last_seen", "discovered"];
const SUMMARY_FIELDS = ["summary", "description", "content", "excerpt", "abstract", "body", "text", "post_content"];

/** Entités nommées les plus fréquentes dans les flux RSS/Atom. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©",
  reg: "®", trade: "™", middot: "·", hellip: "…", mdash: "—", ndash: "–",
  laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  agrave: "à", aacute: "á", acirc: "â", ccedil: "ç", eacute: "é", egrave: "è",
  ecirc: "ê", euml: "ë", igrave: "ì", icirc: "î", iuml: "ï", ocirc: "ô",
  ugrave: "ù", ucirc: "û", uuml: "ü", ouml: "ö", auml: "ä", szlig: "ß",
};

/**
 * Décode les entités HTML (&amp;, &eacute;, &#xE9;, &#8217;…). Certains flux
 * échappent deux fois, si bien que l'UI affichait « d&#xE9;fectueux ».
 */
function decodeEntities(value: string): string {
  if (!value || !value.includes("&")) return value;
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

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

/**
 * Récupère le corps d'un flux via le client résilient (Retry-After, backoff,
 * GET conditionnel). Un 304 renvoie une chaîne vide : la source est déjà à jour.
 */
async function fetchText(url: string, timeoutMs = 30000): Promise<string> {
  // Les API abuse.ch (URLhaus, SSLBL) exigent un en-tête Auth-Key depuis 2025.
  const key = process.env.ABUSECH_AUTH_KEY;
  const extra = key && /(^|\.)abuse\.ch$/i.test(new URL(url).hostname) ? { "Auth-Key": key } : undefined;
  const res = await fetchResilient(url, { timeoutMs, headers: extra });
  if (res.notModified) return "";
  if (res.text.length > MAX_BODY_BYTES) {
    throw new Error(`flux trop volumineux (${(res.text.length / 1048576).toFixed(1)} Mo)`);
  }
  return res.text;
}

async function ingestIndicator(source: SourceRow, body: string, idx?: ActiveIndex): Promise<IngestResult> {
  const seen = new Set<string>();
  const batch: { type: string; value: string }[] = [];
  let items = 0;
  let added = 0;
  let skipped = 0;

  const flush = async (): Promise<number> => {
    if (batch.length === 0) return 0;
    const rows = batch.splice(0, batch.length);
    const values = rows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, now(), now(), 'WHITE', 'C3', $${rows.length * 2 + 1})`).join(", ");
    const params: string[] = [];
    for (const row of rows) {
      params.push(row.type, row.value);
    }
    params.push(source.id);
    const r = await ingestQuery(
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
    if (idx && !isActionableIndicator(value, type, idx).keep) {
      skipped++;
      continue;
    }
    batch.push({ type, value });
    if (batch.length >= BATCH_SIZE) added += await flush();
  }
  added += await flush();
  return { items, added, skipped };
}

async function ingestNarrative(source: SourceRow, body: string, orgIndex: RelevanceOrg[]): Promise<IngestResult> {
  const parser = source.parser ?? {};
  const items = source.format === "rss"
    ? parseRss(body, parser)
    : parseJsonItems(body, parser);

  // Porte de pertinence : un flux de presse généraliste livre sa une, pas de
  // la cyber. Seules les sources `strict` (déjà cyber) passent sans filtre.
  const gate = source.relevance !== "strict";
  // L'hôte du flux est exclu du matching d'entités (voir relevance.ts).
  let sourceHost = "";
  try {
    sourceHost = new URL(source.url).host;
  } catch {
    sourceHost = "";
  }

  let added = 0;
  let skipped = 0;
  const fetchedAt = new Date();
  for (const item of items) {
    const title = decodeEntities(explicitOr(item, parser.titleField, TITLE_FIELDS)).slice(0, 400);
    const summary = decodeEntities(explicitOr(item, parser.summaryField, SUMMARY_FIELDS)).slice(0, 2000);
    if (!title) continue;
    const link = explicitOr(item, parser.linkField, LINK_FIELDS);
    if (gate && !isRelevant({ title, url: link, sourceUrl: link }, { orgs: orgIndex, ignoreDomains: [sourceHost] }).relevant) {
      skipped++;
      continue;
    }
    const dateRaw = explicitOr(item, parser.dateField, DATE_FIELDS);
    // parseObservedAt couvre RFC 822/3339, formats français et relatifs ; à
    // défaut il retombe sur l'instant de collecte, ce qui évite les
    // observed_at NULL qui s'accumulaient en fin de fil.
    const parsed = parseObservedAt(dateRaw, { fetchedAt });
    const dedupKey = `feed:${source.id}:${hashKey(link || title)}`;

    // DO UPDATE : un événement déjà connu mais sans date (ingéré avant la
    // correction) reçoit enfin observed_at. Sans ça, re-parser ne répare rien.
    const r = await ingestQuery<{ inserted: boolean }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at, date_source, date_confidence, severity, confidence,
        source_id, source_url, evidence, geo_type)
       VALUES ($1,$2,'ambient_signal',$3,$10,$4,$5,$6,2,'C3',$7,$8,$9,'unknown')
       ON CONFLICT (dedup_key) DO UPDATE SET
         observed_at      = COALESCE(event.observed_at, EXCLUDED.observed_at),
         date_source      = COALESCE(event.date_source, EXCLUDED.date_source),
         date_confidence  = COALESCE(event.date_confidence, EXCLUDED.date_confidence)
       RETURNING (xmax = 0) AS inserted`,
      [dedupKey, source.family, title, parsed.at?.toISOString() ?? null, parsed.source, parsed.confidence,
        source.id, link || null, JSON.stringify({ feed: source.name }), summary]
    );
    if (r.rows[0]?.inserted) added++;
  }
  return { items: items.length, added, skipped };
}

function looksLikeBlocklist(url: string): boolean {
  return /\.(txt|csv|json|zip)(\?|$)/i.test(url) || /blocklist|blacklist|hostfile|feed-osint/i.test(url);
}

async function processSource(source: SourceRow, orgIndex: RelevanceOrg[]): Promise<void> {
  // Une source qui n'a jamais réussi (last_ok_at NULL) ne doit pas être
  // retentée à chaque tick : le dernier échec sert de référence.
  const lastOk = source.last_ok_at ? Date.parse(source.last_ok_at) : NaN;
  const lastAttempt = source.last_error_at ? Date.parse(source.last_error_at) : NaN;
  const reference = Number.isNaN(lastOk) ? lastAttempt : lastOk;
  const minInterval = (source.interval_sec ?? 3600) * 1000 * 0.8;
  if (!Number.isNaN(reference) && Date.now() - reference < minInterval) return;

  try {
    const body = await fetchText(source.url);
    // 304 Not Modified : rien de neuf, la source reste saine.
    if (body === "") {
      await ingestQuery(
        "UPDATE source SET last_ok_at=now(), last_error=NULL, last_error_at=NULL, last_items=0 WHERE id=$1",
        [source.id]
      );
      await ingestQuery(
        "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'ok', 0, 0)",
        [source.id]
      );
      return;
    }
    const asIndicator = source.kind === "indicator" || (source.format !== "rss" && looksLikeBlocklist(source.url));
    // Filtre anti-bruit : les blocklists mondiales (réputation, phishing) ne
    // gardent que les indicateurs actionnables pour nos actifs (voir filter.ts).
    const filterIdx = asIndicator && (looksLikeBlocklist(source.url) || source.family === "reputation" || source.family === "phishing")
      ? activeIndex ?? undefined
      : undefined;
    let result = asIndicator
      ? await ingestIndicator(source, body, filterIdx)
      : await ingestNarrative(source, body, orgIndex);
    if (!asIndicator && result.items === 0) {
      const fallback = await ingestIndicator(source, body);
      if (fallback.items > 0) result = fallback;
    }
    await ingestQuery(
      "UPDATE source SET last_ok_at=now(), last_error=NULL, last_error_at=NULL, items_total=$1, last_items=$2 WHERE id=$3",
      [result.items, result.added, source.id]
    );
    await ingestQuery(
      "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, items_skipped) VALUES ($1, now(), 'ok', $2, $3, $4)",
      [source.id, result.items, result.added, result.skipped]
    );
  } catch (e) {
    const err = String((e as Error)?.message ?? e);
    await ingestQuery("UPDATE source SET last_error_at=now(), last_error=$1 WHERE id=$2", [err, source.id]).catch(() => {});
    await ingestQuery(
      "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, error) VALUES ($1, now(), 'error', 0, 0, $2)",
      [source.id, err]
    ).catch(() => {});
  }
}

export async function runGenericSources(
	log: (msg: string) => void,
	opts?: { sourceIds?: string[]; limit?: number },
): Promise<void> {
	// Les sources ci-dessous ont un collecteur dédié (collectors/index.ts) :
	// le moteur générique ne doit pas tenter de les parser comme des flux.
	const params: unknown[] = [];
	let sql =
		"SELECT id, name, family, url, kind, format, parser, interval_sec, last_ok_at, last_error_at, relevance FROM source WHERE enabled AND kind <> 'quarantine' AND id NOT IN ('cert_fr','cisa_kev','ransomlook','epss','hermes_radar_cyber','nvd_cve','ctlog')";
	if (opts?.sourceIds?.length) {
		params.push(opts.sourceIds);
		sql += ` AND id = ANY($${params.length})`;
	}
	sql += " ORDER BY id";
	if (opts?.limit) {
		params.push(opts.limit);
		sql += ` LIMIT $${params.length}`;
	}
	const { rows } = await ingestQuery<SourceRow>(sql, params);
  log(`ingestion générique : ${rows.length} sources candidat(es)`);

  // Index de pertinence chargé une seule fois par run (392 orgs + domaines).
  const { rows: orgRows } = await ingestQuery<{ name: string; domain: string | null; assets: string[] | null }>(
    "SELECT o.name, o.domain, array_remove(array_agg(DISTINCT a.value), NULL) AS assets FROM org o LEFT JOIN asset a ON a.org_id = o.id AND a.kind IN ('domain','subdomain') GROUP BY o.id"
  );
  const orgIndex = loadRelevanceOrgIndex(orgRows.map((o) => ({ name: o.name, domain: o.domain, assets: o.assets ?? [] })));
  activeIndex = await loadActiveIndex();
  log(`filtre : ${activeIndex.domains.size} domaine(s), ${activeIndex.ips.size} IP, ${activeIndex.cves.size} CVE(s)`);

  const CONCURRENCY = 8;
  let index = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < rows.length) {
      const source = rows[index++];
      await processSource(source, orgIndex);
    }
  });
  await Promise.all(workers);
}
