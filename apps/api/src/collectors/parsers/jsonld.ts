/**
 * JSON-LD (schema.org) : les pages d'actualité embarquent souvent un objet
 * `NewsArticle` dans `<script type="application/ld+json">`, parfois noyé dans
 * un `@graph` avec un `WebSite`, un `Organization` et un fil d'Ariane. Le
 * parseur JSON générique prenait le premier tableau venu (métadonnées de site)
 * et le parseur HTML ramenait les menus : on ne garde ici que les nœuds qui
 * décrivent réellement un article, avec ses champs canoniques.
 */
import { isObject } from "./xml.js";
import { normalizeDate } from "./canonical.js";

type JsonRecord = Record<string, unknown>;

const ARTICLE_TYPES: Record<string, true> = {
  article: true, newsarticle: true, blogposting: true, techarticle: true,
  reportagenewsarticle: true, liveblogposting: true, scholarlyarticle: true,
  medicalscholarlyarticle: true, socialmediaposting: true,
};

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const LD_TYPE_RE = /type\s*=\s*["']application\/ld\+json["']/i;
const HTML_TAG_RE = /<[^>]*>/g;
const ENTITY_RE = /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g;
const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ucirc: "û", hellip: "…",
};

function clean(value: string): string {
  const decoded = value.replace(ENTITY_RE, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith("#")) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
  return decoded.replace(HTML_TAG_RE, " ").replace(/\s+/g, " ").trim();
}

function typeNames(value: unknown): string[] {
  if (typeof value === "string") return [value.split("/").pop()!.toLowerCase()];
  if (Array.isArray(value)) return value.flatMap(typeNames);
  return [];
}

function stringField(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (isObject(value)) {
      const nested = stringField(value, ["@id", "url", "name", "headline"]);
      if (nested) return nested;
    }
  }
  return "";
}

/** Articles trouvés dans un JSON-LD, y compris dans un `@graph` imbriqué. */
function articleNodes(value: unknown, out: JsonRecord[] = [], depth = 0): JsonRecord[] {
  if (depth > 8 || out.length >= 500) return out;
  if (Array.isArray(value)) {
    for (const entry of value) articleNodes(entry, out, depth + 1);
    return out;
  }
  if (!isObject(value)) return out;
  if (typeNames(value["@type"]).some((type) => ARTICLE_TYPES[type] === true)) out.push(value);
  for (const key of ["@graph", "itemListElement", "item", "mainEntity", "hasPart"]) {
    if (value[key] !== undefined) articleNodes(value[key], out, depth + 1);
  }
  return out;
}

function toItem(node: JsonRecord): JsonRecord | null {
  const title = clean(stringField(node, ["headline", "name", "title"])).slice(0, 400);
  if (title.length < 8) return null;
  const summary = clean(stringField(node, ["description", "abstract", "articleBody", "summary"])).slice(0, 2000);
  const rawLink = stringField(node, ["url", "@id", "mainEntityOfPage"]);
  const link = rawLink.split("#")[0] ?? rawLink;
  const date = normalizeDate(stringField(node, ["datePublished", "dateCreated", "dateModified", "uploadDate"]));
  return { title, ...(summary ? { summary } : {}), ...(link ? { link } : {}), ...(date ? { date } : {}) };
}

export type JsonLdParse = { items: JsonRecord[]; errors: string[] };

/**
 * Extrait les articles JSON-LD d'un corps HTML ou d'un document JSON-LD pur.
 * `null` si aucun bloc JSON-LD n'est présent : les métadonnées de site seules
 * ne sont pas des événements et ne doivent pas masquer une autre stratégie.
 */
export function parseJsonLdDetailed(body: string): JsonLdParse | null {
  const raws: string[] = [];
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) raws.push(trimmed);
  for (const script of body.matchAll(SCRIPT_RE)) {
    if (!LD_TYPE_RE.test(script[1] ?? "")) continue;
    const raw = (script[2] ?? "").trim();
    if (raw) raws.push(raw);
  }
  if (raws.length === 0 || !/application\/ld\+json|[\"']@context[\"']/.test(body)) return null;

  const errors: string[] = [];
  const items: JsonRecord[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    let data: unknown;
    try { data = JSON.parse(raw); } catch (e) {
      errors.push(`json-ld-invalide: ${(e as Error).message.slice(0, 120)}`);
      continue;
    }
    for (const node of articleNodes(data)) {
      const item = toItem(node);
      if (!item) continue;
      const key = String(item.link || item.title).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  }
  if (items.length === 0) errors.push("json-ld-sans-article");
  return { items, errors };
}

/** Compatibilité : la liste d'articles, ou `null` si aucun n'est exploitable. */
export function parseJsonLd(body: string): JsonRecord[] | null {
  const parsed = parseJsonLdDetailed(body);
  return parsed && parsed.items.length > 0 ? parsed.items : null;
}
