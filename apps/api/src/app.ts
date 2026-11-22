/**
 * Application HTTP utilisée par les tests d'intégration : même surface que
 * `server.ts` (plugins, auth, routes, documentation, versioning), sans les
 * boucles de collecte ni le `listen`.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { query } from "./db.js";
import { installErrorHandler, unauthorized } from "./errors.js";
import { resolveUser } from "./middleware/auth.js";
import { installPublicApi } from "./openapi/install.js";
import { LEGACY_PREFIX } from "./openapi/version.js";

import custodyRoute from "./routes/custody.js";
import alertsRoute from "./routes/alerts.js";
import authRoute from "./routes/auth.js";
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
import keysRoute from "./routes/keys.js";
import naRoute from "./routes/na.js";
import orgsLieesHistoriqueRoute from "./routes/orgs-liees-historique.js";
import orgsLieesRoute from "./routes/orgs-liees.js";
import orgsRoute from "./routes/orgs.js";
import quarantineRoute from "./routes/quarantine.js";
import reviewRoute from "./routes/review.js";
import searchRoute from "./routes/search.js";
import sourcesRoute from "./routes/sources.js";
import statsDepartementsRoute from "./routes/stats-departements.js";
import statsRoute from "./routes/stats.js";
import streamRoute from "./routes/stream.js";
import todayRoute from "./routes/today.js";
import exportMispRoute from "./routes/export-misp.js";
import reconnaissanceRoute from "./routes/reconnaissance.js";
import scanCampaignsRoute from "./routes/scan-campaigns.js";
import attestationsNegativesRoute from "./routes/attestations-negatives.js";
import actorAttributionsRoute from "./routes/actor-attributions.js";
import ransomwareGroupsRoute from "./routes/ransomware-groups.js";

const ROUTES = [
  eventsRoute, historyRoute, healthDetailRoute, healthCausesRoute, todayRoute,
  statsDepartementsRoute, couvertureRoute, flowsRoute, orgsRoute, directoryRoute,
  naRoute, graphRoute, streamRoute, sourcesRoute, statsRoute, searchRoute,
  enrichRoute, authRoute, alertsRoute, quarantineRoute, reviewRoute, journalRoute,
  orgsLieesRoute, orgsLieesHistoriqueRoute, ingestRoute, dossierRoute, keysRoute,
  custodyRoute, exportMispRoute,
  // Les mêmes routes que le serveur : une application de test qui en ignore
  // certaines valide une API qui n'existe pas.
  reconnaissanceRoute, scanCampaignsRoute, attestationsNegativesRoute,
  actorAttributionsRoute, ransomwareGroupsRoute,
];
const PUBLIC_READ = /^\/api\/(?:v1\/)?(health|stats|sources|flows|search|directory|graph|stream|events|history|orgs|enrich|alerts|quarantine|dossier|healthz|na|today|couverture|custody|export|docs|openapi\.json|auth|reconnaissance|scan|attestations-negatives|actor-attributions)(\/|$|\?)/;

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  installErrorHandler(app);
  await installPublicApi(app);

  const corsOrigins = (process.env.RADAR_CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  await app.register(cors, { origin: corsOrigins.length > 0 ? corsOrigins : false });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { global: false });

  const webDist = process.env.RADAR_WEB_DIST ?? fileURLToPath(new URL("../../web/dist", import.meta.url));
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: "/", wildcard: false });
  }

  app.addHook("onRequest", async (req) => {
    const url = req.url.split("?")[0] ?? "";
    if (!url.startsWith("/api/")) return;
    if (url === "/api/health" || url.startsWith("/api/auth/")) return;
    const user = req.user ?? await resolveUser(req);
    if (req.method !== "GET" || !PUBLIC_READ.test(url)) {
      if (!user) throw unauthorized();
    }
    if (user) req.user = user;
  });

  app.get("/api/health", async () => {
    const r = await query<{ n: string }>("SELECT count(*)::text AS n FROM source");
    return { ok: true, sources: Number(r.rows[0]?.n ?? 0) };
  });
  for (const route of ROUTES) await app.register(route, { prefix: LEGACY_PREFIX });
  await app.register(exportMispRoute);
  return app;
}
