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

export function parseRssItems(xml: string, itemsPath?: string): Record<string, unknown>[] {
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
    if (objects.length > 0) return objects;
  }
  for (const path of FEED_PATHS) {
    const node = pickPath(parsed, path);
    const items = Array.isArray(node) ? node : node === undefined || node === null ? [] : [node];
    const objects = toObjectArray(items);
    if (objects.length > 0) return objects;
  }
  // last resort: deep find any array of objects containing title/link
  return findFeedArray(parsed, 0);
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
