/**
 * Flux JSON "maison" : tableau racine, objet à tableau nommé, enveloppe
 * `{data: {items: [...]}}`, JSON:API ou clé déclarée par la source. Les items
 * sont ramenés aux quatre champs canoniques (titre, date, lien, résumé) tout
 * en gardant leurs champs d'origine pour le moteur d'indicateurs.
 */
import { canonicalizeItems, type CanonicalItem } from "./canonical.js";
import { isRecord } from "./guards.js";

const MAX_DEPTH = 5;

const KNOWN_FEED_KEYS: Record<string, true> = {
  items: true, data: true, results: true, entries: true, articles: true,
  posts: true, events: true, news: true, releases: true,
};

export function pickPath(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split(".")) {
    if (!isRecord(node)) return undefined;
    node = node[key];
  }
  return node;
}

export function findObjectArray(node: unknown, depth = 0): Record<string, unknown>[] | null {
  if (depth > MAX_DEPTH) return [];
  if (Array.isArray(node)) {
    const objs = node.filter(isRecord);
    if (objs.length > 0) return objs;
    const founds: Record<string, unknown>[][] = [];
    let ambiguous = false;
    for (const v of node) {
      const r = findObjectArray(v, depth + 1);
      if (r === null) { ambiguous = true; continue; }
      if (r.length) founds.push(r);
    }
    if (ambiguous && founds.length === 0) return null;
    if (founds.length > 1) return null;
    return founds[0] ?? [];
  }
  if (isRecord(node)) {
    const present = Object.keys(node).filter((k) => KNOWN_FEED_KEYS[k] === true);
    const knownResults: Record<string, unknown>[][] = [];
    let ambiguous = false;
    for (const k of present) {
      const r = findObjectArray(node[k], depth + 1);
      if (r === null) { ambiguous = true; continue; }
      if (r.length) knownResults.push(r);
    }
    if (knownResults.length === 1) return knownResults[0];
    if (knownResults.length > 1) return null;
    if (ambiguous && present.length > 0) return null;
    const valResults: Record<string, unknown>[][] = [];
    for (const v of Object.values(node)) {
      const r = findObjectArray(v, depth + 1);
      if (r === null) { ambiguous = true; continue; }
      if (r.length) valResults.push(r);
    }
    if (valResults.length === 1) return valResults[0];
    if (valResults.length > 1) return null;
    if (ambiguous) return null;
    return [];
  }
  return [];
}

export function parseJsonItems(body: string, itemsPath?: string): Record<string, unknown>[] {
  let data: unknown;
  try { data = JSON.parse(body); } catch { return []; }
  if (itemsPath) {
    const node = pickPath(data, itemsPath);
    if (Array.isArray(node)) return node.filter(isRecord);
    if (isRecord(node)) return [node];
  }
  if (Array.isArray(data)) return data.filter(isRecord);
  return findObjectArray(data, 0) ?? [];
}

export type JsonFeedParse = {
  items: CanonicalItem[];
  path: string;
  strategy: "json-root-array" | "json-nested-array";
  errors: string[];
};

type ArrayCandidate = { values: unknown[]; path: string; score: number };

/** Meilleur tableau d'objets, avec son chemin ; les clés de flux connues priment. */
function bestArray(node: unknown, depth: number, path: string[]): ArrayCandidate | null {
  if (depth > MAX_DEPTH) return null;
  if (Array.isArray(node)) {
    const objects = node.filter(isRecord);
    if (objects.length === 0) return null;
    return { values: objects, path: path.join("."), score: objects.length };
  }
  if (!isRecord(node)) return null;
  const entries = Object.entries(node);
  const known = entries.filter(([key]) => KNOWN_FEED_KEYS[key] === true);
  const ordered = known.length > 0 ? known : entries;
  let best: ArrayCandidate | null = null;
  for (const [key, value] of ordered) {
    const found = bestArray(value, depth + 1, [...path, key]);
    if (found && (!best || found.score > best.score)) best = found;
  }
  return best;
}

/**
 * Détecte et canonise un flux JSON. Retourne `null` si le corps n'est pas du
 * JSON ; sinon `items` peut être vide et `errors` porte le motif exact.
 */
export function parseJsonFeed(
  body: string,
  opts: { itemsPath?: string | null; baseUrl?: string | null } = {},
): JsonFeedParse | null {
  const text = body.trim();
  if (!text.startsWith("{") && !text.startsWith("[")) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return {
      items: [], path: "", strategy: "json-root-array",
      errors: [`json-invalide: ${(e as Error).message.slice(0, 160)}`],
    };
  }

  const canonicalOpts = { baseUrl: opts.baseUrl };
  if (opts.itemsPath) {
    const node = pickPath(data, opts.itemsPath);
    const raw = Array.isArray(node) ? node : isRecord(node) ? [node] : [];
    const items = canonicalizeItems(raw, canonicalOpts);
    return {
      items, path: opts.itemsPath, strategy: "json-nested-array",
      errors: items.length === 0 ? ["chemin-sterile"] : [],
    };
  }

  if (Array.isArray(data)) {
    const items = canonicalizeItems(data, canonicalOpts);
    return {
      items, path: "", strategy: "json-root-array",
      errors: items.length === 0 ? ["tableau-sans-item"] : [],
    };
  }

  const found = bestArray(data, 0, []);
  if (!found) return { items: [], path: "", strategy: "json-nested-array", errors: ["aucun-tableau"] };
  const items = canonicalizeItems(found.values, canonicalOpts);
  return {
    items, path: found.path, strategy: "json-nested-array",
    errors: items.length === 0 ? ["tableau-sans-item"] : [],
  };
}

function sameOrigin(a: string, b: string): boolean {
  try { return new URL(a).origin === new URL(b).origin; } catch { return false; }
}

export async function fetchJsonWithPagination(
  initialUrl: string,
  initialBody: string,
  fetchText: (url: string) => Promise<string>,
  maxPages = 5,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const seenUrls = new Set<string>([initialUrl]);
  let url = initialUrl;
  let body = initialBody;
  for (let page = 0; page < maxPages; page++) {
    let data: unknown;
    try { data = JSON.parse(body); } catch { break; }
    const found = Array.isArray(data) ? data.filter(isRecord) : (findObjectArray(data, 0) ?? []);
    const items = found;
    // try itemsPath-like common fields on root
    if (items.length === 0 && isRecord(data)) {
      for (const k of ["items", "data", "results", "entries", "articles", "vulnerabilities"]) {
        const v = data[k];
        if (Array.isArray(v)) { for (const o of v) if (isRecord(o)) out.push(o); break; }
      }
    } else {
      out.push(...items);
    }
    if (!isRecord(data)) break;
    const next = [data.next, data.next_url, data.nextUrl, isRecord(data.pagination) ? data.pagination.next : null, isRecord(data.links) ? data.links.next : null]
      .find((v): v is string => typeof v === "string" && /^https?:\/\//.test(v));
    if (!next || seenUrls.has(next) || !sameOrigin(initialUrl, next)) break;
    seenUrls.add(next);
    url = next;
    try { body = await fetchText(url); } catch { break; }
  }
  // dedupe by JSON string of identifying fields
  const seen = new Set<string>();
  const deduped: Record<string, unknown>[] = [];
  for (const item of out) {
    const key = String(item.id ?? item.url ?? item.link ?? item.guid ?? item.title ?? item.name ?? JSON.stringify(item).slice(0, 120));
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}
