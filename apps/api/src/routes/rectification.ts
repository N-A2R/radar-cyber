/**
 * Routes du droit de réponse.
 *
 * organisation doit pouvoir demander une rectification sans posséder de
 * compte. L'instruction et la publication sont réservées, et toute décision
 * passe par le domaine, qui écrit l'événement et le journal dans la même
 * transaction.
 */
import type { FastifyInstance } from "fastify";
import { badRequest, notFound } from "../errors.js";
import { requireRole, resolveUser } from "../middleware/auth.js";
import {
  creerDemande, deciderDemande, DemandeRectificationSchema, DecisionRectificationSchema,
  lireDemande, listerDemandes, publieesPourOrg, STATUTS, type StatutRectification,
} from "../domain/rectification.js";

type IdParams = { Params: { id: string } };
type ListeQuery = { Querystring: Record<string, string | undefined> };

function identifiant(brut: string | undefined): number {
  if (!brut || !/^\d+$/.test(brut)) throw badRequest("identifiant invalide");
  const id = Number(brut);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest("identifiant invalide");
  return id;
}

function detailsValidation(issues: { path: readonly unknown[]; message: string }[]) {
  return issues.map((issue) => ({ champ: issue.path.map(String).join("."), message: issue.message }));
}


export default async function (app: FastifyInstance) {
  app.post(
    "/rectifications",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const parsed = DemandeRectificationSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw badRequest("demande invalide", detailsValidation(parsed.error.issues), "DEMANDE_INVALIDE");
      }
      const demande = await creerDemande(parsed.data, { user: req.user ?? null, ip: req.ip });
      reply.code(202);
      return {
        id: demande.id,
        reference: demande.reference,
        statut: demande.statut,
        createdAt: demande.createdAt,
        prochaineEtape: "Instruction sous 30 jours. Rien n'est publié automatiquement.",
      };
    },
  );

  app.get<ListeQuery>("/rectifications", { preHandler: requireRole("analyste") }, async (req) => {
    const q = req.query ?? {};
    const statut = q.statut;
    if (statut && !STATUTS.includes(statut as StatutRectification)) {
      throw badRequest("statut inconnu", { statut, attendus: STATUTS }, "STATUT_INCONNU");
    }
    const orgId = q.orgId === undefined ? undefined : identifiant(q.orgId);
    const limite = q.limite === undefined ? undefined : identifiant(q.limite);
    const offsetBrut = q.offset;
    if (offsetBrut !== undefined && !/^\d+$/.test(offsetBrut)) throw badRequest("offset invalide");
    return listerDemandes({
      statut: statut as StatutRectification | undefined,
      orgId,
      limite,
      offset: offsetBrut === undefined ? undefined : Number(offsetBrut),
    });
  });

  app.get<IdParams>("/rectifications/:id", { preHandler: requireRole("analyste") }, async (req) => {
    return lireDemande(identifiant(req.params.id));
  });

  app.post<IdParams>(
    "/rectifications/:id/decision",
    { preHandler: requireRole("admin") },
    async (req) => {
      const id = identifiant(req.params.id);
      const parsed = DecisionRectificationSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw badRequest("décision invalide", detailsValidation(parsed.error.issues), "DECISION_INVALIDE");
      }
      // La matrice globale a déjà identifié l'administrateur ; resolveUser
      // garde la route utilisable seule dans les tests de composant.
      const user = req.user ?? (await resolveUser(req));
      if (!user) throw notFound("administrateur absent");
      const demande = await deciderDemande(id, parsed.data, user);
      return {
        id: demande.id,
        reference: demande.reference,
        statut: demande.statut,
        historique: demande.historique,
      };
    },
  );

  /** Lecture depuis la fiche : uniquement les réponses publiées. */
  app.get<IdParams>("/orgs/:id/rectifications", async (req) => {
    return publieesPourOrg(identifiant(req.params.id));
  });
}
