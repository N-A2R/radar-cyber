/**
 * Champs canoniques partagés par tous les parseurs de sources.
 *
 * Un flux RSS, un document JSON-LD, une page HTML et une API JSON maison ne
 * nomment pas les mêmes choses de la même façon : `pubDate`, `datePublished`,
 * `dateAdded` ou `<time datetime>` désignent la même date ; `headline`,
 * `post_title` ou `vulnerabilityName` le même titre. Ce module ramène chaque
 * item à `title`, `date`, `link`, `summary` sans jeter les champs d'origine —
 * le collecteur en a besoin pour les indicateurs et les alias de dates.
 */

import { parseDate } from "../dates.js";
import { isRecord } from "./guards.js";
export type CanonicalItem = Record<string, unknown> & {
  title: string;
  date?: string;
  link?: string;
  summary?: string;
};

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®",
  laquo: "«", raquo: "»", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
  mdash: "—", ndash: "–", hellip: "…", eacute: "é", egrave: "è", agrave: "à",
  ccedil: "ç", ouml: "ö", ucirc: "û", iuml: "ï", szlig: "ß",
};

const ENTITY_RE = /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g;
const TAG_RE = /<[^>]*>/g;

/** Entités HTML, y compris numériques et doublement échappées (`&amp;#8217;`). */
export function decodeEntities(value: string): string {
  if (!value || !value.includes("&")) return value;
  const decodeOnce = (text: string): string => text.replace(ENTITY_RE, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(hex ? entity.slice(2) : entity.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try { return String.fromCodePoint(code); } catch { return match; }
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
  const first = decodeOnce(value);
  return first !== value && first.includes("&") ? decodeOnce(first) : first;
}

/** Texte lisible d'un champ HTML (description RSS, contenu Atom, article…). */
export function stripHtml(value: string): string {
  if (!value.includes("<")) return decodeEntities(value);
  const withoutNoise = value
    .replace(/<(?:script|style|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|noscript)\s*>/gi, " ")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n");
  return decodeEntities(withoutNoise.replace(TAG_RE, " "))
    .replace(/[\t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

/** Date ISO UTC quand elle est compréhensible, sinon la chaîne d'origine. */
export function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const at = parseDate(trimmed);
  return at ? at.toISOString() : trimmed;
}

const TITLE_KEYS = [
  "title", "headline", "name", "post_title", "postTitle", "vulnerabilityName",
  "cveID", "cve", "cveId", "subject", "label", "id", "value", "indicator",
  "ioc", "ip", "domain", "hostname", "hash",
];
const LINK_KEYS = [
  "link", "url", "href", "permalink", "html_url", "source_url", "canonical",
  "guid", "@id", "feed_url", "articleUrl",
];
const DATE_KEYS = [
  "date", "pubDate", "published", "published_at", "publishedAt", "datePublished",
  "dateAdded", "discovered", "updated", "updated_at", "modified", "lastModified",
  "created", "created_at", "timestamp", "datetime", "time", "last_seen",
];
const SUMMARY_KEYS = [
  "summary", "description", "descriptions", "shortDescription", "excerpt", "abstract",
  "articleBody", "content:encoded", "encoded", "content", "notes", "text", "body",
];
const WRAPPER_KEYS: Record<string, true> = {
  cve: true, item: true, entry: true, data: true, attributes: true, node: true,
  value: true, post: true, article: true, vulnerability: true, result: true,
  record: true, fields: true,
};
const NESTED_LINK_KEYS = ["href", "url", "@id", "permalink", "link"];

/** Déballe `{cve: {...}}`, `{item: {...}}` et les enveloppes JSON:API équivalentes. */
export function unwrapItem(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length === 1 && WRAPPER_KEYS[keys[0] ?? ""] === true && depth < 3) {
    const inner = unwrapItem(value[keys[0] ?? ""], depth + 1);
    if (inner) return { ...value, ...inner };
  }
  return value;
}

function scalar(value: unknown, keys: string[], depth = 0): string {
  if (depth > 3) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = scalar(entry, keys, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (!isRecord(value)) return "";
  for (const key of keys) {
    if (value[key] !== undefined) {
      const found = scalar(value[key], keys, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

function summaryOf(item: Record<string, unknown>): string {
  for (const key of SUMMARY_KEYS) {
    const value = item[key];
    // NVD : descriptions est un tableau {lang, value} ; on prend l'anglais.
    if ((key === "description" || key === "descriptions") && Array.isArray(value)) {
      const english = value.find((entry) => isRecord(entry) && String(entry.lang ?? "").toLowerCase() === "en")
        ?? value[0];
      const found = scalar(english, ["value", "text"]);
      if (found) return found;
    }
    const found = scalar(value, ["value", "text", "#text"]);
    if (found) return found;
  }
  return "";
}

function linkOf(item: Record<string, unknown>): string {
  for (const key of LINK_KEYS) {
    const value = item[key];
    // Atom : <link rel="self"> est l'URL du flux, pas celle de l'article.
    if (isRecord(value) && /^(?:self|enclosure|related)$/i.test(String(value["@_rel"] ?? ""))) continue;
    if (Array.isArray(value)) {
      const alternate = value.find((entry) => isRecord(entry) && (!entry["@_rel"] || /^alternate$/i.test(String(entry["@_rel"]))));
      const found = scalar(alternate ?? value, NESTED_LINK_KEYS);
      if (found) return found;
    }
    const found = scalar(value, NESTED_LINK_KEYS);
    if (found && !/^self$/i.test(found)) return found;
  }
  return "";
}

export type CanonicalOptions = {
  /** URL de la page : résout les liens relatifs (`/blog/post/…`). */
  baseUrl?: string | null;
  /** Ne pas écraser les champs déjà canoniques (JSON-LD et RSS le sont déjà). */
  respectExisting?: boolean;
};

function resolveLink(link: string, baseUrl?: string | null): string {
  if (!link || !baseUrl) return link;
  try { return new URL(link, baseUrl).href; } catch { return link; }
}

/**
 * Ramène un item brut à quatre champs lisibles, en conservant les autres clés.
 * Retourne `null` quand rien ne ressemble à un article : une entrée sans titre,
 * sans lien et sans résumé est un menu ou un métadonnée, pas un item.
 */
export function canonicalizeItem(value: unknown, opts: CanonicalOptions = {}): CanonicalItem | null {
  const raw = unwrapItem(value);
  if (!raw) return null;
  const existing = (key: string): string => {
    if (!opts.respectExisting) return "";
    const v = raw[key];
    return typeof v === "string" && v.trim() ? v.trim() : "";
  };

  const title = stripHtml(existing("title") || scalar(raw, TITLE_KEYS)).slice(0, 500);
  const rawLink = existing("link") || linkOf(raw);
  const rawSummary = existing("summary") || summaryOf(raw);
  const rawDate = existing("date") || scalar(raw, DATE_KEYS);

  const link = resolveLink(stripHtml(rawLink), opts.baseUrl);
  const summary = stripHtml(rawSummary).slice(0, 4000);
  const date = rawDate ? normalizeDate(stripHtml(rawDate)) : "";
  if (!title && !link && !summary) return null;

  const out: CanonicalItem = { ...raw, title };
  if (date) out.date = date;
  if (link) out.link = link;
  if (summary) out.summary = summary;
  return out;
}

/** Canonicalise une liste, déduplique par lien/titre et ignore les items vides. */
export function canonicalizeItems(values: unknown[], opts: CanonicalOptions = {}): CanonicalItem[] {
  const out: CanonicalItem[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const item = canonicalizeItem(value, opts);
    if (!item) continue;
    const key = `${item.link ?? ""}\u0000${item.title}\u0000${item.date ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    out.push(item);
  }
  return out;
}
