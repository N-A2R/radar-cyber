import type { OfficialStatement } from "./model.js";

/** Tracking parameters are not part of a publication's identity. */
const TRACKING_PARAMS: Readonly<Record<string, true>> = {
  utm_source: true, utm_medium: true, utm_campaign: true, utm_term: true,
  utm_content: true, gclid: true, fbclid: true, msclkid: true,
};

export function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of Object.keys(TRACKING_PARAMS)) url.searchParams.delete(key);
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

export function statementKey(statement: OfficialStatement): string {
  return `${statement.sourceId}|${canonicalUrl(statement.url)}`;
}

/** One publication, even when a feed repeats it or a listing shows it twice. */
export function dedupeStatements(items: OfficialStatement[]): OfficialStatement[] {
  const seen = new Set<string>();
  const out: OfficialStatement[] = [];
  for (const item of items) {
    const key = statementKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
