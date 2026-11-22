/**
 * Bounded reads feeding the "Am I affected?" assistant.
 *
 * Every lookup is indexed and returns at most one organization; observations
 * are limited to the 50 most recent rows. No free text (event title, summary,
 * leak body) is selected — the pure model can only see structured fields.
 */
import { query } from "../db.js";
import type { Observation, Organization } from "./model.js";

type OrganizationRow = {
  id: number;
  name: string;
  slug: string;
  kind: string;
  sector: string | null;
  city: string | null;
  dept: string | null;
  siren: string | null;
  entity_code: string | null;
  entity_source: string | null;
  geo_source: string | null;
  domain: string | null;
  website: string | null;
  valid_from: Date | string | null;
};

type ObservationRow = {
  id: string;
  family: string;
  assertion_type: string;
  observed_at: Date | string | null;
  source_id: string;
  source_url: string | null;
  evidence: Record<string, unknown> | null;
  regional: boolean | null;
};

const ORGANIZATION_COLUMNS = `
  id, name, slug, kind, sector, city, dept, siren, entity_code,
  entity_source, geo_source, domain, website, valid_from`;

function mapOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    sector: row.sector,
    city: row.city,
    dept: row.dept,
    siren: row.siren,
    entityCode: row.entity_code,
    entitySource: row.entity_source,
    geoSource: row.geo_source,
    domain: row.domain,
    website: row.website,
    validFrom: row.valid_from instanceof Date ? row.valid_from.toISOString() : row.valid_from,
  };
}

function mapObservation(row: ObservationRow): Observation {
  return {
    id: Number(row.id),
    family: row.family,
    assertionType: row.assertion_type,
    observedAt: row.observed_at instanceof Date ? row.observed_at.toISOString() : row.observed_at,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    evidence: row.evidence,
    regional: row.regional === true,
  };
}

export type OrganizationLookup = { id?: number; name?: string; domain?: string };

/** Resolve one organization by id, exact domain, or exact normalized name. */
export async function findOrganization(lookup: OrganizationLookup): Promise<Organization | null> {
  let sql: string;
  let params: unknown[];
  if (lookup.id !== undefined && Number.isInteger(lookup.id)) {
    sql = `SELECT ${ORGANIZATION_COLUMNS} FROM org WHERE id = $1 LIMIT 1`;
    params = [lookup.id];
  } else if (lookup.domain) {
    sql = `SELECT ${ORGANIZATION_COLUMNS} FROM org WHERE lower(domain) = lower($1) LIMIT 1`;
    params = [lookup.domain];
  } else if (lookup.name) {
    sql = `SELECT ${ORGANIZATION_COLUMNS} FROM org WHERE lower(name) = lower($1) ORDER BY id LIMIT 1`;
    params = [lookup.name];
  } else {
    return null;
  }
  const result = await query<OrganizationRow>(sql, params);
  const row = result.rows[0];
  return row ? mapOrganization(row) : null;
}

/** Structured observations attached to the organization, newest first. */
export async function listObservations(orgId: number): Promise<Observation[]> {
  const result = await query<ObservationRow>(
    `SELECT e.id::text AS id, e.family, e.assertion_type, e.observed_at,
            e.source_id, e.source_url, e.evidence, e.regional
       FROM event e
      WHERE e.org_id = $1
      ORDER BY e.observed_at DESC NULLS LAST, e.id DESC
      LIMIT 50`,
    [orgId],
  );
  return result.rows.map(mapObservation);
}
