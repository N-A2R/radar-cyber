/**
 * Construction de l'application HTTP, sans boucle de collecte ni écoute.
 * `server.ts` n'ajoute que les tâches de fond et le `listen` ; les tests
 * utilisent `buildApp()` avec `app.inject()` sur la même configuration.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance } from "fastify";
import { query } from "./db.js";
import { consumeApiKey, resolveApiKey } from "./api-key.js";
import { installErrorHandler, unauthorized, forbidden } from "./errors.js";
import { resolveUser } from "./middleware/auth.js";
import { rateLimit as slidingRateLimit } from "./middleware/rate-limit.js";
import { buildOpenApi, documentedRouteCount } from "./openapi/spec.js";
import { API_VERSION, CURRENT_PREFIX, LEGACY_PREFIX, withoutVersion } from "./openapi/version.js";

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

const ROUTES = [
  eventsRoute, historyRoute, healthDetailRoute, healthCausesRoute, todayRoute,
  statsDepartementsRoute, couvertureRoute, flowsRoute, orgsRoute, directoryRoute,
  naRoute, graphRoute, streamRoute, sourcesRoute, statsRoute, searchRoute,
  enrichRoute, authRoute, alertsRoute, quarantineRoute, reviewRoute, journalRoute,
  orgsLieesRoute, orgsLieesHistoriqueRoute, ingestRoute, dossierRoute, keysRoute,
];

const OPEN_READ_RPM = Number(process.env.RADAR_PUBLIC_READ_RPM ?? 120);
const SESSION_READ_RPM = Number(process.env.RADAR_SESSION_READ_RPM ?? 600);

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  installErrorHandler(app);

  const corsOrigins = (process.env.RADAR_CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  await app.register(cors, { origin: corsOrigins.length > 0 ? corsOrigins : false });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(fastifyRateLimit, { global: false });

  const webDist = process.env.RADAR_WEB_DIST ?? fileURLToPath(new URL("../../web/dist", import.meta.url));
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: "/", wildcard: false });
  } else {
    app.log.warn(`front statique absent (${webDist}) : pnpm -F @radar/web build`);
  }

  // Limites de lecture sans clé : adresse IP pour le public, utilisateur pour
  // les sessions. Les clés ont leur propre quota persisté en base.
  const anonymousRead = slidingRateLimit({ max: OPEN_READ_RPM, windowMs: 60_000 });
  const sessionRead = slidingRateLimit({ max: SESSION_READ_RPM, windowMs: 60_000 });

  app.addHook("onRequest", async (req, reply) => {
    const url = req.url.split("?")[0] ?? "";
    if (!url.startsWith("/api/")) return;
    const path = withoutVersion(url);
    reply.header("X-API-Version", API_VERSION);
    // Santé, authentification et documentation ne consomment pas de quota.
    if (path === "/health" || path.startsWith("/auth/") || path.startsWith("/docs")) return;

    const user = await resolveUser(req);
    const apiKey = await resolveApiKey(req);
    if (apiKey) {
      req.apiKey = apiKey;
      await consumeApiKey(apiKey);
      if (req.method !== "GET" && apiKey.scope !== "write") {
        throw forbidden("api key is read-only");
      }
      if (req.method !== "GET" && !user) req.user = apiKey.owner;
    } else if (req.method === "GET") {
      await (user ? sessionRead : anonymousRead)(req, reply);
    }
    if (user) req.user = user;
    if (req.method !== "GET" && !req.user) throw unauthorized();
  });

  const health = async () => {
    const r = await query<{ n: string }>("SELECT count(*)::text AS n FROM source");
    return { ok: true, sources: Number(r.rows[0]?.n ?? 0) };
  };

  for (const prefix of [CURRENT_PREFIX, LEGACY_PREFIX]) {
    app.get(`${prefix}/health`, health);
    for (const route of ROUTES) await app.register(route, { prefix });
  }

  const spec = buildOpenApi();
  await app.register(swagger, { mode: "static", specification: { document: spec } });
  await app.register(swaggerUi, { routePrefix: "/api/docs", uiConfig: { docExpansion: "list" } });

  // GET /api/docs répond 200 ; l'UI vit sur /api/docs/ et le JSON sur /api/docs/json.
  app.get("/api/docs", (_req, reply) => {
    reply.type("text/html; charset=utf-8").send(
      '<!doctype html><meta charset="utf-8"><title>Radar Cyber API</title>' +
      `<p>API v${API_VERSION} — ${documentedRouteCount(spec)} routes documentées. ` +
      '<a href="/api/docs/">Ouvrir Swagger UI</a> · ' +
      '<a href="/api/openapi.json">Spec JSON</a></p>' +
      '<meta http-equiv="refresh" content="0; url=/api/docs/">',
    );
  });
  app.get("/api/openapi.json", (_req, reply) => reply.type("application/json").send(spec));
  app.get("/api/v1/openapi.json", (_req, reply) => reply.type("application/json").send(spec));
  return app;
}
