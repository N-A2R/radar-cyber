/**
 * Pages HTML dont le contenu est dans `<article>` : le parseur générique ne
 * voyait que des `<a href>` (menus, pied de page, articles connexes) et
 * produisait 40 à 90 faux items par page. On isole les blocs article, on
 * écarte les commentaires/encarts, puis on lit titre, date, résumé et URL
 * canonique. Aucun item n'est inventé pour une page sans article.
 */

type ArticleItem = Record<string, unknown>;

type PageMeta = { title: string; link: string; date: string };

const ARTICLE_RE = /<(\/?)article\b([^>]*)>/gi;
const HEADING_RE = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/i;
const PARAGRAPH_RE = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
const TIME_RE = /<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i;
const GENERIC_HEADING_RE = /^(?:avis|article|actualit[eé]s?|news|blog|communiqu[eé]|publication|post)(?:\s+(?:du|de|des|the)\s+.+)?$/i;
const EXCLUDED_BLOCK_RE = /comment|sidebar|related|promo|latest|widget|recommend|footer|navigation|nav-/i;
const ENTITY_RE = /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g;
const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", hellip: "…", rsquo: "\u2019",
};
const MAX_ARTICLES = 50;

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
  return decoded.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Blocs `<article>` de premier niveau, avec leur texte brut (balises incluses). */
function articleBlocks(body: string): { attrs: string; html: string }[] {
  const blocks: { attrs: string; html: string }[] = [];
  let depth = 0;
  let start = -1;
  let attrs = "";
  for (const match of body.matchAll(ARTICLE_RE)) {
    if (match[1] === "/") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        blocks.push({ attrs, html: body.slice(start, match.index) });
        start = -1;
      }
      continue;
    }
    if (depth === 0) {
      start = match.index + match[0].length;
      attrs = match[2] ?? "";
    }
    depth += 1;
  }
  return blocks;
}

function pageMeta(body: string): PageMeta {
  let title = "";
  let link = "";
  let date = "";
  for (const match of body.matchAll(/<(meta|link)\b([^>]*)>/gi)) {
    const attrs = match[2] ?? "";
    const content = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "";
    if (!title && /\b(?:name|property)\s*=\s*["'](?:og:title|twitter:title)["']/i.test(attrs)) title = content;
    if (!link && (/\brel\s*=\s*["']canonical["']/i.test(attrs) || /\bproperty\s*=\s*["']og:url["']/i.test(attrs))) link = href || content;
    if (!date && /\bproperty\s*=\s*["']article:published_time["']/i.test(attrs)) date = content;
  }
  if (!title) {
    const pageTitle = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(body)?.[1] ?? "";
    title = clean(pageTitle).split(/\s+[-–|]\s+/)[0] ?? "";
  }
  return { title, link, date };
}
function toItem(block: { attrs: string; html: string }, meta: PageMeta): ArticleItem | null {
  if (EXCLUDED_BLOCK_RE.test(block.attrs)) return null;
  const text = clean(block.html);
  if (text.length < 200) return null;

  const heading = HEADING_RE.exec(block.html);
  const insideTitle = heading ? clean(heading[2]) : "";
  const title = insideTitle && !GENERIC_HEADING_RE.test(insideTitle) ? insideTitle : meta.title || insideTitle;
  if (title.length < 10) return null;

  let summary = "";
  for (const paragraph of block.html.matchAll(PARAGRAPH_RE)) {
    const candidate = clean(paragraph[1]);
    if (candidate.length >= 80) {
      summary = candidate.slice(0, 2000);
      break;
    }
  }
  if (!summary) return null;

  const date = TIME_RE.exec(block.html)?.[1] ?? meta.date;
  return {
    title: title.slice(0, 400),
    summary,
    ...(meta.link ? { link: meta.link } : {}),
    ...(date ? { date: clean(date) } : {}),
  };
}

/**
 * Items d'articles d'une page HTML. `null` si aucun bloc ne porte un titre et
 * un résumé substantiels : les menus restent alors à la charge de html-links.
 */
export function parseHtmlArticles(body: string): ArticleItem[] | null {
  if (!/<article\b/i.test(body)) return null;
  const meta = pageMeta(body);
  const items: ArticleItem[] = [];
  const seen = new Set<string>();
  for (const block of articleBlocks(body)) {
    if (items.length >= MAX_ARTICLES) break;
    const item = toItem(block, meta);
    if (!item) continue;
    const key = String(item.link || item.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items.length > 0 ? items : null;
}
