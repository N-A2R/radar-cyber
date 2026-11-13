import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { likeLiteral } from "../directory/query.js";
export default async function (app: FastifyInstance) {
  app.get("/search", async (req) => {
    const q = (req.query as Record<string, string | undefined>).q ?? "";
    if (q.trim().length < 3) {
      return { orgs: [], events: [], indicators: [] };
    }
	const like = `%${likeLiteral(q)}%`;
    const [orgsRes, eventsRes, indicatorsRes] = await Promise.all([
      query<Record<string, unknown>>(
        "SELECT id, name, slug, kind, city, dept, domain, lat, lon FROM org WHERE name ILIKE $1 OR domain ILIKE $1 LIMIT 20",
        [like]
      ),
      query<Record<string, unknown>>(
        "SELECT id, dedup_key, family, assertion_type, title, summary, observed_at, severity, confidence, source_id, source_url, evidence, geo_type, lat, lon, org_id FROM event WHERE title ILIKE $1 OR summary ILIKE $1 LIMIT 20",
        [like]
      ),
      query<Record<string, unknown>>(
        "SELECT id, type, value, first_seen, last_seen, tlp, confidence, source_id FROM indicator WHERE value ILIKE $1 LIMIT 20",
        [like]
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