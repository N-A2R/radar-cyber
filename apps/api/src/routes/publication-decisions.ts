/**
 * GET /api/publication-decisions — journal de la décision de publier (NA).
 *
 * Une décision par incident : nommer, ou refuser sous `publication-risquee`
 * tant que le délai de 48 h court. La réponse ne porte que des empreintes
 * tronquées de victime, des horodatages, des motifs et des compteurs : aucun
 * titre, nom d'organisation ou donnée personnelle. Route en lecture seule.
 */
import type { FastifyInstance } from "fastify";
import {
  corroborateNAIncidents,
  loadCorroborationEvents,
} from "../analyse/incident-corroboration.js";
import { publicationVerdicts } from "../analyse/incident-corroboration-48h.js";
import {
  buildPublicationJournal,
  verifyPublicationJournal,
} from "../analyse/publication-decisions.js";

export default async function publicationDecisionsRoute(app: FastifyInstance) {
  app.get("/publication-decisions", async () => {
    const generatedAt = new Date().toISOString();
    const report = corroborateNAIncidents(await loadCorroborationEvents());
    const journal = buildPublicationJournal(publicationVerdicts(report, generatedAt), generatedAt);
    return {
      generatedAt,
      rule: journal.rule,
      summary: journal.summary,
      chainHead: journal.chainHead,
      verification: verifyPublicationJournal(journal),
      decisions: journal.decisions,
    };
  });
}
