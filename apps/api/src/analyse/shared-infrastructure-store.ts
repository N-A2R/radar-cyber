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

export const NA_DEPARTMENTS: readonly string[] = Object.keys(DEPT_LABELS).sort();

export const SQL = {
  baseline: `SELECT (SELECT count(*) FROM org)::int AS organizations,
                    (SELECT count(*) FROM source)::int AS sources,
                    (SELECT count(*) FROM event)::int AS events`,
  victims: `SELECT DISTINCT c.org_id
            FROM leak_claim c
            JOIN org o ON o.id = c.org_id
            WHERE c.na AND o.dept = ANY($1::text[])`,
  observations: `WITH victims AS (
                   SELECT DISTINCT c.org_id
                   FROM leak_claim c
                   JOIN org o ON o.id = c.org_id
                   WHERE c.na AND o.dept = ANY($1::text[])
                 ), raw AS (
                   SELECT c.org_id AS oid, 'leak_site'::text AS kind, s.site_url AS value
                   FROM leak_claim c
                   JOIN leak_site s ON s.source = c.source AND s.slug = c.site_slug
                   WHERE c.na AND s.site_url IS NOT NULL
                   UNION ALL
                   SELECT c.org_id, 'claim_evidence', c.evidence_url
                   FROM leak_claim c
                   WHERE c.na AND c.evidence_url IS NOT NULL
                   UNION ALL
                   SELECT e.org_id, 'event_source', s.url
                   FROM event e
                   JOIN source s ON s.id = e.source_id
                   WHERE e.org_id IS NOT NULL AND s.url IS NOT NULL
                   UNION ALL
                   SELECT v.org_id, arr.kind, x.value
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
                 SELECT DISTINCT r.oid, r.kind, r.value
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

type ObservationRow = { oid: number; kind: InfrastructureObservation["kind"]; value: string };

/** Runs the real database measurement, once, on the current base state. */
export async function measureSharedInfrastructure(): Promise<SharedInfrastructureMeasurement> {
  const [totals, victims, rows] = await Promise.all([
    query<{ organizations: number; sources: number; events: number }>(SQL.baseline),
    query<{ org_id: number }>(SQL.victims, [NA_DEPARTMENTS]),
    query<ObservationRow>(SQL.observations, [NA_DEPARTMENTS]),
  ]);

  const observations: InfrastructureObservation[] = rows.rows.map((row) => ({
    orgId: Number(row.oid),
    kind: row.kind,
    value: row.value,
  }));
  const detected = detectSharedInfrastructure(observations);
  const baseline = totals.rows[0] ?? { organizations: 0, sources: 0, events: 0 };

  return {
    scope: "nouvelle-aquitaine",
    clusterCount: detected.clusterCount,
    victimOrganizations: victims.rows.length,
    victimsInClusters: detected.victimsInClusters,
    sharedAnchors: detected.sharedAnchors,
    normalizedObservations: detected.observations,
    baseline: {
      organizations: Number(baseline.organizations),
      sources: Number(baseline.sources),
      events: Number(baseline.events),
    },
    clusters: detected.clusters,
    measuredAt: new Date().toISOString(),
  };
}
