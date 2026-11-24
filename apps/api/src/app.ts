/**
 * Application HTTP utilisée par les tests d'intégration : même surface que
 * `server.ts` (plugins, auth, routes, documentation, versioning), sans les
 * boucles de collecte ni le `listen`.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { installSecurityHeaders } from "./security/headers.js";
import Fastify, { type FastifyInstance } from "fastify";
import { query } from "./db.js";
import { installErrorHandler } from "./errors.js";
import { installAccessControl, installIdentityResolution } from "./security/rbac.js";
import { installPublicApi } from "./openapi/install.js";
import { LEGACY_PREFIX } from "./openapi/version.js";

import custodyRoute from "./routes/custody.js";
import alertsRoute from "./routes/alerts.js";
import authRoute from "./routes/auth.js";
import rectificationRoute from "./routes/rectification.js";
import auditRoute from "./routes/audit.js";
import couvertureRoute from "./routes/couverture.js";
import directoryRoute from "./routes/directory.js";
import dossierRoute from "./routes/dossier.js";
import enrichRoute from "./routes/enrich.js";
import eventsRoute from "./routes/events.js";
import flowsRoute from "./routes/flows.js";
import graphRoute from "./routes/graph.js";
import healthCausesRoute from "./routes/health-causes.js";
import healthDetailRoute from "./routes/health-detail.js";
import historyRoute from "./routes/history.js";
import ingestRoute from "./routes/ingest.js";
import journalRoute from "./routes/journal.js";
import registreTraitementsRoute from "./routes/registre-traitements.js";
import violationsRgpdRoute from "./routes/violations-rgpd.js";
import keysRoute from "./routes/keys.js";
import naRoute from "./routes/na.js";
import orgsLieesHistoriqueRoute from "./routes/orgs-liees-historique.js";
import orgsLieesRoute from "./routes/orgs-liees.js";
import orgsRoute from "./routes/orgs.js";
import quarantineRoute from "./routes/quarantine.js";
import reviewRoute from "./routes/review.js";
import searchRoute from "./routes/search.js";
import sourcesRoute from "./routes/sources.js";
import sourcesDashboardRoute from "./routes/sources-dashboard.js";
import sourcesVerificationRoute from "./routes/sources-verification.js";
import statsDepartementsRoute from "./routes/stats-departements.js";
import statsRoute from "./routes/stats.js";
import streamRoute from "./routes/stream.js";
import todayRoute from "./routes/today.js";
import exportMispRoute from "./routes/export-misp.js";
import reconnaissanceRoute from "./routes/reconnaissance.js";
import scanCampaignsRoute from "./routes/scan-campaigns.js";
import attestationsNegativesRoute from "./routes/attestations-negatives.js";
import certificatIgnoranceRoute from "./routes/certificat-ignorance.js";
import actorAttributionsRoute from "./routes/actor-attributions.js";
import ransomwareGroupsRoute from "./routes/ransomware-groups.js";
import contagionRoute from "./routes/contagion.js";
import orgReportRoute from "./routes/org-report.js";
import mapTimelineRoute from "./routes/map-timeline.js";
import liveMapRoute from "./routes/live-map.js";

const ROUTES = [
  eventsRoute, historyRoute, healthDetailRoute, healthCausesRoute, todayRoute,
  statsDepartementsRoute, couvertureRoute, flowsRoute, orgsRoute, directoryRoute,
  naRoute, graphRoute, streamRoute, sourcesRoute, sourcesDashboardRoute, sourcesVerificationRoute, statsRoute, searchRoute,
  enrichRoute, authRoute, alertsRoute, quarantineRoute, reviewRoute, journalRoute,
  registreTraitementsRoute,
  violationsRgpdRoute,
  orgsLieesRoute, orgsLieesHistoriqueRoute, ingestRoute, dossierRoute, keysRoute,
  custodyRoute, exportMispRoute,
  orgReportRoute,
  mapTimelineRoute, liveMapRoute,
  // Les mêmes routes que le serveur : une application de test qui en ignore
  // certaines valide une API qui n'existe pas.
  reconnaissanceRoute, scanCampaignsRoute, attestationsNegativesRoute, certificatIgnoranceRoute,
  actorAttributionsRoute, ransomwareGroupsRoute, contagionRoute,
  rectificationRoute,
  auditRoute,
];
/**
 * Composition de sécurité exacte de `server.ts` : les hooks sont installés
 * dans le même ordre, donc les tests d'intégration voient la production.
 */
export async function installApiCore(app: FastifyInstance): Promise<void> {
  installErrorHandler(app);
  // Résolution unique (session + clé) AVANT la matrice : sans cet ordre, une
  // clé valide était refusée par RBAC avant d'être reconnue (C1).
  installIdentityResolution(app);
  installAccessControl(app);
  await installPublicApi(app);
}

const webDist = process.env.RADAR_WEB_DIST ?? fileURLToPath(new URL("../../web/dist", import.meta.url));

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await installApiCore(app);

  const corsOrigins = (process.env.RADAR_CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  await app.register(cors, { origin: corsOrigins.length > 0 ? corsOrigins : false });
  await installSecurityHeaders(app);
  await app.register(rateLimit, { global: false });

  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: "/", wildcard: false });
  }


  app.get("/api/health", async () => {
    const r = await query<{ n: string }>("SELECT count(*)::text AS n FROM source");
    return { ok: true, sources: Number(r.rows[0]?.n ?? 0) };
  });
  for (const route of ROUTES) await app.register(route, { prefix: LEGACY_PREFIX });
  await app.register(exportMispRoute);
  return app;
}
