/**
 * Moteur d'ingestion générique : absorbe tous les flux déclarés dans `source`.
 *   - kind='indicator' (IP, domaines, URL, hash, CVE…) → table `indicator` (détection par ligne, lots de 1000)
 *   - kind='narrative' (RSS, JSON)                       → table `event`
 * Les sources hors catalogue (collecteurs dédiés) sont gérées par server.ts.
 */
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { ingestQuery } from "../db.js";
import { closeRun, openRun, withRunId } from "../collecte/runs.js";
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
	loadRelevanceOrgIndex,
	designateOrganization,
	expliquerRattachement,
	preparerGazetteer,
	type RelevanceOrg,
} from "./relevance.js";
import { evaluatePertinence, loadRelevanceConfig, type RelevanceConfig } from "./pertinence.js";
import { estTexteFrancais, porteeRegionale } from "../match/territorial.js";
import { configuredLanguages, isActionableIndicator, languageVerdict, loadActiveIndex, type ActiveIndex } from "./filter.js";
import { filterIndicators } from "./warninglist.js";
import { classifyFamily, isFamily } from "./classify.js";
import { AdmissionTally, admitEvent } from "../contract/admit.js";
import { parseClaimCards } from "./parsers/claims.js";
import { parseTelegramContact, parseTelegramMessages } from "./parsers/telegram.js";
import { decodeBody } from "./parsers/decode.js";
import { consignerLot, MOTEURS, type JournalEntry } from "../journal/index.js";
import { parseFeedDetection, parseRssItems } from "./parsers/xml.js";
import { parseJsonLd } from "./parsers/jsonld.js";
import { parseHtmlArticles } from "./parsers/article.js";
import { parseJsonItems as parseJsonItemsNew } from "./parsers/json.js";
import { parseEmbeddedJson } from "./parsers/embedded-json.js";
import { parseSource, type SourceFormat } from "./parsers/formats.js";
import { parseLandingNotice } from "./parsers/landing.js";
import { parseMalformedOnion } from "./parsers/malformed.js";
import { hasEncodingDefect, repairItems } from "./parsers/auto-repair.js";
import { constaterTransition } from "./reveil.js";
import { libelleMotif, versEvidence, type ExplicationRattachement } from "../journal/rattachement.js";

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
  /** Code INSEE du département éditeur, pour la veille `presse_locale`. */
  department: string | null;
  /** Mode de lecture déclaré (migration 036). NULL = `auto`, historique. */
  reader?: string | null;
};

/** `skipped` = éléments écartés (porte de pertinence ou filtre anti-bruit). */
/**
 * Résultat d'une ingestion de source.
 *
 * `rejected` porte les motifs agrégés du run : c'est la seule information qui
 * distingue « la source est vide » de « notre filtre refuse tout ». Sans elle,
 * une source qui lit 40 entrées et n'en retient aucune est indiscernable d'une
 * source cassée — et le chantier 15 n'a rien à se mettre sous la dent.
 */
type IngestResult = {
  items: number;
  added: number;
  skipped: number;
  rejected?: Record<string, number>;
};

/** Fusionne deux tableaux de motifs sans écraser les compteurs. */
function fusionnerMotifs(a: Record<string, number> | undefined, b: Record<string, number> | undefined): Record<string, number> | undefined {
  if (a === undefined && b === undefined) return undefined;
  const out: Record<string, number> = { ...a };
  for (const [motif, n] of Object.entries(b ?? {})) out[motif] = (out[motif] ?? 0) + n;
  return out;
}

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

/** Même normalisation que migrate-045 : accents tombés, ponctuation = espace. */
function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Identité d'un article : titre normalisé + jour UTC + source (migration 045). */
function fingerprintOf(title: string, at: Date | null, sourceId: string): string {
  const day = at === null
    ? "sans-date"
    : `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}-${String(at.getUTCDate()).padStart(2, "0")}`;
  return `${normalizeTitle(title)}|${day}|${sourceId}`;
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
  | "json-ld"
  | "rss-2"
  | "atom"
  | "rss-atom"
  | "csv"
  | "html-article"
  | "html-links"
  | "html-content"
  | "claim-cards"
  | "telegram-channel"
  | "embedded-json"
  | "telegram-contact"
  | "landing-notice"
  | "malformed-html"
  | "none";

const STRATEGY_BY_FORMAT: Record<SourceFormat, DetectionStrategy> = {
  rss2: "rss-2",
  atom: "atom",
  jsonld: "json-ld",
  html: "html-article",
  json: "json-nested-array",
  unknown: "none",
};

export type DetectionResult = {
  strategy: DetectionStrategy;
  items: Record<string, unknown>[];
  path: string | null;
};

const MAX_DETECT_DEPTH = 4;
const MAX_HTML_LINKS = 2000;

/** Les six modes annoncés par `docs/architecture-collecte.md` et migrate-036. */
export const READER_MODES = ["auto", "feed", "html-page", "html-links", "indicator-list", "quarantine-first"] as const;
export type ReaderMode = (typeof READER_MODES)[number];

/** NULL est historiquement `auto` ; une valeur inconnue ne doit rien inventer. */
export function readerMode(reader: string | null | undefined): ReaderMode {
  return READER_MODES.find((mode) => mode === reader) ?? "auto";
}

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
export function detectItems(body: string, contentType: string | null, mode: "auto" | "html-page" | "html-links" = "auto"): DetectionResult {
  const text = body.trim();
  const declared = (contentType ?? "").toLowerCase();
  // Un mode déclaré prime sur la détection : une page de fuite doit être lue
  // comme du contenu, pas comme une liste de liens de navigation.
  if (mode === "html-page") {
    const contenu = parseHtmlContent(text);
    if (contenu) return { strategy: "html-content", items: contenu.items, path: contenu.path };
  }
  if (mode === "html-links") {
    const liens = parseHtmlLinks(text);
    // Un mode déclaré ne retombe pas sur un autre extracteur : « donnez-moi
    // les liens » ne doit pas ramener des cartes de victimes ou du contenu.
    return liens
      ? { strategy: "html-links", items: liens.items, path: liens.path }
      : { strategy: "none", items: [], path: null };
  }
  const parsed = parseSource(text, { contentType: declared });
  if (parsed.items.length > 0) {
    return {
      strategy: STRATEGY_BY_FORMAT[parsed.format],
      items: parsed.items.map((item) => ({ ...item })),
      path: parsed.path || null,
    };
  }

  const jsonLd = parseJsonLd(text);
  if (jsonLd) return { strategy: "json-ld", items: jsonLd, path: "@graph" };

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

  const feed = parseFeedDetection(text);
  if (feed) return { strategy: feed.kind, items: feed.items, path: feed.path };

  // JSON sérialisé dans une balise <script> (Inertia, Next.js…) : le corps est
  // du HTML pour le transport, mais les enregistrements sont bien du JSON.
  const embedded = parseEmbeddedJson(text);
  if (embedded) return { strategy: "embedded-json", items: embedded, path: "script[type=application/json]" };

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

  // Page de contact Telegram (profil sans messages) : une identité, zéro message.
  const contact = parseTelegramContact(text);
  if (contact) {
    return {
      strategy: "telegram-contact",
      items: [{ title: `@${contact.username}`, summary: `Compte Telegram @${contact.username} (aucun message public)`, link: contact.link }],
      path: "tgme_username_link",
    };
  }
  const article = parseHtmlArticles(text);
  if (article) return { strategy: "html-article", items: article, path: "article" };
  const links = parseHtmlLinks(text);
  if (links) return { strategy: "html-links", items: links.items, path: links.path };

  // Une page structurée avec titres est du contenu, pas une bannière
  // d'atterrissage : on ne l'extrait qu'après les liens significatifs.
  if (/<h[1-3][^>]*>/i.test(text)) {
    const contenu = parseHtmlContent(text);
    if (contenu) return { strategy: "html-content", items: contenu.items, path: contenu.path };
  }
  const notice = parseLandingNotice(text);
  if (notice) return { strategy: "landing-notice", items: notice, path: "notice" };
  const malformed = parseMalformedOnion(text);
  if (malformed) return { strategy: "malformed-html", items: malformed, path: "repaired" };

  return { strategy: "none", items: [], path: null };
}

/**
 * Lecture d'une page web en tant que **contenu**, pas comme une liste de liens.
 * Retourne null si la page ne contient rien de lisible (page d'erreur, JS seul).
 */
export function parseHtmlContent(body: string): { items: Record<string, unknown>[]; path: string } | null {
  const blocs: { titre: string; texte: string }[] = [];
  const re = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>([\s\S]*?)(?=<h[1-3][^>]*>|$)/gi;
  for (const m of body.matchAll(re)) {
    const titre = decodeEntities(m[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    const texte = decodeEntities(m[2].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    if (texte.length >= 40) blocs.push({ titre: titre.slice(0, 200), texte: texte.slice(0, 4000) });
  }
  if (blocs.length === 0) {
    for (const m of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const texte = decodeEntities(m[1].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
      if (texte.length >= 60) blocs.push({ titre: texte.slice(0, 80), texte: texte.slice(0, 4000) });
      if (blocs.length >= MAX_HTML_LINKS) break;
    }
  }
  if (blocs.length === 0) return null;
  return {
    items: blocs.map((b) => ({ title: b.titre, summary: b.texte })),
    path: "html-content",
  };
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
  // Motifs de rejet des indicateurs : une valeur écartée l'est pour une raison
  // précise (dénylist, filtre d'actionnabilité, doublon d'expression).
  const rejetes: Record<string, number> = {};

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
      rejetes.warninglist = (rejetes.warninglist ?? 0) + dropped;
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
    if (seen.has(key)) {
      rejetes.doublon = (rejetes.doublon ?? 0) + 1;
      continue;
    }
    seen.add(key);
    if (idx && !isActionableIndicator(value, type, idx).keep) {
      skipped++;
      rejetes.non_actionnable = (rejetes.non_actionnable ?? 0) + 1;
      continue;
    }
    batch.push({ type, value });
    if (batch.length >= BATCH_SIZE) added += await flush();
  }
  added += await flush();
  return { items, added, skipped, ...(Object.keys(rejetes).length > 0 ? { rejected: rejetes } : {}) };
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

/**
 * Extraction content-first, puis fusion avec l'ancien chemin : les champs
 * spécifiques déclarés dans `source.parser` (`aliases`, `cveID`…) restent
 * accessibles au contrat d'admission, les cinq champs canoniques sont écrits
 * par-dessus. Quand les deux lectures ne s'alignent pas, la lecture structurée
 * gagne : elle ne ramène pas les menus d'une page comme le faisait `html-links`.
 */
export function parseNarrativeItems(body: string, parser: Record<string, unknown>, declaredFormat: string): Record<string, unknown>[] {
  const parsed = parseSource(body, {
    itemsPath: typeof parser.itemsPath === "string" ? parser.itemsPath : undefined,
  });
  if (parsed.items.length === 0) return legacyNarrativeItems(body, parser, declaredFormat);
  // Sans champ déclaré dans `parser`, refaire l'ancienne lecture ne servirait
  // qu'à doubler le coût d'un flux de plusieurs Mo.
  if (!Object.keys(parser).some((key) => key !== "itemsPath")) {
    return parsed.items.map((item) => ({ ...item }));
  }
  const legacy = legacyNarrativeItems(body, parser, declaredFormat);
  return parsed.items.map((item, i) => {
    const original = legacy.length === parsed.items.length ? legacy[i] : undefined;
    return original ? { ...original, ...item } : { ...item };
  });
}

/** `feed` : le chemin déclaré fait foi, sans repli sur un autre extracteur. */
export function parseDeclaredFeed(body: string, parser: Record<string, unknown>, declaredFormat: string): Record<string, unknown>[] {
  const parsed = parseSource(body, {
    itemsPath: typeof parser.itemsPath === "string" ? parser.itemsPath : undefined,
  });
  if (parsed.items.length > 0) return parsed.items.map((item) => ({ ...item }));
  return declaredFormat === "rss" ? parseRss(body, parser) : parseJsonItems(body, parser);
}

function legacyNarrativeItems(body: string, parser: Record<string, unknown>, declaredFormat: string): Record<string, unknown>[] {
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
      `INSERT INTO quarantine_raw (source, source_url, groupe, claimed_at, raw_body, content_hash, kind)
       VALUES ($1,$2,$3,now(),$4,$5,'unparsable')
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
	/** Domaines connus, pour la porte ; le rattachement passe par le gazetteer. */
	orgIndex: RelevanceOrg[],
	coverage: CoverageContext,
	pertinenceConfig: RelevanceConfig,
	/** Run de collecte cité par chaque événement (migration 206). */
	runId: number,
): Promise<IngestResult> {
  const parser = source.parser ?? {};
  const declaredPath = typeof parser.itemsPath === "string" ? parser.itemsPath : "";
  /** Le mode déclaré par la source (migration 036) prime sur la détection. */
  const mode = readerMode(source.reader);
  // A misdecoded body is repaired before parsing so the declared reader sees
  // the text the publisher sent, not its latin-1 interpretation.
  let bodyToParse = body;
  if (hasEncodingDefect(body)) {
    const fixed = repairItems(body, null, detectItems);
    if (fixed.repaired && fixed.items.length > 0) {
      bodyToParse = fixed.body;
      runLog?.(`[collect] ${source.id} : auto-repair ${fixed.repairs.join("+")} → ${fixed.strategy} → ${fixed.itemCount} item(s)`);
    }
  }
  let items = mode === "feed" ? parseDeclaredFeed(bodyToParse, parser, source.format) : parseNarrativeItems(bodyToParse, parser, source.format);
  if (items.length === 0) {
    const detected = detectItems(bodyToParse, null, mode === "html-page" || mode === "html-links" ? mode : "auto");
    items = detected.items;
    if (detected.strategy === "none") {
      // Structural repairs run only after every reader has failed: they
      // change the transport wrapper, never the content of the items.
      const fixed = repairItems(bodyToParse, null, detectItems, detected);
      if (fixed.repaired && fixed.items.length > 0) {
        items = fixed.items;
        runLog?.(`[collect] ${source.id} : auto-repair ${fixed.repairs.join("+")} → ${fixed.strategy} → ${items.length} item(s)`);
      } else {
        // Une page `.onion` illisible n'est pas une page vide : c'est une page
        // qu'on ne sait pas encore lire. La jeter en silence rendait 64 sources
        // muettes invisibles. Elle part en quarantaine, où elle est relisible.
        const quarantined = source.url.includes(".onion")
          ? await quarantineUnparsedBody(source, body)
          : false;
        runLog?.(`[collect] ${source.id} : format non reconnu (${body.length} o) — ${declaredPath ? `itemsPath="${declaredPath}" stérile` : "aucun itemsPath"}, refus explicite${quarantined ? ", page mise en quarantaine" : ""}`);
        return { items: 0, added: 0, skipped: 0 };
      }
    } else {
      runLog?.(`[collect] ${source.id} : auto-détection ${detected.strategy}${detected.path ? ` (${detected.path})` : ""} → ${items.length} item(s)`);
    }
  }

  // Veille de presse locale : la provenance départementale est le signal, pas
  // le vocabulaire du titre. On n'applique donc ni la porte cyber ni la
  // rétrogradation en `presse` : un titre de la vie locale reste un fait
  // régional à ne pas perdre. La famille dédiée le distingue des incidents.
  const localPress = source.family === "presse_locale";
  // Porte de pertinence : un flux de presse généraliste livre sa une, pas de
  // la cyber. Seules les sources `strict` (déjà cyber) passent sans filtre.
  const gate = !localPress && source.relevance !== "strict";
  const allowedLanguages = configuredLanguages();
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
  // Le contrat appliqué, et ses écarts comptés plutôt que tus.
  const contract = new AdmissionTally();

  let added = 0;
  let skipped = 0;
  const fetchedAt = new Date();
  // Faits à consigner pour cette source. Accumulés pendant la boucle puis
  // écrits en une requête : le journal ne doit pas doubler le coût de collecte.
  const faits: JournalEntry[] = [];

  for (const item of items) {
    const title = decodeEntities(explicitOr(item, parser.titleField, TITLE_FIELDS)).slice(0, 400);
    const summary = decodeEntities(explicitOr(item, parser.summaryField, SUMMARY_FIELDS)).slice(0, 2000);
    if (!title) continue;
    const langue = languageVerdict(title, summary, allowedLanguages);
    if (!langue.keep) {
      const motif = `langue_${langue.language}`;
      rejectedBy[motif] = (rejectedBy[motif] ?? 0) + 1;
      skipped++;
      continue;
    }
    if (menuFilter) {
      const reason = isMenuEntry(title, source.name);
      if (reason) {
        menuRejected[reason] = (menuRejected[reason] ?? 0) + 1;
        skipped++;
        continue;
      }
    }
    const link = explicitOr(item, parser.linkField, LINK_FIELDS);
    // Couverture élargie : l'EPSS et le département sont des signaux comme les
    // autres, ils montent le score au lieu d'être un contournement de la porte.
    // L'URL reste hors du texte examiné par la règle département.
    const epssHit = gate ? admitByEpss(cveTextOf(item, title, summary), coverage) : null;
    const department = localPress || (gate && admitsDepartment(`${title} ${summary}`, coverage.deptNames));
    let pertinence = evaluatePertinence(
      { title, summary, url: link, sourceUrl: link },
      {
        orgs: orgIndex,
        ignoreDomains: [sourceHost],
        config: pertinenceConfig,
        epss: epssHit,
        department,
      },
    );
    if (localPress) {
      // Score conservé pour l'observabilité, mais l'admission est portée par
      // le département de la source — jamais par un mot-clé du titre.
      pertinence = { ...pertinence, relevant: true, reason: "dept", rule: "dept" };
    }
    // La porte consulte aussi le gazetteer : un nom distinctif absent de
    // l'index de pertinence peut encore admettre l'item. Le score suit alors
    // ce rattachement, sinon l'événement serait admis avec un score de rejet.
    const nomme = gate && !pertinence.relevant ? designateOrganization(`${title} ${summary}`) : null;
    if (nomme !== null) {
      pertinence = {
        ...pertinence,
        score: Math.min(10, Math.max(pertinence.score, 3) + 3),
        relevant: true,
        reason: "org",
        rule: "org",
      };
    }
    if (gate && !pertinence.relevant) {
      rejectedBy["hors_sujet"] = (rejectedBy["hors_sujet"] ?? 0) + 1;
      skipped++;
      continue;
    }
    let orgId: number | null = null;
    let explication: ExplicationRattachement = {
      moteur: "gazetteer@2",
      motif: "aucun",
      alias: null,
      confiance: 0,
      indisponible: true,
    };
    try {
      // Même verrou qu'en corrélation : un texte anglais ne désigne pas une
      // organisation régionale. Les flux de vulnérabilités décrivent des
      // composants, pas des victimes.
      const texteRattachable = `${title} ${summary}`;
      const matchedOrg = !estTexteFrancais(texteRattachable)
        ? null
        : (nomme ?? designateOrganization(texteRattachable));
      orgId = matchedOrg?.orgId ?? null;
      if (matchedOrg) {
        // Le moteur sait pourquoi il rattache : on le garde, sinon la fiche
        // d'un événement rattaché ne peut rien expliquer d'autre que « fait ».
        explication = matchedOrg.explication ?? {
          moteur: "gazetteer@2",
          motif: "alias-distinctif",
          alias: null,
          confiance: matchedOrg.confidence,
        };
      } else {
        // Aucun rattachement : la raison compte autant que l'absence. « Le
        // texte ne nomme personne » et « deux homonymes à égalité » ne se
        // corrigent pas de la même façon.
        explication = expliquerRattachement(`${title} ${summary}`);
      }
    } catch {
      orgId = null;
      explication = { moteur: "gazetteer@2", motif: "aucun", alias: null, confiance: 0, indisponible: true };
    }
    const dateRaw = explicitOr(item, parser.dateField, DATE_FIELDS);
    // parseObservedAt couvre RFC 822/3339, formats français et relatifs ; à
    // défaut il retombe sur l'instant de collecte, ce qui évite les
    // observed_at NULL qui s'accumulaient en fin de fil.
    const parsed = parseObservedAt(dateRaw, { fetchedAt });
    // L'identité d'un article, c'est son titre normalisé + son jour UTC + sa
    // source (migration 045). La clé historique ne portait que le titre brut :
    // une casse, un accent ou des espaces différents créaient un doublon.
    // La clé dérive de l'empreinte pour qu'un conflit sur l'une soit toujours
    // un conflit sur l'autre — un seul ON CONFLICT suffit alors à l'insertion.
    const fingerprint = fingerprintOf(title, parsed.at, source.id);
    const dedupKey = `feed:${hashKey(fingerprint)}`;
    // Porte cyber : le texte décide. Une dépêche régionale publiée par une
    // source déclarée `cti` n'est pas du renseignement. Elle était classée
    // `presse` et conservée ; sur décision utilisateur du 10 novembre, elle
    // est désormais refusée à l'entrée : la base ne contient que du cyber.
    // Les familles `ransomware`/`cert_fr` et l'allowlist gardent leur famille.
    const family = localPress
      ? "presse_locale"
      : isFamily(source.family)
        ? classifyFamily({ title, summary, sourceFamily: source.family, sourceName: source.name })
        : source.family;
    if (family === "presse") {
      rejectedBy["presse"] = (rejectedBy["presse"] ?? 0) + 1;
      skipped++;
      continue;
    }

    // Marqueur d'admission : une organisation rattachée prime ; sinon la règle
    // qui a fait passer l'item, sinon null (admis par la porte de pertinence).
    // Une veille locale est admise par son département éditeur.
    const admissionRule = localPress ? "dept" : orgId !== null ? "org" : pertinence.rule;

    // Contrat partagé : c'est lui qui tranche désormais, pas les troncatures
    // ad hoc d'ici. Une famille hors contrat ne passe plus (avant l'élargissement
    // de FAMILIES, `leaks`/`paste` traversaient sans contrôle) ; une broutille
    // réparable ne fait plus perdre l'événement. Les écarts sont comptés.
    // Portée régionale calculée à l'écriture : le fil doit pouvoir trier et
    // filtrer sans recalculer 19 000 textes à chaque requête. Une veille
    // locale est régionale par sa source, pas par une mention dans le titre.
    const portee = localPress && source.department
      ? { regional: true, motif: "departement" as const }
      : porteeRegionale(`${title} ${summary}`, orgId);
    const admitted = admitEvent({
      dedupKey,
      family,
      assertionType: "ambient_signal",
      title,
      summary,
      observedAt: parsed.at?.toISOString(),
      severity: 2,
      confidence: "C3",
      sourceId: source.id,
      sourceUrl: link || `urn:source:${source.id}`,
      // La preuve porte le pourquoi du rattachement, pas seulement la source,
      // et le run de collecte qui a produit l'événement.
      evidence: withRunId({
        feed: source.name,
        rattachement: versEvidence(explication),
        pertinence: { score: pertinence.score, motif: pertinence.reason, termes: pertinence.matches.map((m) => m.term) },
        ...(localPress && source.department ? { departement: source.department, presseLocale: true } : {}),
      }, runId),
      geoType: "unknown",
    });
    contract.record(admitted);
    if (!admitted.ok) {
      skipped++;
      for (const reason of admitted.rejections) {
        rejectedBy[`contrat:${reason}`] = (rejectedBy[`contrat:${reason}`] ?? 0) + 1;
      }
      continue;
    }
    const event = admitted.event;
    const r = await ingestQuery<{ inserted: boolean }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, summary, langue, org_id, observed_at, valid_at, at, date_source, date_confidence, severity, confidence,
        source_id, source_url, evidence, geo_type, admission_rule, regional, regional_motif, fingerprint, pertinence_score, pertinence_rule, dept)
       VALUES ($1,$2,$13,$3,$10,$22,$11,$4,$20,$21,$5,$6,$14,$15,$7,$8,$9,$16,$12,$17,$18,$19,$23,$24,$25)
       ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL DO NOTHING
       RETURNING (xmax = 0) AS inserted`,
      [event.dedupKey, event.family, event.title, event.observedAt ?? null, parsed.source, parsed.confidence,
        event.sourceId, event.sourceUrl ?? `urn:source:${source.id}`, JSON.stringify(event.evidence ?? {}), event.summary ?? null, orgId, admissionRule,
        event.assertionType, event.severity, event.confidence ?? "C3", event.geoType,
        portee.regional, portee.motif, fingerprint,
        // valid_at : la date de l'article ; at : le moment où on l'a lu.
        event.observedAt ?? fetchedAt.toISOString(), fetchedAt.toISOString(), langue.language,
        pertinence.score, pertinence.rule, localPress ? source.department : null]
    );
    if (r.rows[0]?.inserted) added++;
    faits.push({
      kind: orgId !== null ? "event.rattachement" : "match.decided",
      subject: dedupKey,
      summary: orgId !== null
        ? `${source.id} : rattaché — ${libelleMotif(explication.motif)}${explication.alias ? ` (« ${explication.alias} »)` : ""}`
        : `${source.id} : non rattaché — ${libelleMotif(explication.motif)}`,
      actor: `moteur:${MOTEURS.rattachement}`,
      // Le pourquoi, pas seulement le quoi : c'est ce qui permet de mesurer
      // plus tard ce qu'un changement de moteur a corrigé.
      payload: { orgId, ...versEvidence(explication), famille: family, admission: admissionRule },
      validAt: event.observedAt ?? null,
    });
  }
  // Écriture groupée : les faits partent par paquets, avec repli ligne à ligne.
  // Le journal ne doit jamais faire perdre une collecte ; en échange il rend
  // ses comptes : trous consignés, échecs restants signalés, rien d'avalé.
  if (faits.length > 0) {
    const lot = await consignerLot(faits);
    if (lot.lacunes > 0 || lot.erreurs.length > 0) {
      runLog?.(`[journal] ${source.id} : ${lot.consignes} fait(s) consigné(s), ${lot.lacunes} lacune(s), ${lot.erreurs.length} échec(s) — ${lot.erreurs[0]?.slice(0, 120) ?? ""}`);
    }
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
  // Les réparations ne rejettent rien : sans cette ligne elles passeraient
  // inaperçues. Utile pour repérer une source qui dérive.
  const contractLine = contract.logLine();
  if (contractLine) runLog?.(`[collect] ${source.id} : contrat — ${contractLine}`);
  // Les motifs de rejet partent en base, pas seulement dans les logs : c'est
  // ce qui permet de répondre à « pourquoi cette source ne rend-elle rien »
  // sans relancer une collecte.
  const motifs = fusionnerMotifs(
    Object.keys(rejectedBy).length > 0 ? rejectedBy : undefined,
    Object.keys(menuRejected).length > 0 ? menuRejected : undefined,
  );
  return { items: items.length, added, skipped, ...(motifs !== undefined ? { rejected: motifs } : {}) };
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

type ReaderDecisionSource = { reader?: string | null; kind: string; format: string; url: string };

/** `indicator-list` force la lecture ligne à ligne, même sur un corps HTML. */
export function doitLireIndicateurs(source: ReaderDecisionSource, body: string): boolean {
  const mode = readerMode(source.reader);
  if (mode === "indicator-list") return true;
  if (mode !== "auto") return false;
  return source.kind === "indicator" || (source.format !== "rss" && looksLikeBlocklist(source.url, body));
}

/** `quarantine-first` conserve le corps brut avant toute extraction. */
export function doitMettreEnQuarantaine(source: { reader?: string | null }): boolean {
  return readerMode(source.reader) === "quarantine-first";
}

async function processSource(source: SourceRow, orgIndex: RelevanceOrg[], coverage: CoverageContext, pertinenceConfig: RelevanceConfig, force = false, intervalles: Readonly<Record<string, number>> = {}): Promise<void> {
  // Une source qui n'a jamais réussi (last_ok_at NULL) ne doit pas être
  // retentée à chaque tick : le dernier échec sert de référence.
  const lastOk = source.last_ok_at ? Date.parse(source.last_ok_at) : NaN;
  const lastAttempt = source.last_error_at ? Date.parse(source.last_error_at) : NaN;
  const reference = Number.isNaN(lastOk) ? lastAttempt : lastOk;
  const minInterval = (intervalles[source.id] ?? source.interval_sec ?? 3600) * 1000 * 0.8;
  if (!force && !Number.isNaN(reference) && Date.now() - reference < minInterval) return;

  // Le run est ouvert après la lecture du corps mais avant toute écriture
  // d'événement : chaque ligne cite son identifiant (migration 206).
  let runId: number | null = null;
  try {
    const body = await fetchText(source.url);
    runId = await openRun(source.id);
    // 304 Not Modified : rien de neuf, la source reste saine.
    if (body === "") {
      await ingestQuery(
        "UPDATE source SET last_ok_at=now(), last_error=NULL, last_error_at=NULL WHERE id=$1",
        [source.id]
      );
      await closeRun(runId, { itemsIn: 0, itemsNew: 0 });
      return;
    }
    if (doitMettreEnQuarantaine(source)) {
      await quarantineUnparsedBody(source, body);
    }
    const asIndicator = doitLireIndicateurs(source, body);
    // Filtre anti-bruit : les blocklists mondiales (réputation, phishing) ne
    // gardent que les indicateurs actionnables pour nos actifs (voir filter.ts).
    const filterIdx = asIndicator && (looksLikeBlocklist(source.url, body) || source.family === "reputation" || source.family === "phishing")
      ? activeIndex ?? undefined
      : undefined;
    let result = asIndicator
      ? await ingestIndicator(source, body, filterIdx)
      : await ingestNarrative(source, body, orgIndex, coverage, pertinenceConfig, runId);
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
    const motifRun = classerMotifEchec({ itemsExtraits: result.items, itemsRetenus: result.added });
    const rejectedAvecMotif = motifRun
      ? { ...(result.rejected ?? {}), motif: motifRun }
      : (result.rejected ?? undefined);
    await closeRun(runId, {
      itemsIn: result.items,
      itemsNew: result.added,
      itemsSkipped: result.skipped,
      itemsRejected: rejectedAvecMotif ?? null,
    });
    // Le changement d'état est un fait : « elle se réveille » et « elle
    // s'assoupit » ne se lisent nulle part ailleurs, et c'est pourtant la seule
    // information qui distingue une source qui vient de casser d'une source qui
    // n'a jamais rien valu.
    await constaterTransition(source.id, "ok", result.added);
  } catch (e) {
    const err = String((e as Error)?.message ?? e);
    await ingestQuery("UPDATE source SET last_error_at=now(), last_error=$1 WHERE id=$2", [err, source.id]).catch(() => {});
    const motifErr = classerMotifEchec({ erreur: err }) ?? "reseau";
    if (runId !== null) {
      await closeRun(runId, { status: "error", error: err, itemsRejected: { motif: motifErr } }).catch(() => {});
    } else {
      // L'ouverture du run elle-même a échoué : on garde la trace d'échec
      // historique, sans prétendre citer un run inexistant.
      await ingestQuery(
        "INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new, items_rejected, error) VALUES ($1, now(), 'error', 0, 0, $2, $3)",
        [source.id, JSON.stringify({ motif: motifErr }), err]
      ).catch(() => {});
    }
    await constaterTransition(source.id, "error", 0, err);
  }
}

export async function runGenericSources(
	log: (msg: string) => void,
	opts?: { sourceIds?: string[]; limit?: number; force?: boolean; intervalles?: Readonly<Record<string, number>> },
): Promise<void> {
	// Les sources ci-dessous ont un collecteur dédié (collectors/index.ts) :
	// le moteur générique ne doit pas tenter de les parser comme des flux.
	const params: unknown[] = [];
	let sql =
		"SELECT id, name, family, url, kind, format, parser, interval_sec, last_ok_at, last_error_at, relevance, department, reader FROM source WHERE enabled AND kind <> 'quarantine' AND id NOT IN ('cert_fr','cisa_kev','ransomlook','epss','hermes_radar_cyber','nvd_cve','ctlog','poc','certfr_misp')";
	if (opts?.sourceIds?.length) {
		params.push(opts.sourceIds);
		sql += ` AND id = ANY($${params.length})`;
	}
	// Jamais collectées d'abord : avec une concurrence bornée, une source sans
	// aucun run sinon restait au bout de la file à chaque cycle.
	sql += ` ORDER BY CASE WHEN last_ok_at IS NULL AND NOT EXISTS
	            (SELECT 1 FROM collector_run r WHERE r.source_id = source.id) THEN 0 ELSE 1 END,
	            last_ok_at ASC NULLS FIRST, id`;
	if (opts?.limit) {
		params.push(opts.limit);
		sql += ` LIMIT $${params.length}`;
	}
	const { rows } = await ingestQuery<SourceRow>(sql, params);
  log(`ingestion générique : ${rows.length} sources candidat(es)`);
  runLog = log;
  const pertinenceConfig = loadRelevanceConfig();
  log(`pertinence : ${pertinenceConfig.keywords.length} terme(s), ${pertinenceConfig.exclusions.length} exclusion(s), seuil ${pertinenceConfig.minScore}`);
  for (const warning of pertinenceConfig.warnings) log(`[pertinence] ${warning}`);
  // Index de pertinence chargé une seule fois par run (392 orgs + domaines).
  const { rows: orgRows } = await ingestQuery<{ name: string; domain: string | null; assets: string[] | null }>(
    "SELECT o.name, o.domain, array_remove(array_agg(DISTINCT a.value), NULL) AS assets FROM org o LEFT JOIN asset a ON a.org_id = o.id AND a.kind IN ('domain','subdomain') GROUP BY o.id"
  );
  const orgIndex = loadRelevanceOrgIndex(orgRows.map((o) => ({ name: o.name, domain: o.domain, assets: o.assets ?? [] })));
  // Le rattachement s'appuie sur le gazetteer (alias + rôles), chargé une seule
  // fois par run : un index de 52 000 alias coûte ~1 s, pas une requête par item.
  const aliasIndexes = await preparerGazetteer();
  log(`gazetteer : ${aliasIndexes} alias indexés pour le rattachement`);
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
      await processSource(source, orgIndex, coverage, pertinenceConfig, opts?.force === true, opts?.intervalles);
    }
  });
  await Promise.all(workers);
}

/**
 * Motif d'échec d'un run de collecte (chantier 15).
 *
 * « Zéro » ne dit pas la même chose selon l'endroit où le zéro apparaît :
 *   - `reseau`    : la source n'a pas pu être lue (timeout, 403, 5xx, socket)
 *   - `format`    : elle a été lue, mais le corps n'est pas du JSON/XML exploitable
 *   - `selecteur` : page valide lue, l'extraction n'a rien trouvé
 *   - `filtre`    : des éléments extraits, aucun retenu par le filtre cyber
 *
 * Seuls les deux derniers parlent du *traitement* ; les deux premiers disent
 * que la source elle-même est en cause. Les confondre, c'est désactiver une
 * source saine ou garder une source morte.
 */
export type MotifEchec = "reseau" | "format" | "selecteur" | "filtre";

export interface MotifEchecInput {
	/** Message d'erreur du run, s'il y en a eu un. Prioritaire sur le reste. */
	erreur?: string | null;
	/** Corps lu mais illisible (JSON/XML invalide). */
	formatInvalide?: boolean;
	/** Code HTTP observé. 404 = page absente, ce n'est pas une panne. */
	httpStatus?: number;
	itemsExtraits?: number;
	itemsRetenus?: number;
}

export function classerMotifEchec(input: MotifEchecInput): MotifEchec | null {
	const { erreur, formatInvalide, httpStatus, itemsExtraits = 0, itemsRetenus = 0 } = input;
	if (erreur) {
		// Un message d'erreur prime : le run n'a pas pu aller au bout.
		const illisible = /json|xml|pars|invalid/i.test(erreur);
		const reseau = /timeout|fetch|econn|socket|enotfound|\b5\d\d\b|403/i.test(erreur);
		return illisible && !reseau ? "format" : "reseau";
	}
	if (formatInvalide) return "format";
	if (httpStatus !== undefined && httpStatus !== 404 && httpStatus >= 400) return "reseau";
	if (itemsExtraits === 0) return "selecteur";
	if (itemsRetenus === 0) return "filtre";
	return null;
}
