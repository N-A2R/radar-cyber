function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pickPath(root: unknown, path: string): unknown {
  let node: unknown = root;
  for (const key of path.split(".")) {
    if (!isObject(node)) return undefined;
    node = node[key];
  }
  return node;
}

const MAX_DEPTH = 5;

export function findObjectArray(node: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > MAX_DEPTH) return [];
  if (Array.isArray(node)) {
    const objs = node.filter(isObject);
    if (objs.length > 0) return objs;
    for (const v of node) {
      const found = findObjectArray(v, depth + 1);
      if (found.length) return found;
    }
    return [];
  }
  if (isObject(node)) {
    // prefer known feed keys
    for (const k of ["items", "data", "results", "entries", "articles", "vulnerabilities", "alerts", "records", "feed", "rows"]) {
      if (k in node) {
        const found = findObjectArray(node[k], depth + 1);
        if (found.length) return found;
      }
    }
    for (const v of Object.values(node)) {
      const found = findObjectArray(v, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

export function parseJsonItems(body: string, itemsPath?: string): Record<string, unknown>[] {
  let data: unknown;
  try { data = JSON.parse(body); } catch { return []; }
  if (itemsPath) {
    const node = pickPath(data, itemsPath);
    if (Array.isArray(node)) return node.filter(isObject);
    if (isObject(node)) return [node];
  }
  if (Array.isArray(data)) return data.filter(isObject);
  return findObjectArray(data, 0);
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
    const items = Array.isArray(data) ? data.filter(isObject) : findObjectArray(data, 0);
    // try itemsPath-like common fields on root
    if (items.length === 0 && isObject(data)) {
      for (const k of ["items", "data", "results", "entries", "articles", "vulnerabilities"]) {
        const v = (data as Record<string, unknown>)[k];
        if (Array.isArray(v)) { for (const o of v) if (isObject(o)) out.push(o); break; }
      }
    } else {
      out.push(...items);
    }
    if (!isObject(data)) break;
    const next = [data.next, data.next_url, (data as any).nextUrl, isObject(data.pagination) ? (data.pagination as any).next : null, isObject(data.links) ? (data.links as any).next : null]
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
