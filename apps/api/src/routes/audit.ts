/** Relecture du journal des accès, réservée aux administrateurs. */
import type { FastifyInstance } from "fastify";
import { badRequest } from "../errors.js";
import { requireRole } from "../middleware/auth.js";
import { lireAcces, type DecisionAcces } from "../security/access-log.js";

type Query = { Querystring: Record<string, string | undefined> };

function date(brut: string | undefined, champ: string): string | undefined {
  if (brut === undefined) return undefined;
  const t = Date.parse(brut);
  if (Number.isNaN(t)) throw badRequest(`${champ} invalide`, { champ });
  return new Date(t).toISOString();
}

export default async function (app: FastifyInstance) {
  app.get<Query>("/audit/acces", { preHandler: requireRole("admin") }, async (req) => {
    const q = req.query ?? {};
    if (q.decision && q.decision !== "autorise" && q.decision !== "refuse") {
      throw badRequest("décision invalide", { decision: q.decision }, "DECISION_INCONNUE");
    }
    const limite = q.limite === undefined ? undefined : Number(q.limite);
    const offset = q.offset === undefined ? undefined : Number(q.offset);
    if (limite !== undefined && (!Number.isSafeInteger(limite) || limite <= 0)) {
      throw badRequest("limite invalide");
    }
    if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0)) {
      throw badRequest("offset invalide");
    }
    return lireAcces({
      depuis: date(q.depuis, "depuis"),
      jusqua: date(q.jusqua, "jusqua"),
      acteur: q.acteur,
      decision: q.decision as DecisionAcces | undefined,
      route: q.route,
      correlationId: q.correlationId,
      limite,
      offset,
    });
  });
}
