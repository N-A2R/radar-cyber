import { badRequest } from "../errors.js";
/**
 * Historique des compteurs « organisations reliées ».
 *
 * GET /api/orgs/liees/historique?jours=30 lit les relevés quotidiens écrits
 * par `enregistrer_orgs_liees()` (voir migrate-044). Route en lecture seule :
 * aucun point n'est inventé quand la table est vide — la carte n'affiche
 * alors aucune courbe.
 */
import type { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

type PointRow = {
  jour: string;
  semaine: number;
  total: number;
  enAttente: number;
  examinees: number;
};

const JOURS_DEFAUT = 30;
const JOURS_MAX = 365;

export default async function (app: FastifyInstance) {
  app.get(
    "/orgs/liees/historique",
    { preHandler: requireAuth() },
    async (req, reply) => {
      const brut = req.query as Record<string, string | string[] | undefined>;
      const valeur = Array.isArray(brut.jours) ? brut.jours[0] : brut.jours;
      const jours = valeur === undefined ? JOURS_DEFAUT : Number(valeur);
      if (!Number.isInteger(jours) || jours < 1 || jours > JOURS_MAX) {
        throw badRequest("jours doit être un entier entre 1 et 365");
      }

      const r = await query<PointRow>(
        `SELECT jour::text AS jour, semaine, total,
                en_attente AS "enAttente", examinees
           FROM orgs_liees_historique
          WHERE jour >= current_date - ($1::int - 1)
          ORDER BY jour`,
        [jours],
      );

      return {
        jours,
        points: r.rows.map((p) => ({
          jour: p.jour,
          semaine: Number(p.semaine),
          total: Number(p.total),
          enAttente: Number(p.enAttente),
          examinees: Number(p.examinees),
        })),
      };
    },
  );
}
