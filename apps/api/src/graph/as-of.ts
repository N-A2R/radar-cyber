/**
 * Temporal graph queries at any date.
 *
 * One call answers two related questions:
 *   - which relations were valid at `at`;
 *   - which relations opened or closed during the preceding three years.
 *
 * The snapshot uses the generated `graph_relation.period` range and its GiST
 * index; the window aggregation uses the timestamp indexes. Only opaque ids,
 * relation types and timestamps leave this module: entity labels, event titles
 * and victim data are never read.
 */
import { query } from "../db.js";

export const NA_DEPARTMENTS = [
  "16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
  "Charente", "Charente-Maritime", "Correze", "Corrèze", "Creuse", "Dordogne",
  "Gironde", "Landes", "Lot-et-Garonne", "Pyrenees-Atlantiques",
  "Pyrénées-Atlantiques", "Deux-Sevres", "Deux-Sèvres", "Vienne", "Haute-Vienne",
];

export type GraphRelation = {
  source: string;
  target: string;
  type: string;
  validFrom: string;
  validTo: string | null;
};

export type MonthlyChange = { month: string; opened: number; closed: number };

export type GraphAsOfResult = {
  at: string;
  window: { from: string; to: string; years: number } | null;
  summary: {
    returnedRelations: number;
    changes: number | null;
    opened: number | null;
    closed: number | null;
    monthlyChanges: MonthlyChange[];
  };
  relations: GraphRelation[];
};

export type AsOfQuery = {
  at: string;
  windowYears?: number;
  type?: string;
  node?: string;
  limit: number;
};

type Scope = { sql: string; params: unknown[]; next: number };

/**
 * The projection already excludes organizations outside Nouvelle-Aquitaine.
 * If a writer added one anyway, its id is filtered here as a small parameter
 * array rather than by a per-row subquery, which keeps large scans fast.
 */
async function outsideOrgIds(): Promise<string[]> {
  const result = await query<{ id: string }>(
    `SELECT id FROM graph_entity
      WHERE kind = 'org' AND props ? 'dept'
        AND NOT (props ->> 'dept' = ANY($1::text[]))`,
    [NA_DEPARTMENTS],
  );
  return result.rows.map((row) => row.id);
}

function buildScope(input: AsOfQuery, outside: string[], first: number): Scope {
  const params: unknown[] = [];
  let index = first;
  const clauses: string[] = [];
  if (outside.length > 0) {
    params.push(outside);
    const blocked = `$${index++}::text[]`;
    clauses.push(`NOT (r.source_id = ANY(${blocked}))`);
    clauses.push(`NOT (r.target_id = ANY(${blocked}))`);
  }
  if (input.type) {
    params.push(input.type);
    clauses.push(`r.type = $${index++}`);
  }
  if (input.node) {
    params.push(input.node);
    const node = `$${index++}`;
    clauses.push(`(r.source_id = ${node} OR r.target_id = ${node})`);
  }
  return { sql: clauses.join("\n      AND ") || "TRUE", params, next: index };
}

async function snapshotEdges(
  at: string,
  input: AsOfQuery,
  outside: string[],
): Promise<GraphRelation[]> {
  const scope = buildScope(input, outside, 2);
  const limit = `$${scope.next}::int`;
  const result = await query<GraphRelation>(
    `SELECT r.source_id AS source, r.target_id AS target, r.type,
            r.valid_from AS "validFrom", r.valid_to AS "validTo"
       FROM graph_relation r
      WHERE r.period @> $1::timestamptz
        AND ${scope.sql}
      ORDER BY r.valid_from DESC, r.id DESC
      LIMIT ${limit}`,
    [at, ...scope.params, input.limit],
  );
  return result.rows.map((row) => ({
    ...row,
    validFrom: new Date(row.validFrom).toISOString(),
    validTo: row.validTo === null ? null : new Date(row.validTo).toISOString(),
  }));
}

async function monthlyChanges(
  from: string,
  until: string,
  input: AsOfQuery,
  outside: string[],
): Promise<MonthlyChange[]> {
  const openedScope = buildScope(input, outside, 3);
  const closedScope = buildScope(input, outside, openedScope.next);
  const result = await query<MonthlyChange>(
    `SELECT to_char(month, 'YYYY-MM') AS month,
            sum(opened)::int AS opened,
            sum(closed)::int AS closed
       FROM (
         SELECT date_trunc('month', r.valid_from) AS month,
                count(*)::int AS opened, 0::int AS closed
           FROM graph_relation r
          WHERE r.valid_from >= $1::timestamptz AND r.valid_from < $2::timestamptz
            AND ${openedScope.sql}
          GROUP BY 1
         UNION ALL
         SELECT date_trunc('month', r.valid_to) AS month,
                0::int AS opened, count(*)::int AS closed
           FROM graph_relation r
          WHERE r.valid_to >= $1::timestamptz AND r.valid_to < $2::timestamptz
            AND ${closedScope.sql}
          GROUP BY 1
       ) changes
      GROUP BY month ORDER BY month`,
    [from, until, ...openedScope.params, ...closedScope.params],
  );
  return result.rows;
}

/** Runs the same queries used by GET /api/graph/as-of. */
export async function queryGraphAsOf(input: AsOfQuery): Promise<GraphAsOfResult> {
  const at = new Date(input.at).toISOString();
  let from: string | undefined;
  if (input.windowYears) {
    const start = new Date(at);
    start.setUTCFullYear(start.getUTCFullYear() - input.windowYears);
    from = start.toISOString();
  }
  const outside = await outsideOrgIds();

  const [relations, months] = await Promise.all([
    snapshotEdges(at, input, outside),
    from ? monthlyChanges(from, at, input, outside) : Promise.resolve([]),
  ]);
  const opened = from ? months.reduce((sum, month) => sum + month.opened, 0) : null;
  const closed = from ? months.reduce((sum, month) => sum + month.closed, 0) : null;

  return {
    at,
    window: from ? { from, to: at, years: input.windowYears! } : null,
    summary: {
      returnedRelations: relations.length,
      changes: opened !== null && closed !== null ? opened + closed : null,
      opened,
      closed,
      monthlyChanges: months,
    },
    relations,
  };
}
