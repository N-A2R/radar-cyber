import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function (app: FastifyInstance) {
  app.get("/events", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    let limit = Number(q.limit ?? 100);
    if (!Number.isFinite(limit)) limit = 100;
    limit = Math.min(Math.max(Math.trunc(limit), 1), 500);
    const params: unknown[] = [];
    const where: string[] = [];
    if (q.family) { params.push(q.family); where.push(`family=$${params.length}`); }
    if (q.orgId) { params.push(Number(q.orgId)); where.push(`org_id=$${params.length}`); }
    if (q.from) { params.push(q.from); where.push(`observed_at >= $${params.length}`); }
    if (q.sinceId) { params.push(Number(q.sinceId)); where.push(`id > $${params.length}`); }
    if (q.before) { params.push(Number(q.before)); where.push(`id < $${params.length}`); }
    const sort = q.sort === "collected" ? "collected" : "observed";
    const orderCol = sort === "collected" ? "collected_at" : "COALESCE(observed_at, collected_at)";
    params.push(limit);
    const limitIdx = params.length;
    const sql = `SELECT id, dedup_key, family, assertion_type, title, summary, observed_at, collected_at, severity, confidence, source_id, source_url, evidence, geo_type, lat, lon, org_id, date_source, date_confidence FROM event ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${orderCol} DESC, id DESC LIMIT $${limitIdx}`;
    const r = await query<any>(sql, params);
    return r.rows.map((row) => ({
      id: row.id,
      dedupKey: row.dedup_key,
      family: row.family,
      assertionType: row.assertion_type,
      title: row.title,
      summary: row.summary,
      observedAt: row.observed_at,
      collectedAt: row.collected_at,
      severity: row.severity,
      confidence: row.confidence,
      sourceId: row.source_id,
      sourceUrl: row.source_url,
      evidence: row.evidence,
      geoType: row.geo_type,
      lat: row.lat,
      lon: row.lon,
      orgId: row.org_id,
      dateSource: row.date_source,
      dateConfidence: row.date_confidence,
    }));
  });
}