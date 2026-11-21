import { XMLParser } from "fast-xml-parser";

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toObjectArray(value: unknown[]): Record<string, unknown>[] {
  return value.filter(isObject);
}

function pickPath(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split(".")) {
    if (!isObject(node) && !Array.isArray(node)) return undefined;
    if (Array.isArray(node)) { node = node[0]; }
    if (!isObject(node)) return undefined;
    node = node[key];
  }
  return node;
}

const FEED_PATHS = [
  "rss.channel.item",
  "channel.item",
  "feed.entry",
  "rdf:RDF.item",
  "RDF.item",
  "RDF.channel.item",
];

export type FeedKind = "rss-2" | "atom" | "rss-atom";

/** Type de flux d'après l'élément racine, avant toute lecture des items. */
export function detectFeedKind(xml: string): FeedKind | null {
  const head = xml.slice(0, 20000);
  if (/<(?:[\w.-]+:)?feed\b/i.test(head)) return "atom";
  if (/<(?:[\w.-]+:)?rss\b/i.test(head)) return "rss-2";
  if (/<(?:[\w.-]+:)?rdf\b/i.test(head)) return "rss-atom";
  return null;
}

/** Valeur textuelle d'un nœud fast-xml-parser (texte, `#text` ou attribut). */
function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = textOf(entry);
      if (text) return text;
    }
    return "";
  }
  if (!isObject(value)) return "";
  for (const key of ["#text", "@_href", "@_url", "url", "name"]) {
    const text = textOf(value[key]);
    if (text) return text;
  }
  return "";
}

/** Lien d'un `<link>` Atom, qui porte son href en attribut et par option. */
function linkOf(value: unknown): string {
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (isObject(entry) && entry["@_rel"] && !/^(?:alternate|self)$/i.test(String(entry["@_rel"]))) continue;
      const link = linkOf(entry);
      if (link) return link;
    }
    return "";
  }
  if (!isObject(value)) return textOf(value);
  return textOf(value["@_href"] ?? value["@_url"] ?? value["#text"]);
}

/** Ramène les champs namespaceés (`dc:date`, `content:encoded`, `updated`…) aux champs du collecteur. */
export function canonicalizeFeedItem(item: Record<string, unknown>, kind: FeedKind): Record<string, unknown> {
  const out: Record<string, unknown> = { ...item };
  const ensure = (target: string, keys: string[], read: (value: unknown) => string = textOf): void => {
    if (typeof out[target] === "string" && out[target]) return;
    for (const key of keys) {
      const value = read(item[key]);
      if (value) {
        out[target] = value;
        return;
      }
    }
  };
  ensure("title", ["title", "dc:title", "atom:title", "name"]);
  ensure("link", ["link", "atom:link", "guid", "id"], linkOf);
  ensure("date", kind === "atom" ? ["published", "updated", "dc:date", "pubDate"] : ["pubDate", "dc:date", "published", "updated"]);
  ensure("summary", ["description", "summary", "content:encoded", "content", "encoded"]);
  ensure("author", ["author", "dc:creator", "creator"]);
  if (typeof item["content:encoded"] === "string") out.content = item["content:encoded"];
  return out;
}

/** Détection complète d'un flux : items canoniques, chemin et type explicite. */
export function parseFeedDetection(xml: string): { items: Record<string, unknown>[]; path: string; kind: FeedKind } | null {
  const kind = detectFeedKind(xml) ?? (/<(?:[\w.-]+:)?(?:item|entry)[\s>]/i.test(xml) ? "rss-atom" : null);
  if (!kind) return null;
  let parsed: unknown;
  try {
    parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" }).parse(xml);
  } catch {
    return null;
  }
  const paths = kind === "atom"
    ? ["feed.entry", "atom:feed.entry", "feed.atom:entry", "atom:feed.atom:entry"]
    : kind === "rss-2"
      ? ["rss.channel.item", "channel.item"]
      : FEED_PATHS;
  for (const path of paths) {
    const node = pickPath(parsed, path);
    const items = Array.isArray(node) ? node : node === undefined ? [] : [node];
    const objects = toObjectArray(items);
    if (objects.length > 0) return { items: objects.map((item) => canonicalizeFeedItem(item, kind)), path, kind };
  }
  const deep = findFeedArray(parsed, 0);
  return deep.length > 0 ? { items: deep.map((item) => canonicalizeFeedItem(item, kind)), path: "auto", kind } : null;
}
export function parseRssItems(xml: string, itemsPath?: string): Record<string, unknown>[] {
  const kind = detectFeedKind(xml) ?? "rss-atom";
  let parsed: unknown;
  try {
    parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", trimValues: false }).parse(xml);
  } catch {
    return [];
  }
  if (itemsPath) {
    let node: unknown = parsed;
    for (const key of itemsPath.split(".")) {
      if (node && typeof node === "object") node = (node as Record<string, unknown>)[key];
      else { node = undefined; break; }
    }
    const items = Array.isArray(node) ? node : node ? [node] : [];
    const objects = toObjectArray(items);
    if (objects.length > 0) return objects.map((item) => canonicalizeFeedItem(item, kind));
  }
  for (const path of FEED_PATHS) {
    const node = pickPath(parsed, path);
    const items = Array.isArray(node) ? node : node === undefined || node === null ? [] : [node];
    const objects = toObjectArray(items);
    if (objects.length > 0) return objects.map((item) => canonicalizeFeedItem(item, kind));
  }
  // last resort: deep find any array of objects containing title/link
  return findFeedArray(parsed, 0).map((item) => canonicalizeFeedItem(item, kind));
}

function findFeedArray(node: unknown, depth: number): Record<string, unknown>[] {
  if (depth > 6) return [];
  if (Array.isArray(node)) {
    const objects = toObjectArray(node);
    if (objects.length >= 1) {
      const sample = objects[0];
      if ("title" in sample || "link" in sample || "name" in sample || "id" in sample || "guid" in sample) return objects;
    }
    for (const v of node) {
      const found = findFeedArray(v, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  if (isObject(node)) {
    // prefer common feed container keys
    for (const k of ["item", "entry", "items", "entries"]) {
      if (k in node) {
        const found = findFeedArray(node[k], depth + 1);
        if (found.length) return found;
      }
    }
    for (const v of Object.values(node)) {
      const found = findFeedArray(v, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}
