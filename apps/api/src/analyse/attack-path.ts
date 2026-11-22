/**
 * Shortest measured path from a threat group to a Nouvelle-Aquitaine organization.
 *
 * The graph comes from `graph_entity` / `graph_relation` (see migration 052).
 * Only relations that describe an observable chain are traversed:
 *   group -claims-> event -reported_by-> source -reported_by-> event
 *         -targeted_by-> organization, or group <-attributed_to- organization.
 * Reporting hubs (families) are intentionally excluded: expanding one family
 * node reaches thousands of unrelated events and blows the latency budget.
 *
 * No relation is inferred. Event titles are never returned: they can contain
 * victim details. Only ids, kinds and non-personal properties are exposed.
 */
import { query } from "../db.js";

export const NA_DEPARTMENTS: readonly string[] = [
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "65", "79", "86", "87",
];

export type AttackPathNode = {
  id: string;
  kind: string;
  label: string;
  props: Record<string, unknown>;
};

export type AttackPathLink = { source: string; target: string; type: string };

export type AttackPathMatch = {
  found: boolean;
  hops: number;
  path: string[];
  links: AttackPathLink[];
  nodes: AttackPathNode[];
  intermediaries: string[];
};

type PathRow = {
  path: string[];
  types: string[];
  depth: number;
  nodes: AttackPathNode[];
};

const SQL = `
WITH RECURSIVE walk(id, kind, depth, path, types) AS (
  SELECT e.id, e.kind, 0, ARRAY[e.id]::text[], ARRAY[]::text[]
    FROM graph_entity e
   WHERE e.id = $1::text AND e.kind = 'group'
  UNION ALL
  SELECT n.id, n.kind, w.depth + 1, w.path || n.id, w.types || x.t
    FROM walk w
    JOIN LATERAL (
      SELECT r.target_id AS other, r.type AS t FROM graph_relation r WHERE r.source_id = w.id
      UNION ALL
      SELECT r.source_id AS other, r.type AS t FROM graph_relation r WHERE r.target_id = w.id
    ) x ON true
    JOIN graph_entity n ON n.id = x.other
   WHERE w.depth < $3::int
     AND NOT x.other = ANY (w.path)
     AND (
       (w.kind = 'group'
         AND ((x.t = 'claims' AND n.kind = 'event')
           OR (x.t = 'attributed_to' AND n.kind = 'org')))
       OR (w.kind = 'event'
         AND ((x.t = 'reported_by' AND n.kind = 'source')
           OR (x.t = 'targeted_by' AND n.kind = 'org')))
       OR (w.kind = 'source' AND x.t = 'reported_by' AND n.kind = 'event')
       OR (w.kind = 'org' AND x.t = 'attributed_to' AND n.kind = 'group')
     )
), best AS (
  SELECT w.path, w.types, w.depth
    FROM walk w
    JOIN graph_entity n ON n.id = w.id
   WHERE n.kind = 'org'
     AND n.props->>'dept' = ANY ($4::text[])
     AND ($2::text IS NULL OR w.id = $2::text)
   ORDER BY w.depth, w.path
   LIMIT 1
)
SELECT b.path, b.types, b.depth,
       COALESCE((
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'id', e.id,
                    'kind', e.kind,
                    'label', CASE WHEN e.kind = 'event'
                                  THEN 'event ' || split_part(e.id, ':', 2)
                                  ELSE e.label END,
                    'props', e.props
                  ) ORDER BY p.ord)
           FROM unnest(b.path) WITH ORDINALITY AS p(id, ord)
           JOIN graph_entity e ON e.id = p.id
       ), '[]'::jsonb) AS nodes
  FROM best b
`;

const EMPTY: AttackPathMatch = {
  found: false,
  hops: 0,
  path: [],
  links: [],
  nodes: [],
  intermediaries: [],
};

/** Shortest path to any NA organization, or to `targetOrgId` when supplied. */
export async function findAttackPath(
  group: string,
  targetOrgId: string | null,
  maxHops: number,
): Promise<AttackPathMatch> {
  const result = await query<PathRow>(SQL, [
    `group:${group}`,
    targetOrgId,
    maxHops,
    [...NA_DEPARTMENTS],
  ]);
  const row = result.rows[0];
  if (!row) return EMPTY;
  return {
    found: true,
    hops: row.depth,
    path: row.path,
    links: row.types.map((type, index) => ({
      source: row.path[index]!,
      target: row.path[index + 1]!,
      type,
    })),
    nodes: row.nodes,
    intermediaries: row.path.slice(1, -1),
  };
}
