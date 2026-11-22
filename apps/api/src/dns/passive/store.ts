/**
 * Persistence for passive DNS observations.
 *
 * Writes are idempotent per UTC day: the same answer seen twice on the same
 * day is one resolution, not two. The perimeter table keeps provenance so a
 * reader can check that every observed domain is an NA domain.
 */
import { ingestQuery, query } from "../../db.js";
import type { PassiveDomain } from "./perimeter.js";
import type { Resolution } from "./observe.js";

export interface DailyCount {
  day: string;
  resolutions: number;
  domains: number;
}

export interface PassiveScope {
  perimeterDomains: number;
  observedDomains: number;
  resolutions: number;
  firstDay: string | null;
  lastDay: string | null;
}

export async function saveDomains(domains: readonly PassiveDomain[]): Promise<number> {
  let saved = 0;
  for (const entry of domains) {
    const result = await ingestQuery(
      `INSERT INTO dns_passive_domain (domain, source, org_id)
       VALUES ($1, $2, $3::integer)
       ON CONFLICT (domain) DO UPDATE
         SET source = EXCLUDED.source,
             org_id = COALESCE(EXCLUDED.org_id, dns_passive_domain.org_id),
             last_seen_at = now()`,
      [entry.domain, entry.source, entry.orgId],
    );
    saved += result.rowCount ?? 0;
  }
  return saved;
}

/** Returns the number of newly recorded resolutions (repeats are ignored). */
export async function saveResolutions(resolutions: readonly Resolution[]): Promise<number> {
  let saved = 0;
  for (const record of resolutions) {
    const result = await ingestQuery(
      `INSERT INTO dns_passive_resolution
         (domain, observed_on, record_type, value)
       VALUES ($1, $2::date, $3, $4)
       ON CONFLICT (domain, observed_on, record_type, value) DO NOTHING`,
      [record.domain, record.observedOn, record.recordType, record.value],
    );
    saved += result.rowCount ?? 0;
  }
  return saved;
}

export async function dailyCounts(limit = 14): Promise<DailyCount[]> {
  const result = await query<{ day: string | Date; resolutions: string | number; domains: string | number }>(
    `SELECT day::text AS day, resolutions, domains
       FROM dns_passive_daily ORDER BY day DESC LIMIT $1`,
    [Math.max(1, Math.min(limit, 90))],
  );
  return result.rows.map((row) => ({
    day: String(row.day).slice(0, 10),
    resolutions: Number(row.resolutions),
    domains: Number(row.domains),
  }));
}

export async function passiveScope(): Promise<PassiveScope> {
  const result = await query<Record<string, string | number | null>>(
    `SELECT
       (SELECT count(*) FROM dns_passive_domain) AS perimeter_domains,
       (SELECT count(DISTINCT domain) FROM dns_passive_resolution) AS observed_domains,
       (SELECT count(*) FROM dns_passive_resolution) AS resolutions,
       (SELECT min(observed_on)::text FROM dns_passive_resolution) AS first_day,
       (SELECT max(observed_on)::text FROM dns_passive_resolution) AS last_day`,
  );
  const row = result.rows[0]!;
  return {
    perimeterDomains: Number(row.perimeter_domains),
    observedDomains: Number(row.observed_domains),
    resolutions: Number(row.resolutions),
    firstDay: row.first_day ? String(row.first_day).slice(0, 10) : null,
    lastDay: row.last_day ? String(row.last_day).slice(0, 10) : null,
  };
}
