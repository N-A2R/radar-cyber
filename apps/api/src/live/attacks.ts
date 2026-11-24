/**
 * Single definition of the "ongoing" attacks shown on the 3D map.
 *
 * Shared by the HTTP route, the SSE feed and the FPS benchmark: one query,
 * one window, one projection. Fields are an allowlist: no title, summary,
 * URL or victim personal data ever leaves the database. Source trust is not
 * filtered (gray sources are allowed).
 */
import { evenementPublicSql } from "../security/tlp.js";
/** Nouvelle-Aquitaine bounding box (WGS84 degrees, with margin). */
export const NA_BBOX = {
  minLat: 43.0,
  maxLat: 46.9,
  minLon: -1.9,
  maxLon: 2.0,
} as const;

/** Activity window: 30 days. Older events are no longer ongoing. */
export const LIVE_WINDOW_DAYS = 30;

/** Attack signal; excludes technical-indicator collection noise. */
export const LIVE_ASSERTION_TYPES = ["third_party_claim", "confirmed_incident", "ambient_signal"] as const;

export type LiveAttack = {
  id: string;
  family: string;
  assertionType: string;
  severity: number;
  observedAt: string;
  lat: number;
  lon: number;
  orgId: number | null;
  sourceId: string;
  dept: string | null;
};

/** $1 days, $2 types, $3-$4 latitude, $5-$6 longitude, $7 minimum id, $8 limit. */
export const LIVE_ATTACK_SQL = `
SELECT e.id::text AS id, e.family, e.assertion_type AS "assertionType",
       e.severity, e.observed_at AS "observedAt",
       COALESCE(e.lat, o.lat) AS lat, COALESCE(e.lon, o.lon) AS lon,
       e.org_id AS "orgId", e.source_id AS "sourceId", o.dept
FROM event e
LEFT JOIN org o ON o.id = e.org_id
WHERE e.observed_at >= now() - ($1::int || ' days')::interval
  AND e.assertion_type = ANY($2::text[])
  AND ${evenementPublicSql("e")}
  AND COALESCE(e.lat, o.lat) BETWEEN $3 AND $4
  AND COALESCE(e.lon, o.lon) BETWEEN $5 AND $6
  AND ($7::bigint IS NULL OR e.id > $7::bigint)
ORDER BY e.observed_at DESC, e.id DESC LIMIT $8::int
`;

export function liveAttackParams(afterId: number | null = null, limite = 500): unknown[] {
  return [
    LIVE_WINDOW_DAYS,
    [...LIVE_ASSERTION_TYPES],
    NA_BBOX.minLat,
    NA_BBOX.maxLat,
    NA_BBOX.minLon,
    NA_BBOX.maxLon,
    afterId,
    limite,
  ];
}

/** Allowlist projection: same shape for the snapshot and the stream. */
export function toLiveAttack(row: Record<string, unknown>): LiveAttack | null {
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < NA_BBOX.minLat || lat > NA_BBOX.maxLat) return null;
  if (lon < NA_BBOX.minLon || lon > NA_BBOX.maxLon) return null;
  const id = String(row.id ?? "");
  const sourceId = String(row.sourceId ?? row.source_id ?? "");
  if (!id || !sourceId) return null;
  const severity = Number(row.severity);
  return {
    id,
    family: String(row.family ?? "unknown"),
    assertionType: String(row.assertionType ?? row.assertion_type ?? "unknown"),
    severity: Number.isFinite(severity) ? Math.min(5, Math.max(1, severity)) : 1,
    observedAt: String(row.observedAt ?? row.observed_at ?? ""),
    lat,
    lon,
    orgId: row.orgId == null && row.org_id == null ? null : Number(row.orgId ?? row.org_id),
    sourceId,
    dept: row.dept == null ? null : String(row.dept),
  };
}

/** SSE payload: approved keys only, no free text. */
export function formatAttackEvent(attack: LiveAttack): string {
  const payload: LiveAttack = {
    id: attack.id,
    family: attack.family,
    assertionType: attack.assertionType,
    severity: attack.severity,
    observedAt: attack.observedAt,
    lat: attack.lat,
    lon: attack.lon,
    orgId: attack.orgId,
    sourceId: attack.sourceId,
    dept: attack.dept,
  };
  return `event: attack\ndata: ${JSON.stringify(payload)}\n\n`;
}
