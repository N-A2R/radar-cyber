import { dedupeStatements } from "./dedupe.js";
import { isNouvelleAquitaine, OFFICIAL_SOURCES, type OfficialStatement } from "./model.js";
import { parseChuListing, parseFeed, parseListing } from "./parse.js";
import { inWindow } from "./window.js";

export type CollectReport = {
  scanned: number;
  admitted: number;
  rejected: { sourceId: string; reason: string }[];
  bySource: Record<string, number>;
  statements: OfficialStatement[];
};

export type FetchText = (url: string) => Promise<string>;

/**
 * Fetch and filter free institutional pages. `fetchText` is injected so the
 * whole pipeline can be tested without network access.
 */
export async function collectStatements(
  fetchText: FetchText,
  now: Date = new Date(),
  days = 7,
): Promise<CollectReport> {
  const admitted: OfficialStatement[] = [];
  const rejected: { sourceId: string; reason: string }[] = [];
  const bySource: Record<string, number> = {};
  let scanned = 0;

  for (const source of OFFICIAL_SOURCES) {
    if (!isNouvelleAquitaine(source)) {
      rejected.push({ sourceId: source.id, reason: "outside-nouvelle-aquitaine" });
      continue;
    }
    let text: string;
    try {
      text = await fetchText(source.url);
    } catch (error) {
      rejected.push({ sourceId: source.id, reason: `fetch-failed: ${error instanceof Error ? error.message : "unknown"}` });
      continue;
    }
    scanned += 1;
    const parsed = source.format === "rss"
      ? parseFeed(text, source)
      : source.parser === "chu"
        ? parseChuListing(text, source)
        : parseListing(text, source);
    const fresh = inWindow(parsed, now, days);
    bySource[source.id] = fresh.length;
    admitted.push(...fresh);
  }

  const statements = dedupeStatements(admitted);
  return {
    scanned,
    admitted: statements.length,
    rejected,
    bySource,
    statements,
  };
}
