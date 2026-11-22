/**
 * Pure parsers for official Nouvelle-Aquitaine publications.
 *
 * No network, no database: every date and title comes from the fetched document.
 * Nothing here invents a publication date or rewrites a title.
 */
import { XMLParser } from "fast-xml-parser";
import { isOfficialDomain, type OfficialSource, type OfficialStatement } from "./model.js";

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è",
  agrave: "à", ccedilla: "ç", ugrave: "ù", ocirc: "ô", icirc: "î",
  ecirc: "ê", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
};

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (full, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? full);
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

const MONTHS: Readonly<Record<string, number>> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12, decembre: 12,
};

function dateFromParts(year: number, month: number, day: number): Date | null {
  if (year < 2015 || year > new Date().getUTCFullYear() + 1) return null;
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() + 1 !== month || value.getUTCDate() !== day) return null;
  return value;
}

/** Parse only an explicitly written date; never fall back to "today". */
export function parsePublishedDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return dateFromParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (numeric) return dateFromParts(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
  const textual = /^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i.exec(raw.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  if (textual && MONTHS[textual[2]!.toLowerCase()]) {
    return dateFromParts(Number(textual[3]), MONTHS[textual[2]!.toLowerCase()]!, Number(textual[1]));
  }
  const rfc = Date.parse(raw);
  return Number.isFinite(rfc) ? new Date(rfc) : null;
}

/**
 * Personal identifiers about victims are never stored. The check is
 * deliberately conservative: a generic official announcement stays, a title
 * naming or describing a victim is rejected before it reaches the database.
 */
const VICTIM_PATTERNS: readonly RegExp[] = [
  /\bvictimes?\b/i,
  /\bidentit[ée]\b/i,
  /\b(?:homme|femme|adolescent|mineur)e?\s+de\s+\d{1,2}\s+ans\b/i,
  /\bâg[ée]\s+de\s+\d{1,2}\s+ans\b/i,
  /\bdisparu[e]?\b|\bdisparition\b/i,
  /\bcorps\s+sans\s+vie\b/i,
  /\bproches\s+de\s+la\s+famille\b/i,
  /\bcoordonn[ée]es\s+personnelles\b/i,
];

export function containsVictimPersonalData(text: string): boolean {
  return VICTIM_PATTERNS.some((pattern) => pattern.test(text));
}

function cleanTitle(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 240);
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function feedLink(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = feedLink(entry);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const attrs = value as Record<string, unknown>;
    return typeof attrs["@_href"] === "string" ? attrs["@_href"] : null;
  }
  return null;
}

function statement(source: OfficialSource, title: string, url: string, publishedAt: Date): OfficialStatement | null {
  if (title.length < 12 || containsVictimPersonalData(title)) return null;
  if (!isOfficialDomain(url, source)) return null;
  return {
    sourceId: source.id,
    department: source.department,
    departmentLabel: source.departmentLabel,
    officialDomain: source.officialDomain,
    title,
    url,
    publishedAt,
  };
}

/** RSS 2.0 and Atom 1.0 items carrying their own publication date. */
export function parseFeed(xmlText: string, source: OfficialSource): OfficialStatement[] {
  let doc: Record<string, any>;
  try {
    doc = xml.parse(xmlText) as Record<string, any>;
  } catch {
    return [];
  }
  const rssItems = asArray(doc?.rss?.channel?.item);
  const entries = rssItems.length > 0 ? rssItems : asArray(doc?.feed?.entry);
  const out: OfficialStatement[] = [];
  for (const entry of entries) {
    const title = cleanTitle(entry?.title);
    const url = feedLink(entry?.link) ?? feedLink(entry?.guid);
    const publishedAt = parsePublishedDate(entry?.pubDate ?? entry?.published ?? entry?.updated ?? entry?.["dc:date"]);
    if (!url || !publishedAt) continue;
    const candidate = statement(source, title, url, publishedAt);
    if (candidate) out.push(candidate);
  }
  return out;
}

const DATE_PATTERN = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[a-zûéèêàç]+\s+\d{4})/gi;

function nearestDate(before: string, after: string): Date | null {
  let best: { date: Date; distance: number } | null = null;
  for (const match of before.matchAll(DATE_PATTERN)) {
    const date = parsePublishedDate(match[1]);
    if (!date) continue;
    const distance = before.length - ((match.index ?? 0) + match[0].length);
    if (!best || distance < best.distance) best = { date, distance };
  }
  for (const match of after.matchAll(DATE_PATTERN)) {
    const date = parsePublishedDate(match[1]);
    if (!date) continue;
    const distance = match.index ?? 0;
    if (!best || distance < best.distance) best = { date, distance };
  }
  return best?.date ?? null;
}

/**
 * Dated links in an institutional listing page. The date is taken from the
 * document near the anchor, in either direction; no date means no statement.
 */
export function parseListing(htmlText: string, source: OfficialSource): OfficialStatement[] {
  const out: OfficialStatement[] = [];
  const anchors = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchors.exec(htmlText)) !== null) {
    let url: string;
    try {
      url = new URL(decodeHtml(match[1]!), source.url).toString();
    } catch {
      continue;
    }
    const title = cleanTitle(match[2]);
    if (title.length < 12) continue;
    const before = htmlText.slice(Math.max(0, match.index - 1800), match.index);
    const after = htmlText.slice(match.index, Math.min(htmlText.length, match.index + match[0].length + 1800));
    const publishedAt = nearestDate(before, after);
    if (!publishedAt) continue;
    const candidate = statement(source, title, url, publishedAt);
    if (candidate) out.push(candidate);
  }
  return out;
}
