/**
 * Pages HTML dont le contenu est dans `<article>` ou `<main>`.
 *
 * Le parseur générique ne voyait que des `<a href>` : menus, pieds de page et
 * articles connexes devenaient des items. On isole ici les blocs porteurs
 * d'un titre et d'un résumé (article complet) ou d'un titre, d'un lien et
 * d'une date (carte de listing dans un `<main>`). Les encarts commentaires,
 * sidebars et promotions sont écartés. Rien n'est inventé pour une page sans
 * contenu : `null` est renvoyé, et html-links reprend la main.
 */
import { normalizeDate, stripHtml } from "./canonical.js";

type ArticleItem = Record<string, unknown>;
type PageMeta = { title: string; link: string; date: string };
type Block = { attrs: string; html: string };

const ARTICLE_RE = /<(\/?)article\b([^>]*)>/gi;
const MAIN_RE = /<(\/?)main\b([^>]*)>/gi;
const HEADING_RE = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/i;
const SECTION_HEADING_RE = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1\s*>/gi;
const PARAGRAPH_RE = /<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi;
const TIME_RE = /<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i;
const LINK_RE = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a\s*>/i;
const GENERIC_HEADING_RE = /^(?:avis|article|actualit[eé]s?|news|blog|communiqu[eé]|publication|post|search all|explore|what's new)(?:\s+(?:du|de|des|the)\s+.+)?$/i;
const EXCLUDED_BLOCK_RE = /comment|sidebar|related|promo|latest|widget|recommend|footer|navigation|nav-/i;
const MONTH_DATE_RE = /\b(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i;
const MAX_ARTICLES = 50;
/** Blocs d'une balise donnée, avec leur texte brut (balises incluses). */
function blocksOf(body: string, re: RegExp): Block[] {
  const blocks: Block[] = [];
  let depth = 0;
  let start = -1;
  let attrs = "";
  for (const match of body.matchAll(re)) {
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
    if (!date && /\b(?:property|name|itemprop)\s*=\s*["'](?:article:published_time|datePublished|date|parsely-pub-date)["']/i.test(attrs)) date = content;
  }
  if (!date) {
    date = /<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["'][^>]*>/i.exec(body)?.[1]
      ?? /["']datePublished["']\s*:\s*["']([^"']+)["']/i.exec(body)?.[1]
      ?? "";
  }
  if (!date) {
    // Les avis CERT n'ont ni meta ni <time> : la date visible fait foi.
    const visible = MONTH_DATE_RE.exec(stripHtml(body));
    if (visible) date = normalizeDate(visible[0]);
  }
  if (!title) {
    const pageTitle = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(body)?.[1] ?? "";
    title = stripHtml(pageTitle).split(/\s+[-–|]\s+/)[0] ?? "";
  }
  return { title: stripHtml(title), link: stripHtml(link), date: stripHtml(date) };
}

function headingOf(html: string): string {
  const heading = HEADING_RE.exec(html);
  return heading ? stripHtml(heading[2]) : "";
}

function linkIn(html: string, baseUrl?: string | null): string {
  const link = LINK_RE.exec(html);
  if (!link) return "";
  const href = stripHtml(link[1]);
  if (!href || href.startsWith("#") || /^(?:javascript|mailto|tel):/i.test(href)) return "";
  if (/#(?:comments|respond|reply|more|related)$/i.test(href)) return "";
  try { return baseUrl ? new URL(href, baseUrl).href : href; } catch { return href; }
}

function paragraphSummary(html: string, minimum = 80): string {
  for (const paragraph of html.matchAll(PARAGRAPH_RE)) {
    const candidate = stripHtml(paragraph[1]);
    if (candidate.length >= minimum) return candidate.slice(0, 2000);
  }
  return "";
}

function dateIn(html: string, meta: PageMeta): string {
  const found = TIME_RE.exec(html)?.[1] ?? meta.date;
  return found ? normalizeDate(stripHtml(found)) : "";
}

function result(title: string, summary: string, date: string, link: string): ArticleItem {
  const item: ArticleItem = { title: title.slice(0, 400) };
  if (summary) item.summary = summary;
  if (date) item.date = date;
  if (link) item.link = link;
  return item;
}

/** Article complet : titre + paragraphe substantiel, comme historiquement. */
function fullArticle(block: Block, meta: PageMeta, baseUrl?: string | null, fallbackLink = ""): ArticleItem | null {
  if (EXCLUDED_BLOCK_RE.test(block.attrs)) return null;
  const text = stripHtml(block.html);
  if (text.length < 200) return null;
  const insideTitle = headingOf(block.html);
  const title = insideTitle && !GENERIC_HEADING_RE.test(insideTitle) ? insideTitle : meta.title || insideTitle;
  if (title.length < 10) return null;
  const summary = paragraphSummary(block.html);
  if (!summary) return null;
  return result(title, summary, dateIn(block.html, meta), fallbackLink || meta.link || linkIn(block.html, baseUrl));
}

/** Carte de listing (`<article class="teaser">`) dans un `<main>` : pas de paragraphe long. */
function teaserCard(block: Block, meta: PageMeta, baseUrl?: string | null): ArticleItem | null {
  if (EXCLUDED_BLOCK_RE.test(block.attrs)) return null;
  const title = headingOf(block.html);
  if (title.length < 10 || GENERIC_HEADING_RE.test(title)) return null;
  const link = linkIn(block.html, baseUrl);
  const date = dateIn(block.html, meta);
  if (!link || (!date && stripHtml(block.html).length < 120)) return null;
  const summary = paragraphSummary(block.html, 40) || stripHtml(block.html).slice(0, 500);
  return result(title, summary, date, link);
}

/** Blocs `<main>` sans `<article>` : une entrée par sous-titre porteur de lien/date. */
function mainSections(main: Block, meta: PageMeta, baseUrl?: string | null): ArticleItem[] {
  if (EXCLUDED_BLOCK_RE.test(main.attrs)) return [];
  const headings = [...main.html.matchAll(SECTION_HEADING_RE)];
  const items: ArticleItem[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const title = stripHtml(heading[3] ?? "");
    if (title.length < 10 || GENERIC_HEADING_RE.test(title)) continue;
    const next = headings[i + 1]?.index ?? main.html.length;
    const slice = main.html.slice(heading.index ?? 0, Math.min(next, (heading.index ?? 0) + 2000));
    const link = linkIn(slice, baseUrl);
    const date = dateIn(slice, meta);
    const text = stripHtml(slice);
    if (!link || text.length < 40) continue;
    items.push(result(title, paragraphSummary(slice, 40) || text.slice(0, 500), date, link));
    if (items.length >= MAX_ARTICLES) break;
  }
  return items;
}

/**
 * Items d'articles d'une page HTML : `<article>` complets, cartes de listing,
 * puis sections d'un `<main>`. `null` si aucun bloc ne porte un titre et une
 * preuve de contenu : les menus restent à la charge de html-links.
 */
export function parseHtmlArticles(body: string, baseUrl?: string | null): ArticleItem[] | null {
  if (!/<(?:article|main)\b/i.test(body)) return null;
  const meta = pageMeta(body);
  const items: ArticleItem[] = [];
  const seen = new Set<string>();

  const push = (item: ArticleItem | null): void => {
    if (!item) return;
    const key = String(item.link || item.title).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  const articleBlocks = blocksOf(body, ARTICLE_RE);
  for (const block of articleBlocks) {
    if (items.length >= MAX_ARTICLES) break;
    const fallbackLink = articleBlocks.length === 1 ? (baseUrl ?? "") : "";
    push(fullArticle(block, meta, baseUrl, fallbackLink) ?? teaserCard(block, meta, baseUrl));
  }
  if (items.length === 0) {
    for (const main of blocksOf(body, MAIN_RE)) {
      if (items.length >= MAX_ARTICLES) break;
      for (const item of mainSections(main, meta, baseUrl)) push(item);
    }
  }
  return items.length > 0 ? items : null;
}
