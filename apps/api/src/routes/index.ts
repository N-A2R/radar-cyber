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
import orgReportRoute from "./org-report.js";
import directoryRoute from "./directory.js";
import naRoute from "./na.js";
import reconnaissanceRoute from "./reconnaissance.js";
import graphRoute from "./graph.js";
import graphTemporalRoute from "./graph-temporal.js";
import graphAsOfRoute from "./graph-as-of.js";
import streamRoute from "./stream.js";
import sourcesRoute from "./sources.js";
import sourcesDashboardRoute from "./sources-dashboard.js";
import sourcesVerificationRoute from "./sources-verification.js";
import statsRoute from "./stats.js";
import searchRoute from "./search.js";
import scanCampaignsRoute from "./scan-campaigns.js";
import askRoute from "./ask.js";
import enrichRoute from "./enrich.js";
import authRoute from "./auth.js";
import alertsRoute from "./alerts.js";
import alertsRssRoute from "./alerts-rss.js";
import quarantineRoute from "./quarantine.js";
import cyberContractsRoute from "./cyber-contracts.js";
import reviewRoute from "./review.js";
import journalRoute from "./journal.js";
import orgsLieesRoute from "./orgs-liees.js";
import orgsLieesHistoriqueRoute from "./orgs-liees-historique.js";
import ingestRoute from "./ingest.js";
import dossierRoute from "./dossier.js";
import rectificationRoute from "./rectification.js";
import auditRoute from "./audit.js";
import onionIndexRoute from "./onion-index.js";
import warcProofsRoute from "./warc-proofs.js";
import confidenceRoute from "./confidence.js";
import actorAttributionsRoute from "./actor-attributions.js";
import ransomwareGroupsRoute from "./ransomware-groups.js";
import organisationRiskRoute from "./organisation-risk.js";
import leaksByDomainRoute from "./leaks-by-domain.js";
import resaleListingsRoute from "./resale-listings.js";
import publicMandatesRoute from "./public-mandates.js";
import thehiveRoute from "./thehive.js";
import technicalCoverageRoute from "./technical-coverage.js";
import naDepartmentsRoute from "./na-departments.js";
import custodyRoute from "./custody.js";
import insuranceScoreRoute from "./insurance-score.js";
import publicDataContainersRoute from "./public-data-containers.js";
import affectedRoute from "./affected.js";
import attestationsNegativesRoute from "./attestations-negatives.js";
import watchlistsRoute from "./watchlists.js";
import exportMispRoute from "./export-misp.js";
import reviewAssistantRoute from "./review-assistant.js";
import providerSpofRoute from "./provider-spof.js";
import attackPathRoute from "./attack-path.js";
import c2ServersRoute from "./c2-servers.js";
import contagionRoute from "./contagion.js";
import dnsPassiveRoute from "./dns-passive.js";
import providersRoute from "./providers.js";
import newExposedServicesRoute from "./exposition-new-services.js";
import earlyWarningRoute from "./early-warning.js";
import siretEstablishmentsRoute from "./siret-establishments.js";
import mapTimelineRoute from "./map-timeline.js";
import hostingOutageRoute from "./hosting-outage.js";
import liveMapRoute from "./live-map.js";

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  for (const route of [
    healthRoute, eventsRoute, historyRoute, healthDetailRoute, healthCausesRoute, collecteMetricsRoute,
    corpusStatsRoute, collectePlanRoute, todayRoute, statsDepartementsRoute, couvertureRoute, flowsRoute,
    orgsRoute, orgReportRoute, directoryRoute, naRoute, reconnaissanceRoute, graphRoute, graphTemporalRoute, graphAsOfRoute,
    streamRoute, sourcesRoute, sourcesDashboardRoute, sourcesVerificationRoute, statsRoute, searchRoute, scanCampaignsRoute, enrichRoute, authRoute,
    alertsRoute, quarantineRoute, reviewRoute, alertsRssRoute, askRoute, journalRoute,
    orgsLieesRoute, orgsLieesHistoriqueRoute, ingestRoute, dossierRoute, rectificationRoute, auditRoute,
    confidenceRoute, actorAttributionsRoute, ransomwareGroupsRoute, organisationRiskRoute, leaksByDomainRoute, resaleListingsRoute, cyberContractsRoute, publicMandatesRoute,
    technicalCoverageRoute, naDepartmentsRoute, onionIndexRoute, thehiveRoute, custodyRoute, insuranceScoreRoute,
    warcProofsRoute,
    mapTimelineRoute,
    hostingOutageRoute,
    liveMapRoute,
    publicDataContainersRoute, affectedRoute, attestationsNegativesRoute, watchlistsRoute, exportMispRoute, reviewAssistantRoute,
    providerSpofRoute, attackPathRoute, providersRoute, newExposedServicesRoute, earlyWarningRoute, siretEstablishmentsRoute,
    c2ServersRoute, contagionRoute, dnsPassiveRoute,
  ]) {
    await app.register(route, { prefix: "/api" });
  }
}
