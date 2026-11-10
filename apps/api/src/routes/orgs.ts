import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

function mapEvent(row: any) {
  return {
    id: row.id,
    dedupKey: row.dedup_key,
    family: row.family,
    assertionType: row.assertion_type,
    title: row.title,
    summary: row.summary,
    observedAt: row.observed_at,
    severity: row.severity,
    confidence: row.confidence,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    evidence: row.evidence,
    geoType: row.geo_type,
    lat: row.lat,
    lon: row.lon,
    orgId: row.org_id,
  };
}

function mapOrg(row: any) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    sector: row.sector,
    city: row.city,
    dept: row.dept,
    website: row.website,
    domain: row.domain,
    lat: row.lat,
    lon: row.lon,
    eventCount: row.event_count,
  };
}

export default async function (app: FastifyInstance) {
  app.get("/orgs", async () => {
    const r = await query<any>(`
      SELECT o.id, o.name, o.slug, o.kind, o.sector, o.city, o.dept, o.website, o.domain, o.lat, o.lon, COUNT(e.id)::int AS event_count
      FROM org o LEFT JOIN event e ON e.org_id=o.id
      GROUP BY o.id ORDER BY o.name
    `);
    return r.rows.map(mapOrg);
  });
  app.get("/orgs/:slug", async (req) => {
    const slug = (req.params as { slug: string }).slug;
    const orgRes = await query<any>("SELECT id, name, slug, kind, sector, city, dept, website, domain, lat, lon FROM org WHERE slug=$1", [slug]);
    const orgRow = orgRes.rows[0];
    if (!orgRow) return { error: "not found" };
    const org = {
      id: orgRow.id,
      name: orgRow.name,
      slug: orgRow.slug,
      kind: orgRow.kind,
      sector: orgRow.sector,
      city: orgRow.city,
      dept: orgRow.dept,
      website: orgRow.website,
      domain: orgRow.domain,
      lat: orgRow.lat,
      lon: orgRow.lon,
    };
    const evRes = await query<any>("SELECT id, dedup_key, family, assertion_type, title, summary, observed_at, severity, confidence, source_id, source_url, evidence, geo_type, lat, lon, org_id FROM event WHERE org_id=$1 ORDER BY observed_at DESC LIMIT 50", [orgRow.id]);
    return { org, events: evRes.rows.map(mapEvent) };
  });
}
