/**
 * Public forum sources watched by the Nouvelle-Aquitaine observatory.
 *
 * Every source below is free, public and needs no account or payment. Gray
 * sources (community discussions, not official publications) are explicitly
 * allowed. Two kinds of scope exist:
 *
 *  - `department`: the public feed itself is a search limited to one NA place,
 *    so every message in it is region-scoped by construction;
 *  - `message`: a global public forum, where a message must name an NA
 *    department or prefecture to enter the observatory.
 */
export type ForumFormat = "rss" | "json";

export type ForumScope =
  | { kind: "department"; value: string }
  | { kind: "message" };

export type ForumSource = {
  id: string;
  name: string;
  url: string;
  format: ForumFormat;
  license: string;
  scope: ForumScope;
};

/** Places used for the NA-scoped public discussion feeds. */
export const NA_SCOPES: readonly string[] = ["bordeaux", "gironde", "poitiers"];

const slug = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Public Hacker News relevance search over stories and comments. */
function hnSearch(place: string): ForumSource {
  const query = encodeURIComponent(`${place} cyber security`);
  return {
    id: `forum:hn:${slug(place)}`,
    name: `Hacker News — ${place} discussion`,
    url: `https://hn.algolia.com/api/v1/search?query=${query}&hitsPerPage=30`,
    format: "json",
    license: "public discussion search API — free, no account",
    scope: { kind: "department", value: place },
  };
}

export const FORUM_SOURCES: readonly ForumSource[] = [
  ...NA_SCOPES.map(hnSearch),
  {
    id: "forum:hn:latest",
    name: "Hacker News — latest discussion",
    url: "https://news.ycombinator.com/rss",
    format: "rss",
    license: "public RSS — free, no account",
    scope: { kind: "message" },
  },
  {
    id: "forum:letsencrypt:community",
    name: "Let's Encrypt community — latest discussion",
    url: "https://community.letsencrypt.org/latest.rss",
    format: "rss",
    license: "public Discourse RSS — free, no account",
    scope: { kind: "message" },
  },
  {
    id: "forum:httparchive:discuss",
    name: "HTTP Archive discuss — latest discussion",
    url: "https://discuss.httparchive.org/latest.rss",
    format: "rss",
    license: "public Discourse RSS — free, no account",
    scope: { kind: "message" },
  },
];

export function forumSourceById(id: string): ForumSource | undefined {
  return FORUM_SOURCES.find((source) => source.id === id);
}

/** No paid service may enter the registry: URL and license are checked. */
export function isPublicFreeForum(source: ForumSource): boolean {
  return /^https:\/\//.test(source.url)
    && !/(paywall|subscribe|premium|apikey|api-key)/i.test(`${source.url} ${source.license}`);
}
