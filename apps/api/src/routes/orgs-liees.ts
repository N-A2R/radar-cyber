/**
 * Compteurs « organisations reliées » affichés en tête de l'écran Aujourd'hui.
 *
 * Une seule requête, lue en base, avec les mêmes définitions que les routes
 * existantes — aucune règle de comptage inventée ici :
 *  - `semaine`   : `count(DISTINCT org_id)` sur `event` sur 7 jours, comme
 *                  `compteurs.organisations7j` de GET /today (date COALESCE) ;
 *  - `total`     : `quarantine_raw WHERE promoted=true`, comme `promues` de
 *                  GET /review/stats ;
 *  - `enAttente` : la predicate `pending` exacte de GET /review/stats ;
 *  - `examinees` : sujets distincts de `journal` avec `kind='review.decided'`,
 *                  base des deux comptes `acceptees` / `refusees` de stats ;
 *  - `parDepartement` : département de l'organisation rattachée aux événements
 *                  de la même fenêtre de 7 jours (top 5, département connu ou
 *                  « non renseigné »).
 *
 * Lecture authentifiée : les compteurs de revue tombent sous la même garde que
 * GET /review/stats.
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

type OrgsLieesRow = {
  semaine: number;
  total: number;
  enAttente: number;
  examinees: number;
  parDepartement: { dept: string; n: number }[];
};

export default async function (app: FastifyInstance) {
  app.get("/orgs/liees", { preHandler: requireAuth() }, async () => {
    const r = await query<OrgsLieesRow>(
      `WITH recentes AS (
         SELECT org_id FROM event
          WHERE org_id IS NOT NULL
            AND COALESCE(observed_at, collected_at) >= now() - interval '7 days'
       ),
       departements AS (
         SELECT COALESCE(NULLIF(btrim(o.dept), ''), 'non renseigné') AS dept,
                count(DISTINCT r.org_id)::int AS n
           FROM recentes r LEFT JOIN org o ON o.id = r.org_id
          GROUP BY 1
       )
       SELECT
         (SELECT count(DISTINCT org_id)::int FROM recentes) AS semaine,
         (SELECT count(*)::int FROM quarantine_raw WHERE promoted=true) AS total,
         (SELECT count(*)::int FROM quarantine_raw
           WHERE kind='claim' AND status='pending' AND promoted=false
             AND org_hint IS NOT NULL AND btrim(org_hint) <> '') AS "enAttente",
         (SELECT count(DISTINCT subject)::int FROM journal
           WHERE kind='review.decided') AS examinees,
         COALESCE((
           SELECT json_agg(json_build_object('dept', d.dept, 'n', d.n)
                           ORDER BY d.n DESC, d.dept)
             FROM (SELECT dept, n FROM departements ORDER BY n DESC, dept LIMIT 5) d
         ), '[]'::json) AS "parDepartement"`,
    );
    const row = r.rows[0];
    return {
      semaine: Number(row?.semaine ?? 0),
      total: Number(row?.total ?? 0),
      enAttente: Number(row?.enAttente ?? 0),
      examinees: Number(row?.examinees ?? 0),
      parDepartement: Array.isArray(row?.parDepartement) ? row.parDepartement : [],
    };
  });
}
