/**
 * Registre unique des routes API.
 *
 * Le serveur et le test de couverture des règles d'accès utilisent la même
 * fonction : une route ajoutée ici sans règle dans `POLITIQUE_ACCES` fait
 * échouer la suite, au lieu d'être exposée par défaut.
 */
import type { FastifyInstance } from "fastify";
import healthRoute from "./health.js";
import eventsRoute from "./events.js";
import historyRoute from "./history.js";
import healthDetailRoute from "./health-detail.js";
import healthCausesRoute from "./health-causes.js";
import collecteMetricsRoute from "./collecte-metrics.js";
import corpusStatsRoute from "./corpus-stats.js";
import collectePlanRoute from "./collecte-plan.js";
import todayRoute from "./today.js";
import statsDepartementsRoute from "./stats-departements.js";
import couvertureRoute from "./couverture.js";
import flowsRoute from "./flows.js";
import orgsRoute from "./orgs.js";
import directoryRoute from "./directory.js";
import naRoute from "./na.js";
import graphRoute from "./graph.js";
import graphTemporalRoute from "./graph-temporal.js";
import streamRoute from "./stream.js";
import sourcesRoute from "./sources.js";
import statsRoute from "./stats.js";
import searchRoute from "./search.js";
import enrichRoute from "./enrich.js";
import authRoute from "./auth.js";
import alertsRoute from "./alerts.js";
import quarantineRoute from "./quarantine.js";
import reviewRoute from "./review.js";
import journalRoute from "./journal.js";
import orgsLieesRoute from "./orgs-liees.js";
import orgsLieesHistoriqueRoute from "./orgs-liees-historique.js";
import ingestRoute from "./ingest.js";
import dossierRoute from "./dossier.js";
import rectificationRoute from "./rectification.js";
import auditRoute from "./audit.js";
import onionIndexRoute from "./onion-index.js";
import confidenceRoute from "./confidence.js";
import leaksByDomainRoute from "./leaks-by-domain.js";
import publicMandatesRoute from "./public-mandates.js";
import reconnaissanceRoute from "./reconnaissance.js";

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  for (const route of [
    healthRoute, eventsRoute, historyRoute, healthDetailRoute, healthCausesRoute,
    collecteMetricsRoute, corpusStatsRoute, collectePlanRoute,
    todayRoute, statsDepartementsRoute, couvertureRoute, flowsRoute, orgsRoute,
    directoryRoute, naRoute, graphRoute, graphTemporalRoute, streamRoute, sourcesRoute, statsRoute,
    searchRoute, enrichRoute, authRoute, alertsRoute, quarantineRoute, reviewRoute,
    journalRoute, orgsLieesRoute, orgsLieesHistoriqueRoute, ingestRoute, dossierRoute,
    rectificationRoute, auditRoute,
    confidenceRoute,
    leaksByDomainRoute,
    publicMandatesRoute,
    onionIndexRoute,
    reconnaissanceRoute,
  ]) {
    await app.register(route, { prefix: "/api" });
  }
}
