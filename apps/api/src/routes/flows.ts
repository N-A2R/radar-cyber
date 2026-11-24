import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { evenementPublicSql } from "../security/tlp.js";

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
      const params: unknown[] = [];
      const centroidRows = Object.entries(NA_CENTROIDS).map(([dept, c]) => {
        const base = params.length;
        params.push(dept, c.lat, c.lon, c.label);
        return `($${base + 1}::text, $${base + 2}::double precision, $${base + 3}::double precision, $${base + 4}::text)`;
      }).join(", ");
      params.push(limit);
      const r = await query<{
        id: number; name: string; kind: string; lat: number; lon: number;
        clat: number; clon: number; clabel: string; total_count: string;
      }>(
        `WITH centroids(dept, lat, lon, label) AS (VALUES ${centroidRows}),
         eligible AS (
           SELECT o.id, o.name, o.kind, o.lat, o.lon, c.lat AS clat, c.lon AS clon, c.label AS clabel
             FROM org o JOIN centroids c ON c.dept = o.dept
            WHERE o.lat IS NOT NULL AND o.lon IS NOT NULL
              AND 2 * 6371 * asin(sqrt(
                power(sin(radians(c.lat - o.lat) / 2), 2) +
                cos(radians(o.lat)) * cos(radians(c.lat)) *
                power(sin(radians(c.lon - o.lon) / 2), 2)
              )) >= 1
         )
         SELECT *, count(*) OVER () AS total_count
           FROM eligible ORDER BY id LIMIT $${params.length}`,
        params,
      );
      const observedAt = new Date().toISOString();
      const arcs = r.rows.map((row) => ({
        id: `org-${row.id}`,
        from: { lat: row.lat, lon: row.lon, label: trunc(row.name) },
        to: { lat: row.clat, lon: row.clon, label: trunc(row.clabel) },
        family: "cti",
        nature: row.kind,
        severity: 3,
        observedAt,
        title: trunc(row.name),
        sourceUrl: null,
      }));
      const total = Number(r.rows[0]?.total_count ?? 0);
      return { arcs, total, truncated: total > limit };
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
    where.push(`e.geo_type IN ('hosting_estimate', 'claimed_origin')`);
    where.push(`2 * 6371 * asin(sqrt(
      power(sin(radians(e.lat - o.lat) / 2), 2) +
      cos(radians(o.lat)) * cos(radians(e.lat)) *
      power(sin(radians(e.lon - o.lon) / 2), 2)
    )) >= 1`);
    where.push(evenementPublicSql("e"));
    params.push(limit);

    const sql = `
      SELECT e.id, e.dedup_key, e.family, e.title, e.severity, e.observed_at, e.source_url,
             e.lat AS elat, e.lon AS elon,
             o.lat AS olat, o.lon AS olon, o.name AS oname,
             count(*) OVER () AS total_count
      FROM event e JOIN org o ON o.id = e.org_id
      WHERE ${where.join(" AND ")}
      ORDER BY e.observed_at DESC NULLS LAST, e.id DESC
      LIMIT $${params.length}
    `;
    const r = await query<{
      dedup_key: string;
      family: string;
      severity: number;
      observed_at: string | null;
      title: string;
      source_url: string | null;
      olat: number;
      olon: number;
      oname: string;
      elat: number;
      elon: number;
      total_count: string;
    }>(sql, params);
    const arcs = r.rows.map((row) => ({
      id: row.dedup_key,
      from: { lat: row.olat, lon: row.olon, label: trunc(row.oname) },
      to: { lat: row.elat, lon: row.elon, label: trunc("hébergement estimé") },
      family: row.family,
      severity: row.severity,
      observedAt: row.observed_at,
      title: trunc(row.title),
      sourceUrl: row.source_url,
    }));
    const total = Number(r.rows[0]?.total_count ?? 0);
    return { arcs, total, truncated: total > limit };
  });
}
