/**
 * Complete Nouvelle-Aquitaine knowledge graph (read-only).
 *
 * GET /api/graph/complet
 *   ?type=located_in          only one edge type
 *   ?node=org:123             ego network, source OR target
 *   ?kind=ip                  only edges whose target is an ip: node
 *   ?limit=100&offset=0       bounded traversal (max 1000)
 *   ?stats=true               add total edge count and per-type breakdown
 *
 * Edges come from the `graph_complet_edge` view (migration 064). Every node is
 * an opaque identifier: no organisation name, event title or victim field is
 * ever selected, so the response cannot leak personal data.
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { TYPE_COUNT_SQL } from "../graph/complet-measure.js";

type EdgeRow = {
  source_id: string;
  target_id: string;
  type: string;
  evidence: Record<string, unknown> | null;
};

type CountRow = { edges: string };
type TypeCountRow = { type: string; edges: string };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/** Repeated query-param normalisation: arrays collapse to their first value. */
function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function (app: FastifyInstance) {
  app.get("/graph/complet", async (req, reply) => {
    const raw = req.query as Record<string, string | string[] | undefined>;
    let limit = DEFAULT_LIMIT;
    let offset = 0;
    let stats = false;
    try {
      const askedLimit = single(raw.limit);
      const askedOffset = single(raw.offset);
      limit = askedLimit === undefined ? DEFAULT_LIMIT : Number(askedLimit);
      offset = askedOffset === undefined ? 0 : Number(askedOffset);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw new Error(`limit must be an integer between 1 and ${MAX_LIMIT}`);
      }
      if (!Number.isInteger(offset) || offset < 0) {
        throw new Error("offset must be a non-negative integer");
      }
      stats = single(raw.stats) === "true";
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "invalid query" });
    }

    const type = single(raw.type)?.trim() || undefined;
    const node = single(raw.node)?.trim() || undefined;
    const kind = single(raw.kind)?.trim() || undefined;

    const params: unknown[] = [];
    const conditions: string[] = [];
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }
    if (node) {
      params.push(node);
      conditions.push(`(source_id = $${params.length} OR target_id = $${params.length})`);
    }
    if (kind) {
      params.push(`${kind}:%`);
      conditions.push(`target_id LIKE $${params.length}`);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

    params.push(limit, offset);
    const edgesResult = await query<EdgeRow>(
      `SELECT source_id, target_id, type, evidence
         FROM graph_complet_edge${where}
        ORDER BY type, source_id, target_id
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const ids = new Set<string>();
    for (const edge of edgesResult.rows) {
      ids.add(edge.source_id);
      ids.add(edge.target_id);
    }

    let total: number | undefined;
    let byType: Record<string, number> | undefined;
    if (stats) {
      const [totals, types] = await Promise.all([
        query<CountRow>("SELECT count(*)::text AS edges FROM graph_complet_edge"),
        query<TypeCountRow>(TYPE_COUNT_SQL),
      ]);
      total = Number(totals.rows[0]?.edges ?? 0);
      byType = Object.fromEntries(types.rows.map((row) => [row.type, Number(row.edges)]));
    }

    return {
      edges: edgesResult.rows.map((edge) => ({
        source: edge.source_id,
        target: edge.target_id,
        type: edge.type,
        ...(edge.evidence && Object.keys(edge.evidence).length > 0
          ? { evidence: edge.evidence }
          : {}),
      })),
      nodes: [...ids].map((id) => ({ id, kind: id.slice(0, id.indexOf(":")) || "unknown" })),
      meta: {
        type: type ?? null,
        node: node ?? null,
        kind: kind ?? null,
        limit,
        offset,
        returned: edgesResult.rows.length,
        ...(total === undefined ? {} : { total, byType }),
      },
    };
  });
}
