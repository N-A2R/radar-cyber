import type { FastifyInstance } from "fastify";
import type { AlerteSupervision, CycleCollecte, ResumeCollecte } from "../collecte/supervision.js";
import { lireAlertes, lireCycles, lireResume } from "../collecte/supervision.js";

export type CollecteMetrics = {
  generatedAt: string;
  fenetreHeures: 24;
  resume: ResumeCollecte;
  cycles: CycleCollecte[];
  alertes: AlerteSupervision[];
};

/** État de la collecte : résumé 24 h, historique des cycles et alertes de revue. */
export default async function (app: FastifyInstance) {
  app.get("/collecte/metrics", async (req) => {
    const q = req.query as { limit?: string };
    const brut = Number(q.limit ?? 20);
    const limit = Number.isFinite(brut) ? Math.min(Math.max(Math.trunc(brut), 1), 100) : 20;
    const [resume, cycles, alertes] = await Promise.all([
      lireResume(),
      lireCycles(limit),
      lireAlertes(limit),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      fenetreHeures: 24,
      resume,
      cycles,
      alertes,
    } satisfies CollecteMetrics;
  });
}
