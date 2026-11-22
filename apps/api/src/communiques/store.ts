import { createHash } from "node:crypto";
import { isoWeek } from "./window.js";
import { ingestQuery, query } from "../db.js";
import { canonicalUrl } from "./dedupe.js";
import { OFFICIAL_SOURCES, type OfficialStatement } from "./model.js";

export const STATEMENT_FAMILY = "official_statement";

/** Register the curated sources so the corpus is auditable from SQL too. */
export async function ensureSources(): Promise<number> {
  let count = 0;
  for (const source of OFFICIAL_SOURCES) {
    await ingestQuery(
      `INSERT INTO source (id, name, family, url, license, enabled, kind, format, parser, interval_sec, description)
       VALUES ($1,$2,$3,$4,'official public disclosure',true,'narrative',$5,'{}'::jsonb,3600,$6)
       ON CONFLICT (id) DO UPDATE SET url=EXCLUDED.url, enabled=true, description=EXCLUDED.description`,
      [
        source.id,
        source.name,
        STATEMENT_FAMILY,
        source.url,
        source.format,
        JSON.stringify({ department: source.department, departmentLabel: source.departmentLabel, officialDomain: source.officialDomain }),
      ],
    );
    count += 1;
  }
  return count;
}

export type StoreReport = { inserted: number; duplicates: number };

/**
 * Idempotent insert. `dedup_key` is derived from the canonical official URL:
 * rerunning the collector can never double-count a statement.
 */
export async function storeStatements(items: OfficialStatement[]): Promise<StoreReport> {
  let inserted = 0;
  let duplicates = 0;
  for (const item of items) {
    const dedupKey = `official-statement:${createHash("sha256").update(canonicalUrl(item.url)).digest("hex")}`;
    const result = await ingestQuery(
      `INSERT INTO event
         (dedup_key, family, assertion_type, title, observed_at, collected_at, severity,
          source_id, source_url, evidence, geo_type, regional, regional_motif,
          valid_at, at, date_source, date_confidence, tlp)
       VALUES ($1,$2,'ambient_signal',$3,$4,now(),3,$5,$6,$7,'unknown',true,'nouvelle-aquitaine',$4,$4,'published','high','CLEAR')
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        dedupKey,
        STATEMENT_FAMILY,
        item.title,
        item.publishedAt,
        item.sourceId,
        item.url,
        JSON.stringify({
          kind: "official_statement",
          department: item.department,
          departmentLabel: item.departmentLabel,
          officialDomain: item.officialDomain,
          collector: "na-official-statements",
        }),
      ],
    );
    if (result.rowCount === 1) inserted += 1;
    else duplicates += 1;
  }
  return { inserted, duplicates };
}

export type WeekCount = {
  week: string;
  weekStart: string;
  count: number;
  byDepartment: Record<string, number>;
};

export type WeeklyMeasurement = {
  generatedAt: string;
  definition: string;
  currentWeek: string;
  currentWeekCount: number;
  total: number;
  sources: number;
  weeks: WeekCount[];
};

const DEFINITION = "Dated public communication published by an official Nouvelle-Aquitaine institution on its own domain, stored as an official_statement event, without victim personal data.";

/** Reproducible weekly measurement; ISO weeks start on Monday. */
export async function measureWeeks(weeks = 4, now: Date = new Date()): Promise<WeeklyMeasurement> {
  // ISO weeks are UTC and start on Monday. `date_trunc('week', timestamptz)`
  // follows the session time zone (Europe/Paris here), which shifts the
  // boundary to Sunday and produces two labels for the same ISO week.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const weekday = new Date(today).getUTCDay() || 7;
  const monday = today - (weekday - 1) * 86400000;
  const first = monday - (weeks - 1) * 7 * 86400000;
  const end = monday + 7 * 86400000;
  const bounds = [STATEMENT_FAMILY, new Date(first), new Date(end)];

  const [rows, departmentRows, totals, sources] = await Promise.all([
    query<{ week_start: string; count: number }>(
      `SELECT to_char(date_trunc('week', e.at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week_start,
              count(*)::int AS count
         FROM event e
        WHERE e.family = $1 AND e.at >= $2::timestamptz AND e.at < $3::timestamptz
        GROUP BY 1 ORDER BY 1`,
      bounds,
    ),
    query<{ week_start: string; department: string; count: number }>(
      `SELECT to_char(date_trunc('week', at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS week_start,
              coalesce(evidence->>'department','unknown') AS department,
              count(*)::int AS count
         FROM event
        WHERE family = $1 AND at >= $2::timestamptz AND at < $3::timestamptz
        GROUP BY 1,2 ORDER BY 1,2`,
      bounds,
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total FROM event WHERE family = $1`, [STATEMENT_FAMILY]),
    query<{ sources: number }>(`SELECT count(*)::int AS sources FROM source WHERE family = $1 AND enabled`, [STATEMENT_FAMILY]),
  ]);

  const byWeek = new Map<string, Record<string, number>>();
  for (const row of departmentRows.rows) {
    const bucket = byWeek.get(row.week_start) ?? {};
    bucket[row.department] = row.count;
    byWeek.set(row.week_start, bucket);
  }

  const series: WeekCount[] = rows.rows.map((row) => ({
    week: isoWeek(new Date(`${row.week_start}T00:00:00Z`)),
    weekStart: row.week_start,
    count: row.count,
    byDepartment: byWeek.get(row.week_start) ?? {},
  }));

  // A week with zero statement is still a measurement; show it explicitly.
  for (let offset = 0; offset < weeks; offset += 1) {
    const key = new Date(first + offset * 7 * 86400000).toISOString().slice(0, 10);
    if (!series.some((week) => week.weekStart === key)) {
      series.push({ week: isoWeek(new Date(`${key}T00:00:00Z`)), weekStart: key, count: 0, byDepartment: {} });
    }
  }
  series.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return {
    generatedAt: now.toISOString(),
    definition: DEFINITION,
    currentWeek: isoWeek(new Date(`${new Date(monday).toISOString().slice(0, 10)}T00:00:00Z`)),
    currentWeekCount: series.find((week) => week.weekStart === new Date(monday).toISOString().slice(0, 10))?.count ?? 0,
    total: totals.rows[0]?.total ?? 0,
    sources: sources.rows[0]?.sources ?? 0,
    weeks: series,
  };
}
