/**
 * Read-only inputs of the insurance score.
 *
 * Only structural columns and numeric event aggregates leave the database.
 * Titles, summaries, evidence payloads, URLs and any victim field are never
 * selected. Every source is counted, including grey sources: no trust or
 * relevance filter is applied here.
 */
import { query } from "../db.js";
import type { InsuranceInput } from "./score.js";

export const NA_DEPARTMENTS: readonly string[] = [
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
];

export type InsuranceCorpus = {
  referenceDate: string;
  organizations: number;
  naOrganizations: number;
  sources: number;
  activeSources: number;
  events: number;
  attachedEvents: number;
};

export type InsuranceRow = {
  sector: string;
  sirenPresent: boolean;
  nafPresent: boolean;
  coordinatesPresent: boolean;
  registryIdentifierPresent: boolean;
  workforce: number | null;
  incidentCount: number;
  maxIncidentSeverity: number;
  ambientCount: number;
  distinctSources: number;
  sourceIds: string[];
  sectorClaimRate: number;
  overallClaimRate: number;
  organizationCount: number;
};

type RawRow = {
  sector: string;
  siren_present: boolean;
  naf_present: boolean;
  coordinates_present: boolean;
  registry_identifier_present: boolean;
  workforce: number | null;
  incident_count: string | number;
  max_incident_severity: string | number;
  ambient_count: string | number;
  distinct_sources: string | number;
  source_ids: string[] | null;
  sector_claim_rate: string | number;
  overall_claim_rate: string | number;
  organization_count: string | number;
};

/** The reference date is the last observed day of the local corpus. */
export async function loadInsuranceCorpus(): Promise<InsuranceCorpus> {
  const { rows } = await query<{
    reference_date: string | null;
    organizations: string;
    na_organizations: string;
    sources: string;
    active_sources: string;
    events: string;
    attached_events: string;
  }>(
    `SELECT to_char(date_trunc('day', coalesce(max(coalesce(at, observed_at, collected_at)), now()) AT TIME ZONE 'UTC'),
                    'YYYY-MM-DD') AS reference_date,
            (SELECT count(*) FROM org) AS organizations,
            (SELECT count(*) FROM org WHERE dept = ANY($1::text[])) AS na_organizations,
            (SELECT count(*) FROM source) AS sources,
            (SELECT count(*) FROM source WHERE enabled) AS active_sources,
            (SELECT count(*) FROM event) AS events,
            (SELECT count(*) FROM event WHERE org_id IS NOT NULL) AS attached_events
    FROM event`,
    [NA_DEPARTMENTS],
  );
  const row = rows[0];
  return {
    referenceDate: row.reference_date ?? new Date().toISOString().slice(0, 10),
    organizations: Number(row.organizations),
    naOrganizations: Number(row.na_organizations),
    sources: Number(row.sources),
    activeSources: Number(row.active_sources),
    events: Number(row.events),
    attachedEvents: Number(row.attached_events),
  };
}

/** The aggregation is shared by the full measurement and the single-org API. */
function inputsSql(extraFilter: string): string {
  return `
  WITH event_stats AS (
    SELECT e.org_id AS id,
      count(*) FILTER (WHERE e.assertion_type IN ('confirmed_incident', 'third_party_claim')
                         AND e.at >= ($2::date - interval '24 months'))::int AS incident_count,
      coalesce(max(e.severity) FILTER (WHERE e.assertion_type IN ('confirmed_incident', 'third_party_claim')
                         AND e.at >= ($2::date - interval '24 months')), 0)::int AS max_incident_severity,
      count(*) FILTER (WHERE e.assertion_type = 'ambient_signal'
                         AND e.at >= ($2::date - interval '24 months'))::int AS ambient_count,
      count(DISTINCT e.source_id) FILTER (WHERE e.at >= ($2::date - interval '24 months'))::int AS distinct_sources,
      coalesce(array_remove(array_agg(DISTINCT e.source_id) FILTER (
        WHERE e.at >= ($2::date - interval '24 months') AND e.source_id IS NOT NULL), NULL), '{}'::text[]) AS source_ids
    FROM event e
    WHERE e.org_id IS NOT NULL
    GROUP BY e.org_id
  ),
  na AS (
    SELECT o.id, coalesce(o.sector, 'unknown') AS sector,
      (o.siren IS NOT NULL AND btrim(o.siren) <> '') AS siren_present,
      (o.naf IS NOT NULL AND btrim(o.naf) <> '') AS naf_present,
      (o.lat IS NOT NULL AND o.lon IS NOT NULL) AS coordinates_present,
      (o.entity_source IS NOT NULL AND btrim(o.entity_source) <> '') AS registry_identifier_present,
      o.effectif_min AS workforce
    FROM org o
    WHERE o.dept = ANY($1::text[])
  ),
  selected AS (SELECT * FROM na ${extraFilter}),
  sector_rates AS (
    SELECT n.sector, count(*) AS population,
      count(*) FILTER (WHERE coalesce(s.incident_count, 0) > 0) AS claims
    FROM na n LEFT JOIN event_stats s ON s.id = n.id
    GROUP BY n.sector
  ),
  regional_rate AS (
    SELECT coalesce(sum(claims)::float8 / nullif(sum(population), 0), 0) AS rate FROM sector_rates
  )
  SELECT n.sector, n.siren_present, n.naf_present, n.coordinates_present,
    n.registry_identifier_present, n.workforce,
    coalesce(s.incident_count, 0) AS incident_count,
    coalesce(s.max_incident_severity, 0) AS max_incident_severity,
    coalesce(s.ambient_count, 0) AS ambient_count,
    coalesce(s.distinct_sources, 0) AS distinct_sources,
    coalesce(s.source_ids, '{}'::text[]) AS source_ids,
    (sr.claims::float8 + 1000 * r.rate) / (sr.population + 1000) AS sector_claim_rate,
    r.rate AS overall_claim_rate,
    count(*) AS organization_count
  FROM selected n
  LEFT JOIN event_stats s ON s.id = n.id
  JOIN sector_rates sr ON sr.sector = n.sector
  CROSS JOIN regional_rate r
  GROUP BY n.sector, n.siren_present, n.naf_present, n.coordinates_present,
    n.registry_identifier_present, n.workforce, s.incident_count,
    s.max_incident_severity, s.ambient_count, s.distinct_sources, s.source_ids,
    sr.claims, sr.population, r.rate
  `;
}

function mapRow(row: RawRow): InsuranceRow {
  return {
    sector: row.sector,
    sirenPresent: row.siren_present,
    nafPresent: row.naf_present,
    coordinatesPresent: row.coordinates_present,
    registryIdentifierPresent: row.registry_identifier_present,
    workforce: row.workforce === null ? null : Number(row.workforce),
    incidentCount: Number(row.incident_count),
    maxIncidentSeverity: Number(row.max_incident_severity),
    ambientCount: Number(row.ambient_count),
    distinctSources: Number(row.distinct_sources),
    sourceIds: row.source_ids ?? [],
    sectorClaimRate: Number(row.sector_claim_rate),
    overallClaimRate: Number(row.overall_claim_rate),
    organizationCount: Number(row.organization_count),
  };
}

export function inputFromRow(row: InsuranceRow): InsuranceInput {
  return {
    sirenPresent: row.sirenPresent,
    nafPresent: row.nafPresent,
    coordinatesPresent: row.coordinatesPresent,
    registryIdentifierPresent: row.registryIdentifierPresent,
    workforce: row.workforce,
    incidentCount: row.incidentCount,
    maxIncidentSeverity: row.maxIncidentSeverity,
    ambientCount: row.ambientCount,
    distinctSources: row.distinctSources,
    sectorClaimRate: row.sectorClaimRate,
    overallClaimRate: row.overallClaimRate,
  };
}

/** One row per distinct input combination, with its population weight. */
export async function loadInsuranceGroups(referenceDate: string): Promise<InsuranceRow[]> {
  const { rows } = await query<RawRow>(inputsSql(""), [NA_DEPARTMENTS, referenceDate]);
  return rows.map(mapRow);
}

/** The same aggregation restricted to one NA organization. */
export async function loadOrganizationInputs(orgId: number, referenceDate: string): Promise<InsuranceRow | null> {
  const { rows } = await query<RawRow>(
    inputsSql("WHERE id = $3::int"),
    [NA_DEPARTMENTS, referenceDate, orgId],
  );
  return rows.length === 0 ? null : mapRow(rows[0]);
}
