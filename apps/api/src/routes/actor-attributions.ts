/**
 * GET /api/actor-attributions — actor labels attributed to tracked groups.
 *
 * The payload contains actor names, public group names, aggregate counts and
 * confidence. It never contains a claim hint, a victim name or any other
 * person-level data.
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

const SQL_TOTALS = `
  SELECT count(*)::int AS total,
         count(*) FILTER (WHERE level = 'high')::int AS high,
         count(*) FILTER (WHERE level = 'medium')::int AS medium,
         count(*) FILTER (WHERE level = 'low')::int AS low,
         COALESCE(round(avg(confidence)::numeric, 1), 0)::float8 AS average_confidence
    FROM actor_group_attribution
`;

const SQL_BY_METHOD = `
  SELECT method, count(*)::int AS total
    FROM actor_group_attribution
   GROUP BY method
   ORDER BY method
`;

const SQL_ROWS = `
  SELECT actor, group_slug AS "groupSlug", group_name AS "groupName",
         confidence, level, method, sources, claims
    FROM actor_group_attribution
   ORDER BY confidence DESC, actor ASC
`;

type TotalsRow = { total: number; high: number; medium: number; low: number; average_confidence: number };
type MethodRow = { method: string; total: number };
type AttributionRow = {
  actor: string;
  groupSlug: string;
  groupName: string;
  confidence: number;
  level: string;
  method: string;
  sources: number;
  claims: number;
};

export default async function actorAttributionsRoute(app: FastifyInstance): Promise<void> {
  app.get("/actor-attributions", async () => {
    const [totals, methods, rows] = await Promise.all([
      query<TotalsRow>(SQL_TOTALS),
      query<MethodRow>(SQL_BY_METHOD),
      query<AttributionRow>(SQL_ROWS),
    ]);
    const t = totals.rows[0]!;
    return {
      total: t.total,
      byLevel: { high: t.high, medium: t.medium, low: t.low },
      byMethod: Object.fromEntries(methods.rows.map((row) => [row.method, row.total])),
      averageConfidence: t.average_confidence,
      attributions: rows.rows,
    };
  });
}
