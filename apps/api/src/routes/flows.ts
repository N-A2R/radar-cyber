import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

// 12 centroïdes de départements Nouvelle-Aquitaine (fallback démo)
const NA_CENTROIDS: Record<string, { lat: number; lon: number; label: string }> = {
  "16": { lat: 45.65, lon: 0.15, label: "Charente (16)" },
  "17": { lat: 45.75, lon: -0.64, label: "Charente-Maritime (17)" },
  "19": { lat: 45.27, lon: 1.77, label: "Corrèze (19)" },
  "23": { lat: 46.17, lon: 1.87, label: "Creuse (23)" },
  "24": { lat: 45.18, lon: 0.72, label: "Dordogne (24)" },
  "33": { lat: 44.84, lon: -0.58, label: "Gironde (33)" },
  "40": { lat: 43.89, lon: -0.8, label: "Landes (40)" },
  "47": { lat: 44.2, lon: 0.62, label: "Lot-et-Garonne (47)" },
  "64": { lat: 43.3, lon: -0.37, label: "Pyrénées-Atlantiques (64)" },
  "79": { lat: 46.32, lon: -0.46, label: "Deux-Sèvres (79)" },
  "86": { lat: 46.58, lon: 0.34, label: "Vienne (86)" },
  "87": { lat: 45.83, lon: 1.26, label: "Haute-Vienne (87)" },
};

function trunc(s: unknown, n = 60): string {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n) : t;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default async function (app: FastifyInstance) {
  app.get("/flows", async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const mode = q.mode ?? "arcs";

    let days = Number(q.days ?? 7);
    if (!Number.isFinite(days)) days = 7;
    days = Math.min(Math.max(Math.trunc(days), 1), 365);

    let limit = Number(q.limit ?? 300);
    if (!Number.isFinite(limit)) limit = 300;
    limit = Math.min(Math.max(Math.trunc(limit), 1), 1000);

    const families = q.family ? q.family.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const minSeverity = q.minSeverity ? Number(q.minSeverity) : null;

    if (mode === "orgs") {
      // arcs entre orgs et leur département centroïde
      const r = await query<{ id: number; name: string; kind: string; dept: string | null; lat: number; lon: number }>(
        `SELECT o.id, o.name, o.kind, o.dept, o.lat, o.lon FROM org o WHERE o.lat IS NOT NULL AND o.lon IS NOT NULL`
      );
      const arcs: Record<string, unknown>[] = [];
      for (const row of r.rows) {
        const c = NA_CENTROIDS[String(row.dept)];
        if (!c) continue;
        if (haversineKm(row.lat, row.lon, c.lat, c.lon) < 1) continue;
        arcs.push({
          id: `org-${row.id}`,
          from: { lat: row.lat, lon: row.lon, label: trunc(row.name) },
          to: { lat: c.lat, lon: c.lon, label: trunc(c.label) },
          family: "cti",
          nature: row.kind,
          severity: 3,
          observedAt: new Date().toISOString(),
          title: trunc(row.name),
          sourceUrl: null,
        });
      }
      return { arcs: arcs.slice(0, limit), total: arcs.length, truncated: arcs.length > limit };
    }

    const params: unknown[] = [];
    const where: string[] = [`e.observed_at >= now() - ($1 || ' days')::interval`];
    params.push(days);
    // days placeholder index 1
    if (families.length) {
      params.push(families);
      where.push(`e.family = ANY($${params.length})`);
    }
    if (minSeverity !== null && Number.isFinite(minSeverity)) {
      params.push(minSeverity);
      where.push(`e.severity >= $${params.length}`);
    }
    where.push(`e.lat IS NOT NULL AND e.lon IS NOT NULL`);
    where.push(`o.lat IS NOT NULL AND o.lon IS NOT NULL`);

    const sql = `
      SELECT e.id, e.dedup_key, e.family, e.title, e.severity, e.observed_at, e.source_url,
             e.lat AS elat, e.lon AS elon, e.geo_type,
             o.lat AS olat, o.lon AS olon, o.name AS oname
      FROM event e JOIN org o ON o.id = e.org_id
      WHERE ${where.join(" AND ")}
      ORDER BY e.observed_at DESC NULLS LAST, e.id DESC
    `;
    const r = await query<{
      dedup_key: string;
      family: string;
      severity: number;
      observed_at: string | null;
      title: string;
      source_url: string | null;
      geo_type: string;
      olat: number;
      olon: number;
      oname: string;
      elat: number;
      elon: number;
    }>(sql, params);
    const arcs: Record<string, unknown>[] = [];
    for (const row of r.rows) {
      const geoOk = row.geo_type === "hosting_estimate" || row.geo_type === "claimed_origin";
      if (!geoOk) continue;
      if (haversineKm(row.olat, row.olon, row.elat, row.elon) < 1) continue;
      arcs.push({
        id: row.dedup_key,
        from: { lat: row.olat, lon: row.olon, label: trunc(row.oname) },
        to: { lat: row.elat, lon: row.elon, label: trunc("hébergement estimé") },
        family: row.family,
        severity: row.severity,
        observedAt: row.observed_at,
        title: trunc(row.title),
        sourceUrl: row.source_url,
      });
    }
    const total = arcs.length;
    const truncated = total > limit;
    return { arcs: arcs.slice(0, limit), total, truncated };
  });
}
