import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { likeLiteral } from "../directory/query.js";
const SEARCH_LIMIT = 50;

export default async function (app: FastifyInstance) {
  app.get("/search", async (req) => {
    const q = ((req.query as Record<string, string | undefined>).q ?? "").trim();
    if (q.length < 3) {
      return { orgs: [], events: [], indicators: [] };
    }
    const limitParams = [q, SEARCH_LIMIT];
    // websearch_to_tsquery accepte la saisie libre (tirets, guillemets,
    // ponctuation) sans lever d'erreur de syntaxe, et applique la stemming
    // française. ts_rank_cd favorise les correspondances de nom contiguës.
    const [orgsRes, eventsRes, indicatorsRes] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT o.id, o.name, o.slug, o.kind, o.city, o.dept, o.domain, o.lat, o.lon,
                ts_rank_cd(o.search_tsv, tsq.q) AS relevance
           FROM websearch_to_tsquery('french', french_search_input($1)) AS tsq(q), org o
          WHERE o.search_tsv @@ tsq.q
          ORDER BY
            CASE WHEN french_search_input(o.name) = french_search_input($1) THEN 1 ELSE 0 END DESC,
            relevance DESC, o.id
          LIMIT $2`,
        limitParams
      ),
      query<Record<string, unknown>>(
        `SELECT e.id, e.dedup_key, e.family, e.assertion_type, e.title, e.summary,
                e.observed_at, e.severity, e.confidence, e.source_id, e.source_url,
                e.evidence, e.geo_type, e.lat, e.lon, e.org_id,
                ts_rank_cd(e.search_tsv, tsq.q) AS relevance
           FROM websearch_to_tsquery('french', french_search_input($1)) AS tsq(q), event e
          WHERE e.search_tsv @@ tsq.q
          ORDER BY relevance DESC, e.id
          LIMIT $2`,
        limitParams
      ),
      query<Record<string, unknown>>(
        "SELECT id, type, value, first_seen, last_seen, tlp, confidence, source_id FROM indicator WHERE value ILIKE $1 LIMIT $2",
        [`%${likeLiteral(q)}%`, SEARCH_LIMIT]
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