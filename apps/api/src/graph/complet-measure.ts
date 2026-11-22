/**
 * Reproducible measurement of the complete Nouvelle-Aquitaine graph.
 *
 * Both counters read the `graph_complet_edge` view defined in migration 064.
 * They are the only source of the published edge figure.
 */
import { ingestQuery } from "../db.js";

export const EDGE_COUNT_SQL = "SELECT count(*)::text AS edges FROM graph_complet_edge";

export const TYPE_COUNT_SQL =
  "SELECT type, count(*)::text AS edges FROM graph_complet_edge GROUP BY type ORDER BY count(*) DESC";

type CountRow = { edges: string };
type TypeCountRow = { type: string; edges: string };

/** Full edge count plus per-type breakdown, read from the live projection. */
export async function measureCompleteGraph(): Promise<{
  edges: number;
  byType: Record<string, number>;
  measuredAt: string;
  sql: string[];
}> {
  const [totals, types] = await Promise.all([
    ingestQuery<CountRow>(EDGE_COUNT_SQL),
    ingestQuery<TypeCountRow>(TYPE_COUNT_SQL),
  ]);
  return {
    edges: Number(totals.rows[0]?.edges ?? 0),
    byType: Object.fromEntries(types.rows.map((row) => [row.type, Number(row.edges)])),
    measuredAt: new Date().toISOString(),
    sql: [EDGE_COUNT_SQL, TYPE_COUNT_SQL],
  };
}
