import type { FastifyInstance } from "fastify";
import { query } from "../db.js";

type NodeRow = { id: string; label: string; kind: string }
type LinkRow = { source: string; target: string; type: string }

/**
 * Graphe des organisations réellement touchées sur la fenêtre.
 *
 * Le graphe ne contient que des liens **structurels ou mesurés** :
 * - `rattache` : organisation → département (donnée du référentiel) ;
 * - `has_event` : organisation → famille (rattachement en base).
 *
 * Il n'y a plus de lien `mentions` : il reposait sur
 * `position(lower(o.name) IN lower(e.title))`, soit un produit cartésien
 * 7 535 organisations × tous les événements (22 s mesurées, au-delà du
 * `statement_timeout` de 15 s de l'API) et une fabrique de faux positifs
 * contraire à la règle « rien de faux » du roadmap.
 *
 * Les nœuds sont restreints aux organisations qui ont au moins un événement
 * sur la fenêtre : 7 721 nœuds ne s'affichent pas, 112 se lisent.
 */
export default async function (app: FastifyInstance) {
  app.get("/graph", async (req) => {
    let days = Number((req.query as Record<string, string>).days ?? 90);
    if (!Number.isFinite(days)) days = 90;
    days = Math.min(Math.max(Math.trunc(days), 1), 365);

    const params = [String(days)];

    const nodes = await query<NodeRow>(`
      WITH recent AS (
        SELECT org_id, family FROM event
        WHERE observed_at > now() - ($1 || ' days')::interval
          AND org_id IS NOT NULL
      ),
      active_org AS (SELECT DISTINCT org_id FROM recent)
      SELECT ('org:' || o.id)::text AS id, o.name AS label, 'org' AS kind
      FROM org o JOIN active_org a ON a.org_id = o.id
      UNION
      SELECT DISTINCT ('dept:' || o.dept)::text, o.dept, 'dept'
      FROM org o JOIN active_org a ON a.org_id = o.id
      WHERE o.dept IS NOT NULL AND o.dept <> ''
      UNION
      SELECT DISTINCT ('family:' || family)::text, family, 'family'
      FROM recent
    `, params);

    const links = await query<LinkRow>(`
      WITH recent AS (
        SELECT org_id, family FROM event
        WHERE observed_at > now() - ($1 || ' days')::interval
          AND org_id IS NOT NULL
      ),
      active_org AS (SELECT DISTINCT org_id FROM recent)
      SELECT ('org:' || a.org_id)::text AS source, ('dept:' || o.dept)::text AS target, 'rattache' AS type
      FROM active_org a JOIN org o ON o.id = a.org_id
      WHERE o.dept IS NOT NULL AND o.dept <> ''
      UNION ALL
      SELECT ('org:' || org_id)::text, ('family:' || family)::text, 'has_event'
      FROM recent
      GROUP BY org_id, family
    `, params);

    return { nodes: nodes.rows, links: links.rows };
  });
}
