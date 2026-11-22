/**
 * GET /api/incident-corroboration/verdicts — publication decision per NA incident.
 *
 * Roadmap 3 ans : name an incident only after a second independent source, or
 * 48 h after the first report with the delay recorded. The response carries
 * truncated victim hashes and timestamps only: no title, no organisation name,
 * no victim detail, nothing that could identify a person.
 */
import type { FastifyInstance } from "fastify";
import {
  corroborateNAIncidents,
  loadCorroborationEvents,
} from "../analyse/incident-corroboration.js";
import {
  PUBLICATION_DELAY_MS,
  publicationVerdicts,
} from "../analyse/incident-corroboration-48h.js";

export default async function incidentCorroborationRoute(app: FastifyInstance) {
  app.get("/incident-corroboration/verdicts", async () => {
    const generatedAt = new Date().toISOString();
    const report = corroborateNAIncidents(await loadCorroborationEvents());
    const verdicts = publicationVerdicts(report, generatedAt);
    return {
      generatedAt,
      delayHours: PUBLICATION_DELAY_MS / 3_600_000,
      summary: verdicts.summary,
      incidents: verdicts.incidents,
    };
  });
}
