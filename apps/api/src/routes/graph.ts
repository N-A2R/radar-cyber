import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

type NodeRow = { id: string; label: string; kind: string }
type LinkRow = { source: string; target: string; type: string }

export default async function (app: FastifyInstance) {
  app.get("/graph", async (req) => {
    const days = Math.min(Number((req.query as Record<string, string>).days ?? 90), 365)

    // Nœuds : organisations, départements de rattachement, familles d'événements.
    const nodes = await query<NodeRow>(`
      SELECT ('org:' || o.id)::text AS id, o.name AS label, 'org' AS kind
      FROM org o
      UNION
      SELECT DISTINCT ('dept:' || o.dept)::text AS id, o.dept AS label, 'dept' AS kind
      FROM org o WHERE o.dept IS NOT NULL AND o.dept <> ''
      UNION
      SELECT DISTINCT ('family:' || family)::text AS id, family AS label, 'family' AS kind
      FROM event WHERE observed_at > now() - ($1 || ' days')::interval
    `, [String(days)])

    // Liens structurels (org → département) et documentés (org → famille).
    const links = await query<LinkRow>(`
      SELECT source, target, type FROM (
        SELECT ('org:' || o.id)::text AS source, ('dept:' || o.dept)::text AS target, 'rattache' AS type
        FROM org o WHERE o.dept IS NOT NULL AND o.dept <> ''
        UNION ALL
        SELECT ('org:' || e.org_id)::text AS source, ('family:' || e.family)::text AS target, 'has_event' AS type
        FROM event e
        WHERE e.org_id IS NOT NULL AND e.observed_at > now() - ($1 || ' days')::interval
        GROUP BY e.org_id, e.family
        UNION ALL
        SELECT ('org:' || o.id)::text AS source, ('family:' || e.family)::text AS target, 'mentions' AS type
        FROM event e
        JOIN org o ON length(o.name) >= 6 AND position(lower(o.name) IN lower(e.title)) > 0
        WHERE e.observed_at > now() - ($1 || ' days')::interval
        GROUP BY o.id, e.family
      ) t
    `, [String(days)])

    return { nodes: nodes.rows, links: links.rows }
  })
}
