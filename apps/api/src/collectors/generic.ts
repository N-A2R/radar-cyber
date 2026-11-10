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
import {
	admitsDepartment,
	admitByEpss,
	DEPT_LABELS,
	ensureCoverageSchema,
	EPSS_ADMISSION_THRESHOLD,
	PREFECTURES,
	type CoverageContext,
	isRelevant,
	loadRelevanceOrgIndex,
	matchOrgForText,
	type RelevanceOrg,
} from "./relevance.js";
import { isActionableIndicator, loadActiveIndex, type ActiveIndex } from "./filter.js";
import { filterIndicators } from "./warninglist.js";
import { classifyFamily, isFamily } from "./classify.js";
import { parseClaimCards } from "./parsers/claims.js";
import { parseTelegramMessages } from "./parsers/telegram.js";
import { decodeBody } from "./parsers/decode.js";
import { parseRssItems } from "./parsers/xml.js";
import { parseJsonItems as parseJsonItemsNew } from "./parsers/json.js";

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
/** Journal du run courant : `ingestIndicator` n'a pas de contexte à recevoir. */
let runLog: ((msg: string) => void) | null = null;

const TITLE_FIELDS = ["title", "name", "cveID", "cve", "value", "indicator", "description", "summary", "vulnerabilityName", "post_title"];
const LINK_FIELDS = ["link", "url", "reference", "href", "source_url", "permalink"];
const DATE_FIELDS = ["date", "pubDate", "dateAdded", "published", "created", "timestamp", "last_seen", "discovered"];
const SUMMARY_FIELDS = ["summary", "description", "content", "excerpt", "abstract", "body", "text", "post_content"];

/** Entités nommées les plus fréquentes dans les flux RSS/Atom. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©",
  reg: "®", trade: "™", middot: "·", hellip: "…", mdash: "—", ndash: "–",
  laquo: "«", raquo: "»", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
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
  let value = line.trim();
  if (!value || value.startsWith("#")) return null;
  value = value.replace(/^(?:async|sync)\s+/i, "").trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return "ip";
  if (/^[0-9a-fA-F]{32}$/.test(value) || /^[0-9a-fA-F]{40}$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value)) return "hash";
  if (/^https?:\/\//.test(value)) return "url";
  if (/^cve-\d{4}-\d+$/i.test(value)) return "cve";
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/[^\s]*)?$/i.test(value)) return "domain";
  return null;
}

function hashKey(value: string): string {
  return createHash("sha256").update(value).digest("base64url").slice(0, 24);
}

/** Champs portant un identifiant CVE en plus du titre (OSV `aliases`, `cve`…). */
const CVE_ALIAS_FIELDS = ["aliases", "cve", "cveID", "cves", "vulnerabilityId", "identifiers"];

function collectStrings(value: unknown, out: string[]): void {
	if (typeof value === "string") out.push(value);
	else if (Array.isArray(value)) for (const entry of value) collectStrings(entry, out);
	else if (value && typeof value === "object") for (const entry of Object.values(value)) collectStrings(entry, out);
}

/** Texte où chercher les CVE de l'item : titre, résumé et champs d'alias. */
function cveTextOf(item: Record<string, unknown>, title: string, summary: string): string {
	const extra: string[] = [];
	for (const field of CVE_ALIAS_FIELDS) collectStrings(item[field], extra);
	return [title, summary, ...extra].join(" ");
}

function pickAny(item: Record<string, unknown>, candidates: string[]): string {
  for (const field of candidates) {
    const v = item[field];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      const first = v.find((x) => typeof x === "string");
      if (first) return String(first);
      if (v[0] && typeof v[0] === "object") {
        const nested = v[0] as Record<string, unknown>;
        for (const key of ["cveID", "id", "name", "value", "url", "link", "href", "#text", "@_href"]) {
          if (typeof nested[key] === "string") return nested[key] as string;
        }
      }
      continue;
    }
    if (typeof v === "object") {
      const nested = v as Record<string, unknown>;
      for (const key of ["cveID", "id", "name", "value", "url", "link", "href", "#text", "@_href"]) {
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
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" }).parse(xml) as Record<string, unknown>;
  const path = String(parser.itemsPath ?? "rss.channel.item");
  let node: unknown = parsed;
  for (const key of path.split(".")) {
    if (node && typeof node === "object") node = (node as Record<string, unknown>)[key];
    else { node = undefined; break; }
  }
  const items = Array.isArray(node) ? node : node ? [node] : [];
  return items.filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null);
}

/**
 * Stratégies d'extraction essayées quand `parser.itemsPath` est vide ou stérile.
 * L'ordre est fixe : tableau JSON racine, premier tableau d'objets (profondeur
 * ≤ 4), flux RSS/Atom/RDF, CSV, puis page HTML. `none` = refus explicite.
 */
export type DetectionStrategy =
  | "json-root-array"
  | "json-nested-array"
  | "rss-atom"
  | "csv"
  | "html-links"
  | "claim-cards"
  | "telegram-channel"
  | "none";

export type DetectionResult = {
  strategy: DetectionStrategy;
  items: Record<string, unknown>[];
  path: string | null;
};

const MAX_DETECT_DEPTH = 4;
const MAX_HTML_LINKS = 2000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toObjectArray(value: unknown[]): Record<string, unknown>[] {
  return value.filter(isObject);
}

/** Premier tableau d'objets rencontré, avec son chemin (`data.items`…). */
function findObjectArrayWithPath(
  node: unknown,
  depth: number,
  path: string[],
): { items: Record<string, unknown>[]; path: string } | null {
  if (depth > MAX_DETECT_DEPTH) return null;
  if (Array.isArray(node)) {
    const objects = toObjectArray(node);
    if (objects.length > 0) return { items: objects, path: path.join(".") };
    for (let i = 0; i < node.length; i += 1) {
      const found = findObjectArrayWithPath(node[i], depth + 1, [...path, String(i)]);
      if (found) return found;
    }
    return null;
  }
  if (isObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      const found = findObjectArrayWithPath(value, depth + 1, [...path, key]);
      if (found) return found;
    }
  }
  return null;
}

function pickPath(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split(".")) {
    if (!isObject(node)) return undefined;
    node = node[key];
  }
  return node;
}

const FEED_PATHS = ["rss.channel.item", "channel.item", "feed.entry", "rdf:RDF.item", "RDF.item"];

/** `<item>` (RSS 2.0), `<entry>` (Atom) ou `<item>` (RDF) → objets. */
function parseFeedItems(body: string): { items: Record<string, unknown>[]; path: string } | null {
  if (!/<(?:[\w.-]+:)?(?:item|entry)[\s>]/i.test(body)) return null;
  let parsed: unknown;
  try {
    parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" }).parse(body);
  } catch {
    return null;
  }
  for (const path of FEED_PATHS) {
    const node = pickPath(parsed, path);
    const items = Array.isArray(node) ? node : node === undefined ? [] : [node];
    const objects = toObjectArray(items);
    if (objects.length > 0) return { items: objects, path };
  }
  return null;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += ch;
  }
  cells.push(cell);
  return cells;
}

/** CSV avec en-tête : au moins 2 colonnes nommées et une ligne de données. */
function parseCsvItems(body: string): { items: Record<string, unknown>[]; path: string } | null {
  const lines = body.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 2001);
  if (lines.length < 2) return null;
  const headerLine = lines[0];
  const delimiter = [",", ";", "\t"].find((d) => headerLine.split(d).length >= 2);
  if (!delimiter) return null;
  const columns = splitCsvLine(headerLine, delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
  if (columns.length < 2 || columns.some((c) => c.length === 0)) return null;
  const items: Record<string, unknown>[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line, delimiter);
    if (cells.length !== columns.length) continue;
    const item: Record<string, unknown> = {};
    columns.forEach((column, i) => {
      item[column] = cells[i].trim();
    });
    items.push(item);
  }
  return items.length > 0 ? { items, path: "csv-header" } : null;
}

/** Page HTML : liens `<a href>` significatifs (hors ancres et javascript:). */
function parseHtmlLinks(body: string): { items: Record<string, unknown>[]; path: string } | null {
  const linkRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const items: Record<string, unknown>[] = [];
  for (const match of body.matchAll(linkRe)) {
    const href = match[1].trim();
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) continue;
    const title = decodeEntities(match[2].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    if (title.length < 4) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    items.push({ title: title.slice(0, 400), link: href });
    if (items.length >= MAX_HTML_LINKS) break;
  }
  return items.length >= 3 ? { items, path: "a[href]" } : null;
}

/**
 * Détection automatique du format d'un corps de flux. Pure et sans effet de
 * bord : le diagnostic (`scripts/diagnose-parsers.mts`) l'appelle tel quel.
 */
export function detectItems(body: string, contentType: string | null): DetectionResult {
  const text = body.trim();
  const declared = (contentType ?? "").toLowerCase();
  if (!text) return { strategy: "none", items: [], path: null };

  if (text.startsWith("[") || text.startsWith("{")) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
    if (Array.isArray(data)) {
      const objects = toObjectArray(data);
      if (objects.length > 0) return { strategy: "json-root-array", items: objects, path: "" };
    }
    if (data !== undefined) {
      const nested = findObjectArrayWithPath(data, 0, []);
      if (nested) return { strategy: "json-nested-array", items: nested.items, path: nested.path };
    }
  }

  if (declared.includes("json") && !declared.includes("xml")) {
    // JSON annoncé mais illisible : on continue quand même, le corps peut être
    // une page d'erreur HTML servie avec le bon content-type.
  }

  const feed = parseFeedItems(text);
  if (feed) return { strategy: "rss-atom", items: feed.items, path: feed.path };

  if (!text.startsWith("<")) {
    const csv = parseCsvItems(text);
    if (csv) return { strategy: "csv", items: csv.items, path: csv.path };
  }

  // Page de revendication : les victimes sont dans des cartes, pas dans les
  // liens. Sans cette détection, le parseur générique ramène les menus du site
  // et la porte de pertinence les rejette — c'est la cause des 64 sources
  // `.onion` muettes.
  const claims = parseClaimCards(text);
  if (claims) {
    return {
      strategy: "claim-cards",
      items: claims.map((claim) => ({
        title: claim.name,
        summary: [claim.sector, claim.country, claim.status, claim.summary].filter(Boolean).join(" — "),
        link: claim.link,
      })),
      path: "h3",
    };
  }

  // Aperçu public d'un canal Telegram : le contenu est dans les messages, pas
  // dans les liens d'interface. Sans ça, 24 sources `tg-*` ramenaient
  // « @canal » et « Download Telegram ».
  const telegram = parseTelegramMessages(text);
  if (telegram) {
    return {
      strategy: "telegram-channel",
      items: telegram.map((message) => ({
        title: message.text.slice(0, 200),
        summary: message.text,
        link: message.link,
        date: message.datetime,
      })),
      path: "tgme_widget_message_text",
    };
  }

  const links = parseHtmlLinks(text);
  if (links) return { strategy: "html-links", items: links.items, path: links.path };

  return { strategy: "none", items: [], path: null };
}

/** Champs d'objet portant une valeur d'indicateur dans un flux structuré. */
const INDICATOR_VALUE_FIELDS = ["value", "indicator", "ioc", "ip", "domain", "hostname", "host", "url", "link", "cidr", "title", "description", "summary"];

/** Valeurs d'indicateur tirées d'items structurés (JSON, CSV, RSS). */
function indicatorLines(items: Record<string, unknown>[]): string[] {
  const lines: string[] = [];
  for (const item of items) {
    for (const field of INDICATOR_VALUE_FIELDS) {
      const value = item[field];
      if (typeof value === "string" && detectIndicatorType(value)) lines.push(value.trim());
    }
    if (lines.length >= 20000) break;
  }
  return lines;
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
  const buf = (res as any).buffer as Buffer | undefined;
  if (buf) {
    if (buf.length > MAX_BODY_BYTES) throw new Error(`flux trop volumineux (${(buf.length / 1048576).toFixed(1)} Mo)`);
    const ct = (res as any).contentType as string | null | undefined;
    return decodeBody(buf, ct ?? null).text;
  }
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
    // Dénylist : les valeurs légitimement courantes (domaines populaires,
    // réseaux de datacenters) ne sont pas des indicateurs d'attaque.
    const { kept, dropped } = filterIndicators(
      rows.map((row) => ({ kind: row.type, value: row.value, row }))
    );
    if (dropped > 0) {
      runLog?.(`filtre : ${dropped}/${rows.length} indicateur(s) légitime(s) écarté(s) (warninglists)`);
    }
    const usable = kept.map((entry) => entry.row);
    if (usable.length === 0) return 0;
    const values = usable.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, now(), now(), 'WHITE', 'C3', $${usable.length * 2 + 1})`).join(", ");
    const params: string[] = [];
    for (const row of usable) {
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

function isMenuEntry(title: string, sourceName: string): "menu_path" | "menu_token" | "menu_source" | null {
  const t = title.trim();
  if (!t) return null;
  if (/^\//.test(t) || /\.(?:rss|xml|atom|feed)$/i.test(t)) return "menu_path";
  if (!/\s/.test(t)) {
    if (/^CVE-\d{4}-\d+$/i.test(t)) return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(t)) return null;
    if (/^[0-9a-fA-F]{32}$/.test(t) || /^[0-9a-fA-F]{40}$/.test(t) || /^[0-9a-fA-F]{64}$/.test(t)) return null;
    if (/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?:\.[a-z]{2,})(?:\/\S*)?$/i.test(t)) return null;
    return "menu_token";
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, " ").trim();
  const nt = norm(t);
  const ns = norm(sourceName);
  if (nt && ns && nt === ns) return "menu_source";
  const words = nt.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && ns && (ns.includes(nt) || nt.includes(ns))) return "menu_source";
  return null;
}

function parseNarrativeItems(body: string, parser: Record<string, unknown>, declaredFormat: string): Record<string, unknown>[] {
  const trimmed = body.trimStart();
  const looksFeed = /^<\?xml|^<(?:rss|feed|rdf:RDF)\b|^<rdf:RDF\b/i.test(trimmed) || /<(?:[\w.-]+:)?(?:item|entry)[\s>]/i.test(trimmed.slice(0, 20000));
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  const declaredPath = typeof parser.itemsPath === "string" ? parser.itemsPath : "";

  // 1) Content-first: real feed markup beats declared format
  if (looksFeed) {
    const items = parseRssItems(body, declaredPath || undefined);
    if (items.length > 0) return items;
  }
  if (looksJson) {
    const items = parseJsonItems(body, parser);
    if (items.length > 0) return items;
  }

  // 2) Declared-format path when content hint is ambiguous
  if (!looksFeed && !looksJson) {
    if (declaredFormat === "rss") {
      const items = parseRss(body, parser);
      if (items.length > 0) return items;
    } else {
      const items = parseJsonItems(body, parser);
      if (items.length > 0) return items;
    }
  }

  // 3) Fallback auto-detection (existing contract for scripts)
  const detected = detectItems(body, null);
  return detected.items;
}

/**
 * Met le corps illisible d'une page `.onion` en quarantaine.
 *
 * Le refus explicite protège la base d'un parsing inventé, mais il rendait le
 * problème invisible : 64 sources répondaient 200 et ne laissaient aucune
 * trace. La quarantaine conserve le corps brut, avec une empreinte sha256 qui
 * évite de le réécrire à chaque collecte.
 */
async function quarantineUnparsedBody(source: SourceRow, body: string): Promise<boolean> {
  try {
    const contentHash = createHash("sha256").update(`${source.id}:${body}`).digest("hex");
    const r = await ingestQuery(
      `INSERT INTO quarantine_raw (source, source_url, groupe, claimed_at, raw_body, content_hash)
       VALUES ($1,$2,$3,now(),$4,$5)
       ON CONFLICT (source, content_hash) DO NOTHING`,
      [source.id, source.url, source.name, body.slice(0, 400_000), contentHash]
    );
    return (r.rowCount ?? 0) > 0;
  } catch (error) {
    runLog?.(`[collect] ${source.id} : quarantaine impossible — ${String(error).slice(0, 120)}`);
    return false;
  }
}

async function ingestNarrative(
	source: SourceRow,
	body: string,
	orgIndex: RelevanceOrg[],
	coverage: CoverageContext,
): Promise<IngestResult> {
  const parser = source.parser ?? {};
  const declaredPath = typeof parser.itemsPath === "string" ? parser.itemsPath : "";
  let items = parseNarrativeItems(body, parser, source.format);
  if (items.length === 0) {
    const detected = detectItems(body, null);
    items = detected.items;
    if (detected.strategy === "none") {
      // Une page `.onion` illisible n'est pas une page vide : c'est une page
      // qu'on ne sait pas encore lire. La jeter en silence rendait 64 sources
      // muettes invisibles. Elle part en quarantaine, où elle est relisible.
      const quarantined = source.url.includes(".onion")
        ? await quarantineUnparsedBody(source, body)
        : false;
      runLog?.(`[collect] ${source.id} : format non reconnu (${body.length} o) — ${declaredPath ? `itemsPath="${declaredPath}" stérile` : "aucun itemsPath"}, refus explicite${quarantined ? ", page mise en quarantaine" : ""}`);
      return { items: 0, added: 0, skipped: 0 };
    }
    runLog?.(`[collect] ${source.id} : auto-détection ${detected.strategy}${detected.path ? ` (${detected.path})` : ""} → ${items.length} item(s)`);
  }

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

  // Filtre menu RSS : certaines sources exposent les entrées de menu du flux
  // comme items. Exclu pour la famille cert_fr et les avis ANSSI.
  const isCertFr = source.family === "cert_fr";
  const isAnssiAvis = /cert-?fr|anssi/i.test(source.id) || /cert-?fr|anssi/i.test(source.name);
  const menuFilter = !isCertFr && !isAnssiAvis;
  const menuRejected: Record<string, number> = {};
  // Motifs de rejet après parsing. Sans ce compteur, une source qui parse
  // correctement mais dont tous les items sont filtrés était indiscernable
  // d'une source cassée : même silence, mêmes zéro événement.
  const rejectedBy: Record<string, number> = {};

  let added = 0;
  let skipped = 0;
  const fetchedAt = new Date();
  for (const item of items) {
    const title = decodeEntities(explicitOr(item, parser.titleField, TITLE_FIELDS)).slice(0, 400);
    const summary = decodeEntities(explicitOr(item, parser.summaryField, SUMMARY_FIELDS)).slice(0, 2000);
    if (!title) continue;
    if (menuFilter) {
      const reason = isMenuEntry(title, source.name);
      if (reason) {
        menuRejected[reason] = (menuRejected[reason] ?? 0) + 1;
        skipped++;
        continue;
      }
    }
    const link = explicitOr(item, parser.linkField, LINK_FIELDS);
    // Couverture élargie : un item rebuté par la porte peut être admis par la
    // règle (a) (CVE dont le score EPSS en base dépasse le seuil) ou (b) (un
    // département de Nouvelle-Aquitaine est cité en mot entier). L'URL reste
    // hors du texte examiné par (b).
    let admission: "epss" | "dept" | null = null;
    if (gate && !isRelevant({ title, url: link, sourceUrl: link }, { orgs: orgIndex, ignoreDomains: [sourceHost] }).relevant) {
      if (admitByEpss(cveTextOf(item, title, summary), coverage) !== null) admission = "epss";
      else if (admitsDepartment(`${title} ${summary}`, coverage.deptNames)) admission = "dept";
      if (admission === null) {
        rejectedBy["hors_sujet"] = (rejectedBy["hors_sujet"] ?? 0) + 1;
        skipped++;
        continue;
      }
    }
    let orgId: number | null = null;
    try {
      const matchedOrg = await matchOrgForText(`${title} ${summary}`);
      orgId = matchedOrg?.orgId ?? null;
    } catch {
      orgId = null;
    }
    const dateRaw = explicitOr(item, parser.dateField, DATE_FIELDS);
    // parseObservedAt couvre RFC 822/3339, formats français et relatifs ; à
    // défaut il retombe sur l'instant de collecte, ce qui évite les
    // observed_at NULL qui s'accumulaient en fin de fil.
    const parsed = parseObservedAt(dateRaw, { fetchedAt });
    const dedupKey = `feed:${source.id}:${hashKey(link || title)}`;
    // Porte cyber : le texte décide. Une dépêche régionale publiée par une
    // source déclarée `cti` n'est pas du renseignement. Elle était classée
    // `presse` et conservée ; sur décision utilisateur du 10 novembre, elle
    // est désormais refusée à l'entrée : la base ne contient que du cyber.
    // Les familles `ransomware`/`cert_fr` et l'allowlist gardent leur famille.
    const family = isFamily(source.family)
      ? classifyFamily({ title, summary, sourceFamily: source.family, sourceName: source.name })
      : source.family;
    if (family === "presse") {
      rejectedBy["presse"] = (rejectedBy["presse"] ?? 0) + 1;
      skipped++;
      continue;
    }

    // DO UPDATE : un événement déjà connu mais sans date (ingéré avant la
    // correction) reçoit enfin observed_at. Sans ça, re-parser ne répare rien.
    // Marqueur d'admission : une organisation rattachée prime ; sinon la règle
    // qui a fait passer l'item, sinon null (admis par la porte de pertinence).
    const admissionRule: "org" | "epss" | "dept" | null = orgId !== null ? "org" : admission;
    const r = await ingestQuery<{ inserted: boolean }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, org_id, observed_at, date_source, date_confidence, severity, confidence,
        source_id, source_url, evidence, geo_type, admission_rule)
       VALUES ($1,$2,'ambient_signal',$3,$10,$11,$4,$5,$6,2,'C3',$7,$8,$9,'unknown',$12)
       ON CONFLICT (dedup_key) DO UPDATE SET
         observed_at      = COALESCE(event.observed_at, EXCLUDED.observed_at),
         date_source      = COALESCE(event.date_source, EXCLUDED.date_source),
         date_confidence  = COALESCE(event.date_confidence, EXCLUDED.date_confidence),
         admission_rule   = COALESCE(event.admission_rule, EXCLUDED.admission_rule)
       RETURNING (xmax = 0) AS inserted`,
      [dedupKey, family, title, parsed.at?.toISOString() ?? null, parsed.source, parsed.confidence,
        source.id, link || null, JSON.stringify({ feed: source.name }), summary, orgId, admissionRule]
    );
    if (r.rows[0]?.inserted) added++;
  }
  for (const [reason, n] of Object.entries(menuRejected)) {
    runLog?.(`[collect] ${source.id} : ${n} entrée(s) menu rejetée(s) (${reason})`);
  }
  if (skipped > 0) {
    const detail = Object.entries(rejectedBy)
      .map(([reason, n]) => `${reason}=${n}`)
      .join(", ");
    runLog?.(`[collect] ${source.id} : ${skipped}/${items.length} item(s) rejeté(s)${detail ? ` — ${detail}` : ""}`);
  }
  return { items: items.length, added, skipped };
}

/**
 * Contexte des règles de couverture : scores EPSS joints sur l'identifiant CVE
 * depuis la table `epss` (migration 021), aucun appel réseau, et lieux de la région.
 */
async function loadCoverageContext(): Promise<CoverageContext> {
  const { rows: epssRows } = await ingestQuery<{ cve: string; score: number }>(
    `SELECT cve, score FROM epss WHERE score >= $1`
  , [EPSS_ADMISSION_THRESHOLD]);
  const epssByCve = new Map<string, number>();
  for (const row of epssRows) {
    if (row.cve && Number.isFinite(row.score)) epssByCve.set(row.cve, row.score);
  }
  const { rows: deptRows } = await ingestQuery<{ dept: string }>(
    "SELECT DISTINCT dept FROM org WHERE dept IS NOT NULL"
  );
  const deptNames = new Set<string>();
  for (const row of deptRows) {
    const label = DEPT_LABELS[row.dept];
    if (label) deptNames.add(label);
  }
  for (const prefecture of PREFECTURES) deptNames.add(prefecture);
  return { epssByCve, epssThreshold: EPSS_ADMISSION_THRESHOLD, deptNames: [...deptNames] };
}

function looksLikeBlocklist(url: string, body?: string): boolean {
  if (body !== undefined) {
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    const sample = lines.slice(0, 200);
    const recognized = sample.filter((l) => detectIndicatorType(l) !== null).length;
    return sample.length > 0 && recognized / sample.length > 0.3;
  }
  return /blocklist|blacklist|hostfile|feed-osint/i.test(url);
}

async function processSource(source: SourceRow, orgIndex: RelevanceOrg[], coverage: CoverageContext): Promise<void> {
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
        "UPDATE source SET last_ok_at=now(), last_error=NULL, last_error_at=NULL WHERE id=$1",
        [source.id]
      );
      await ingestQuery(
        "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new) VALUES ($1, now(), 'ok', 0, 0)",
        [source.id]
      );
      return;
    }
    const asIndicator = source.kind === "indicator" || (source.format !== "rss" && looksLikeBlocklist(source.url, body));
    // Filtre anti-bruit : les blocklists mondiales (réputation, phishing) ne
    // gardent que les indicateurs actionnables pour nos actifs (voir filter.ts).
    const filterIdx = asIndicator && (looksLikeBlocklist(source.url, body) || source.family === "reputation" || source.family === "phishing")
      ? activeIndex ?? undefined
      : undefined;
    let result = asIndicator
      ? await ingestIndicator(source, body, filterIdx)
      : await ingestNarrative(source, body, orgIndex, coverage);
    // Flux marqué `indicator` mais livré en JSON/CSV/RSS : les lignes brutes ne
    // portent aucun indicateur, on extrait les valeurs des items structurés.
    if (asIndicator && result.items === 0) {
      const detected = detectItems(body, null);
      const lines = detected.strategy === "none" ? [] : indicatorLines(detected.items);
      if (lines.length > 0) {
        runLog?.(`[collect] ${source.id} : auto-détection ${detected.strategy} → ${lines.length} valeur(s) d'indicateur`);
        const retry = await ingestIndicator(source, lines.join("\n"), filterIdx);
        if (retry.items > 0) result = retry;
      } else {
        runLog?.(`[collect] ${source.id} : aucun indicateur extractible (${detected.strategy}), refus explicite`);
      }
    }
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
  runLog = log;

  // Index de pertinence chargé une seule fois par run (392 orgs + domaines).
  const { rows: orgRows } = await ingestQuery<{ name: string; domain: string | null; assets: string[] | null }>(
    "SELECT o.name, o.domain, array_remove(array_agg(DISTINCT a.value), NULL) AS assets FROM org o LEFT JOIN asset a ON a.org_id = o.id AND a.kind IN ('domain','subdomain') GROUP BY o.id"
  );
  const orgIndex = loadRelevanceOrgIndex(orgRows.map((o) => ({ name: o.name, domain: o.domain, assets: o.assets ?? [] })));
  activeIndex = await loadActiveIndex();

  // Couverture élargie : colonne `admission_rule` (migration idempotente),
  // scores EPSS de la source `epss` déjà en base (aucun appel réseau) et
  // vocabulaire des départements de Nouvelle-Aquitaine présents dans `org`,
  // complété par les préfectures.
  await ensureCoverageSchema();
  const coverage = await loadCoverageContext();
  log(`couverture : ${coverage.epssByCve.size} score(s) EPSS, seuil ${coverage.epssThreshold}, ${coverage.deptNames.length} lieu(x)`);
  log(`filtre : ${activeIndex.domains.size} domaine(s), ${activeIndex.ips.size} IP, ${activeIndex.cves.size} CVE(s)`);

  const CONCURRENCY = 8;
  let index = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < rows.length) {
      const source = rows[index++];
      await processSource(source, orgIndex, coverage);
    }
  });
  await Promise.all(workers);
}
