/**
 * GET /api/source-primaire — contrainte juridique n°1 de la roadmap 3 ans.
 *
 * Une décision de publier par incident NA, avec le lien public de l'éditeur qui
 * affirme l'incident. Sans ce lien, la décision est anonymisée et refusée sous
 * `source-primaire-manquante`, même si le délai de 48 h est écoulé. Lecture
 * seule : ni écriture, ni réseau, ni donnée personnelle, ni titre d'incident.
 */
import type { FastifyInstance } from "fastify";
import {
  corroborateNAIncidents,
  loadCorroborationEvents,
} from "../analyse/incident-corroboration.js";
import { publicationVerdicts } from "../analyse/incident-corroboration-48h.js";
import {
  REFUS_SOURCE_MANCANTE,
  buildPublicationJournal,
  verifyPublicationJournal,
} from "../analyse/publication-decisions.js";
import { sourcesParIncident } from "../analyse/source-primaire.js";

export default async function sourcePrimaireRoute(app: FastifyInstance) {
  app.get("/source-primaire", async () => {
    const generatedAt = new Date().toISOString();
    const events = await loadCorroborationEvents();
    const report = corroborateNAIncidents(events);
    const sources = sourcesParIncident(events, report);
    const journal = buildPublicationJournal(publicationVerdicts(report, generatedAt), generatedAt, sources);
    return {
      generatedAt,
      motifRefus: REFUS_SOURCE_MANCANTE,
      summary: journal.summary,
      chainHead: journal.chainHead,
      verification: verifyPublicationJournal(journal),
      decisions: journal.decisions,
    };
  });
}
