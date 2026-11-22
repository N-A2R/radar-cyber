/** Read-only adapter: dated grey-source claims attached to Nouvelle-Aquitaine organisations. */
import { query } from "../db.js";
import { addDays, NA_DEPARTMENTS, type FallRecord } from "./contagion.js";

type ClaimRow = {
  date: string;
  victim: string;
  source: string;
  orgId: number;
  name: string;
  department: string;
  sector: string;
  sectorGroup: string;
  city: string;
  naf: string;
  parentOrgId: number | null;
  domain: string;
};

/**
 * `leak_claim.victim` is only graded in memory by the model; it is never part
 * of a response or a report. Free-text fields such as `description` and
 * `evidence_url` are not read at all.
 */
export async function loadFallRecords(): Promise<FallRecord[]> {
  const { rows } = await query<ClaimRow>(
    `SELECT lc.published_at::date::text AS date,
            lc.victim,
            lc.site_slug AS source,
            o.id AS "orgId",
            o.name,
            o.dept AS department,
            COALESCE(o.sector, '') AS sector,
            COALESCE(o.secteur_groupe, '') AS "sectorGroup",
            COALESCE(o.city, '') AS city,
            COALESCE(o.naf, '') AS naf,
            o.parent_org_id AS "parentOrgId",
            COALESCE(o.domain, '') AS domain
       FROM leak_claim lc
       JOIN org o ON o.id = lc.org_id
      WHERE lc.published_at IS NOT NULL
        AND o.dept = ANY($1::text[])
      ORDER BY lc.published_at DESC, lc.id DESC`,
    [[...NA_DEPARTMENTS]],
  );
  return rows.map((r) => ({
    orgId: Number(r.orgId),
    name: r.name,
    department: r.department,
    sector: r.sector,
    sectorGroup: r.sectorGroup,
    city: r.city,
    naf: r.naf,
    parentOrgId: r.parentOrgId === null ? null : Number(r.parentOrgId),
    domain: r.domain,
    date: r.date,
    victim: r.victim,
    source: r.source,
  }));
}

/** Latest anchor with a complete 30-day observation window. */
export function defaultAsOf(records: readonly FallRecord[]): string {
  const days = records.map((r) => r.date).sort();
  const last = days.at(-1);
  return last ? addDays(last, -30) : new Date().toISOString().slice(0, 10);
}
