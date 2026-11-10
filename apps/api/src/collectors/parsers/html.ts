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
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return named[entity.toLowerCase()] ?? match;
  });
}

export function parseHtmlLinks(body: string, baseUrl?: string): Record<string, unknown>[] {
  const linkRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const items: Record<string, unknown>[] = [];
  let base: URL | null = null;
  try { if (baseUrl) base = new URL(baseUrl); } catch { base = null; }
  for (const match of body.matchAll(linkRe)) {
    let href = match[1].trim();
    if (!href || href.startsWith("#") || /^javascript:/i.test(href) || /^mailto:/i.test(href)) continue;
    if (base) { try { href = new URL(href, base).href; } catch { continue; } }
    if (!/^https?:\/\//i.test(href)) continue;
    const title = decodeEntities(match[2].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
    if (title.length < 15) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    items.push({ title: title.slice(0, 400), link: href });
    if (items.length >= 2000) break;
  }
  return items;
}
