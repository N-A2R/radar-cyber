/**
 * Reads the minimum set of columns needed to detect infrastructure shared by
 * Nouvelle-Aquitaine victims.
 *
 * The SQL never selects victim names, claim bodies, e-mails or credentials:
 * only organization ids, department codes and infrastructure values. Gray
 * sources (ransomwatch, ransomlook) stay eligible; nothing is fetched from a
 * network and no paid source is used.
 */
import { DEPT_LABELS } from "../collectors/relevance.js";
import { query } from "../db.js";
import {
  detectSharedInfrastructure,
  type InfrastructureObservation,
  type SharedInfrastructureCluster,
} from "./shared-infrastructure.js";
import {
  buildInfrastructureTimeline,
  type DatedInfrastructureObservation,
  type InfrastructureTimeline,
} from "./shared-infrastructure-timeline.js";
import {
  buildInfrastructureGeography,
  type InfrastructureGeography,
} from "./shared-infrastructure-geography.js";
import {
  buildInfrastructurePersistence,
  type InfrastructurePersistence,
} from "./shared-infrastructure-persistence.js";

export const NA_DEPARTMENTS: readonly string[] = Object.keys(DEPT_LABELS).sort();

export const SQL = {
  baseline: `SELECT (SELECT count(*) FROM org)::int AS organizations,
                    (SELECT count(*) FROM source)::int AS sources,
                    (SELECT count(*) FROM event)::int AS events`,
  victims: `SELECT DISTINCT c.org_id
            FROM leak_claim c
            JOIN org o ON o.id = c.org_id
            WHERE c.na AND o.dept = ANY($1::text[])`,
  departments: `SELECT DISTINCT c.org_id AS oid, o.dept
                 FROM leak_claim c
                 JOIN org o ON o.id = c.org_id
                 WHERE c.na AND o.dept = ANY($1::text[])`,
  observations: `WITH victims AS (
                   SELECT DISTINCT c.org_id
                   FROM leak_claim c
                   JOIN org o ON o.id = c.org_id
                   WHERE c.na AND o.dept = ANY($1::text[])
                 ), raw AS (
                   SELECT c.org_id AS oid, 'leak_site'::text AS kind, s.site_url AS value,
                          c.published_at AS observed_at
                   FROM leak_claim c
                   JOIN leak_site s ON s.source = c.source AND s.slug = c.site_slug
                   WHERE c.na AND s.site_url IS NOT NULL
                   UNION ALL
                   SELECT c.org_id, 'claim_evidence', c.evidence_url, c.published_at
                   FROM leak_claim c
                   WHERE c.na AND c.evidence_url IS NOT NULL
                   UNION ALL
                   SELECT e.org_id, 'event_source', s.url, e.observed_at
                   FROM event e
                   JOIN source s ON s.id = e.source_id
                   WHERE e.org_id IS NOT NULL AND s.url IS NOT NULL
                   UNION ALL
                   SELECT v.org_id, arr.kind, x.value, s.observed_at
                   FROM dns_snapshot s
                   JOIN victims v ON v.org_id = ANY(COALESCE((
                          SELECT d.org_ids FROM dns_domaine d WHERE d.domain = s.domain
                        ), '{}'::int[]))
                     OR EXISTS (SELECT 1 FROM org o WHERE o.domain = s.domain AND o.id = v.org_id)
                   CROSS JOIN LATERAL (VALUES
                     ('dns_a'::text, s.a), ('dns_aaaa'::text, s.aaaa),
                     ('dns_mx'::text, s.mx), ('dns_ns'::text, s.ns)
                   ) AS arr(kind, values)
                   CROSS JOIN LATERAL unnest(COALESCE(arr.values, '{}'::text[])) AS x(value)
                 )
                 SELECT DISTINCT r.oid, r.kind, r.value, r.observed_at
                 FROM raw r
                 JOIN victims v ON v.org_id = r.oid
                 WHERE r.value IS NOT NULL AND btrim(r.value) <> ''`,
} as const;

export type SharedInfrastructureMeasurement = {
  scope: "nouvelle-aquitaine";
  clusterCount: number;
  victimOrganizations: number;
  victimsInClusters: number;
  sharedAnchors: number;
  normalizedObservations: number;
  baseline: { organizations: number; sources: number; events: number };
  clusters: SharedInfrastructureCluster[];
  measuredAt: string;
};

type Baseline = { organizations: number; sources: number; events: number };

type ObservationRow = {
  oid: number;
  kind: InfrastructureObservation["kind"];
  value: string;
  observed_at: string | null;
};

function toIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

async function loadInfrastructureData() {
  const [totals, victims, rows] = await Promise.all([
    query<Baseline>(SQL.baseline),
    query<{ org_id: number }>(SQL.victims, [NA_DEPARTMENTS]),
    query<ObservationRow>(SQL.observations, [NA_DEPARTMENTS]),
  ]);
  const observations: DatedInfrastructureObservation[] = rows.rows.map((row) => ({
    orgId: Number(row.oid),
    kind: row.kind,
    value: row.value,
    observedAt: toIso(row.observed_at),
  }));
  const raw = totals.rows[0] ?? { organizations: 0, sources: 0, events: 0 };
  const baseline: Baseline = {
    organizations: Number(raw.organizations),
    sources: Number(raw.sources),
    events: Number(raw.events),
  };
  return { victims, observations, baseline };
}

async function loadDepartmentsByOrg(): Promise<Map<number, string>> {
  const { rows } = await query<{ oid: number; dept: string }>(SQL.departments, [NA_DEPARTMENTS]);
  const byOrg = new Map<number, string>();
  for (const row of rows) {
    if (typeof row.dept === "string" && row.dept.trim() !== "") {
      byOrg.set(Number(row.oid), row.dept.trim());
    }
  }
  return byOrg;
}

/** Runs the real database measurement, once, on the current base state. */
export async function measureSharedInfrastructure(): Promise<SharedInfrastructureMeasurement> {
  const { victims, observations, baseline } = await loadInfrastructureData();
  const detected = detectSharedInfrastructure(observations);

  return {
    scope: "nouvelle-aquitaine",
    clusterCount: detected.clusterCount,
    victimOrganizations: victims.rows.length,
    victimsInClusters: detected.victimsInClusters,
    sharedAnchors: detected.sharedAnchors,
    normalizedObservations: detected.observations,
    baseline,
    clusters: detected.clusters,
    measuredAt: new Date().toISOString(),
  };
}

export type SharedInfrastructureTimelineMeasurement = {
  scope: "nouvelle-aquitaine";
  clusterCount: number;
  datedClusters: number;
  medianReuseDays: number | null;
  longestReuseDays: number;
  observationsWithDates: number;
  clusterTimelines: InfrastructureTimeline["clusterTimelines"];
  baseline: Baseline;
  measuredAt: string;
};

/** Dates the same detected clusters from the observation dates stored in the base. */
export async function measureSharedInfrastructureTimeline(): Promise<SharedInfrastructureTimelineMeasurement> {
  const { observations, baseline } = await loadInfrastructureData();
  const detected = detectSharedInfrastructure(observations);
  const timeline = buildInfrastructureTimeline(detected, observations);

  return {
    scope: "nouvelle-aquitaine",
    clusterCount: timeline.clusterCount,
    datedClusters: timeline.datedClusters,
    medianReuseDays: timeline.medianReuseDays,
    longestReuseDays: timeline.longestReuseDays,
    observationsWithDates: timeline.observationsWithDates,
    clusterTimelines: timeline.clusterTimelines,
    baseline,
    measuredAt: new Date().toISOString(),
  };
}

export type SharedInfrastructureGeographyMeasurement = {
  scope: "nouvelle-aquitaine";
  clusterCount: number;
  crossDepartmentClusters: number;
  departmentsCovered: number;
  clusterGeographies: InfrastructureGeography["clusterGeographies"];
  baseline: Baseline;
  measuredAt: string;
};

/** Measures how many detected clusters link victims from several NA departments. */
export async function measureSharedInfrastructureGeography(): Promise<SharedInfrastructureGeographyMeasurement> {
  const [{ observations, baseline }, departmentsByOrg] = await Promise.all([
    loadInfrastructureData(),
    loadDepartmentsByOrg(),
  ]);
  const detected = detectSharedInfrastructure(observations);
  const geography = buildInfrastructureGeography(detected, departmentsByOrg);

  return {
    scope: "nouvelle-aquitaine",
    clusterCount: geography.clusterCount,
    crossDepartmentClusters: geography.crossDepartmentClusters,
    departmentsCovered: geography.departmentsCovered,
    clusterGeographies: geography.clusterGeographies,
    baseline,
    measuredAt: new Date().toISOString(),
  };
}

export type SharedInfrastructurePersistenceMeasurement = {
  scope: "nouvelle-aquitaine";
  clusterCount: number;
  persistentClusters: number;
  departmentsCovered: number;
  datedClusters: number;
  clusterPersistences: InfrastructurePersistence["clusters"];
  baseline: Baseline;
  measuredAt: string;
};

/** Cross-checks the geographic and temporal reuse of the same detected clusters. */
export async function measureSharedInfrastructurePersistence(): Promise<SharedInfrastructurePersistenceMeasurement> {
  const [{ observations, baseline }, departmentsByOrg] = await Promise.all([
    loadInfrastructureData(),
    loadDepartmentsByOrg(),
  ]);
  const detected = detectSharedInfrastructure(observations);
  const geography = buildInfrastructureGeography(detected, departmentsByOrg);
  const timeline = buildInfrastructureTimeline(detected, observations);
  const persistence = buildInfrastructurePersistence(geography, timeline);

  return {
    scope: "nouvelle-aquitaine",
    clusterCount: persistence.clusterCount,
    persistentClusters: persistence.persistentClusters,
    departmentsCovered: geography.departmentsCovered,
    datedClusters: timeline.datedClusters,
    clusterPersistences: persistence.clusters,
    baseline,
    measuredAt: new Date().toISOString(),
  };
}
