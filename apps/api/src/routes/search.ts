import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { likeLiteral } from "../directory/query.js";
import { normalizeSearchText, searchTokens } from "../search/tokens.js";

const SEARCH_LIMIT = 50;
/**
 * Per-token candidate cap. A common token such as "saint" matches tens of
 * thousands of rows on the full corpus; the cap keeps the heap visits bounded
 * while still letting multi-token matches outrank single-token ones.
 */
const CANDIDATES_PER_TOKEN = 300;

const ORG_SQL = `
  WITH candidates AS (
    SELECT o.id, o.name, o.slug, o.kind, o.city, o.dept, o.domain, o.lat, o.lon, o.name_norm
    FROM unnest($1::text[]) AS t(tok)
    CROSS JOIN LATERAL (
      SELECT x.id, x.name, x.slug, x.kind, x.city, x.dept, x.domain, x.lat, x.lon, x.name_norm
      FROM org x
      WHERE x.name_norm LIKE '%' || t.tok || '%' OR x.domain ILIKE '%' || t.tok || '%'
      LIMIT $2
    ) AS o
  )
  SELECT c.id, c.name, c.slug, c.kind, c.city, c.dept, c.domain, c.lat, c.lon,
         count(*)::int AS score
  FROM candidates c
  GROUP BY c.id, c.name, c.slug, c.kind, c.city, c.dept, c.domain, c.lat, c.lon, c.name_norm
  ORDER BY score DESC, (c.name_norm = $3) DESC, c.id
  LIMIT $4`;

const EVENT_SQL = `
  WITH candidates AS (
    SELECT e.id, e.dedup_key, e.family, e.assertion_type, e.title, e.summary,
           e.observed_at, e.severity, e.confidence, e.source_id, e.source_url,
           e.evidence, e.geo_type, e.lat, e.lon, e.org_id
    FROM unnest($1::text[]) AS t(tok)
    CROSS JOIN LATERAL (
      SELECT x.id, x.dedup_key, x.family, x.assertion_type, x.title, x.summary,
             x.observed_at, x.severity, x.confidence, x.source_id, x.source_url,
             x.evidence, x.geo_type, x.lat, x.lon, x.org_id
      FROM event x
      WHERE x.title_search LIKE '%' || t.tok || '%'
         OR x.summary_search LIKE '%' || t.tok || '%'
      LIMIT $2
    ) AS e
  )
  SELECT c.id, c.dedup_key, c.family, c.assertion_type, c.title, c.summary,
         c.observed_at, c.severity, c.confidence, c.source_id, c.source_url,
         c.evidence, c.geo_type, c.lat, c.lon, c.org_id, count(*)::int AS score
  FROM candidates c
  GROUP BY c.id, c.dedup_key, c.family, c.assertion_type, c.title, c.summary,
           c.observed_at, c.severity, c.confidence, c.source_id, c.source_url,
           c.evidence, c.geo_type, c.lat, c.lon, c.org_id
  ORDER BY score DESC, c.id
  LIMIT $3`;

export default async function (app: FastifyInstance) {
  app.get("/search", async (req) => {
    const q = ((req.query as Record<string, string | undefined>).q ?? "").trim();
    if (q.length < 3) {
      return { orgs: [], events: [], indicators: [] };
    }
    const normalized = normalizeSearchText(q);
    const tokens = searchTokens(q);
    const [orgsRes, eventsRes, indicatorsRes] = await Promise.all([
      query<Record<string, unknown>>(ORG_SQL, [tokens, CANDIDATES_PER_TOKEN, normalized, SEARCH_LIMIT]),
      query<Record<string, unknown>>(EVENT_SQL, [tokens, CANDIDATES_PER_TOKEN, SEARCH_LIMIT]),
      query<Record<string, unknown>>(
        `SELECT id, type, value, first_seen, last_seen, tlp, confidence, source_id
           FROM indicator
          WHERE value ILIKE '%' || $1 || '%'
          ORDER BY value
          LIMIT $2`,
        [likeLiteral(normalized), SEARCH_LIMIT]
      ),
    ]);
    return {
      orgs: orgsRes.rows.map((r: Record<string, unknown>) => ({
        id: r.id, name: r.name, slug: r.slug, kind: r.kind, city: r.city, dept: r.dept, domain: r.domain, lat: r.lat, lon: r.lon,
      })),
      events: eventsRes.rows.map((r: Record<string, unknown>) => ({
        id: r.id, dedupKey: r.dedup_key, family: r.family, assertionType: r.assertion_type, title: r.title, summary: r.summary,
        observedAt: r.observed_at, severity: r.severity, confidence: r.confidence, sourceId: r.source_id, sourceUrl: r.source_url,
        evidence: r.evidence, geoType: r.geo_type, lat: r.lat, lon: r.lon, orgId: r.org_id,
      })),
      indicators: indicatorsRes.rows.map((r: Record<string, unknown>) => ({
        id: r.id, type: r.type, value: r.value, firstSeen: r.first_seen, lastSeen: r.last_seen, tlp: r.tlp, confidence: r.confidence, sourceId: r.source_id,
      })),
    };
  });
}
