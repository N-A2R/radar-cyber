/**
 * Surface HTTP publique ajoutée à l'application existante : documentation,
 * versioning, clés d'API et quota. Cette fonction est appelée par `server.ts`
 * avant le garde-fou d'authentification historique, et par `buildApp()` dans
 * les tests : une seule définition pour la production et les tests.
 */
import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { query } from "../db.js";
import { consumeApiKey, resolveApiKey } from "../api-key.js";
import { forbidden, unauthorized } from "../errors.js";
import { resolveUser } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { buildOpenApi, documentedRouteCount } from "./spec.js";
import { API_VERSION, CURRENT_PREFIX, withoutVersion } from "./version.js";
import { STABILITY } from "./stability.js";

import alertsRoute from "../routes/alerts.js";
import custodyRoute from "../routes/custody.js";
import authRoute from "../routes/auth.js";
import couvertureRoute from "../routes/couverture.js";
import directoryRoute from "../routes/directory.js";
import dossierRoute from "../routes/dossier.js";
import enrichRoute from "../routes/enrich.js";
import eventsRoute from "../routes/events.js";
import flowsRoute from "../routes/flows.js";
import graphRoute from "../routes/graph.js";
import healthCausesRoute from "../routes/health-causes.js";
import healthDetailRoute from "../routes/health-detail.js";
import historyRoute from "../routes/history.js";
import ingestRoute from "../routes/ingest.js";
import journalRoute from "../routes/journal.js";
import keysRoute from "../routes/keys.js";
import naRoute from "../routes/na.js";
import orgsLieesHistoriqueRoute from "../routes/orgs-liees-historique.js";
import orgsLieesRoute from "../routes/orgs-liees.js";
import orgsRoute from "../routes/orgs.js";
import quarantineRoute from "../routes/quarantine.js";
import reviewRoute from "../routes/review.js";
import searchRoute from "../routes/search.js";
import sourcesRoute from "../routes/sources.js";
import statsDepartementsRoute from "../routes/stats-departements.js";
import statsRoute from "../routes/stats.js";
import streamRoute from "../routes/stream.js";
import todayRoute from "../routes/today.js";
import exportMispRoute from "../routes/export-misp.js";

/** Les routes historiques, exposées aussi sous `/api/v1`. */
const ROUTES = [
  eventsRoute, historyRoute, healthDetailRoute, healthCausesRoute, todayRoute,
  statsDepartementsRoute, couvertureRoute, flowsRoute, orgsRoute, directoryRoute,
  naRoute, graphRoute, streamRoute, sourcesRoute, statsRoute, searchRoute,
  enrichRoute, authRoute, alertsRoute, quarantineRoute, reviewRoute, journalRoute,
  orgsLieesRoute, orgsLieesHistoriqueRoute, ingestRoute, dossierRoute, keysRoute,
  custodyRoute, exportMispRoute,
];
const OPEN_READ_RPM = Number(process.env.RADAR_PUBLIC_READ_RPM ?? 120);
const SESSION_READ_RPM = Number(process.env.RADAR_SESSION_READ_RPM ?? 600);

export async function installPublicApi(app: FastifyInstance): Promise<void> {
  const spec = buildOpenApi();

  // Sans clé : adresse IP pour le public, utilisateur pour les sessions.
  // Avec clé : quota atomique persisté en base, partagé entre instances.
  const anonymousRead = rateLimit({ max: OPEN_READ_RPM, windowMs: 60_000 });
  const sessionRead = rateLimit({ max: SESSION_READ_RPM, windowMs: 60_000 });

  // Ce hook doit précéder l'enregistrement des routes pour s'appliquer à
  // toutes, y compris aux alias versionnés. `server.ts` ajoute ensuite son
  // propre garde-fou, qui hérite de `req.user` posé ici.
  app.addHook("onRequest", async (req, reply) => {
    const url = req.url.split("?")[0] ?? "";
    if (!url.startsWith("/api/")) return;
    reply.header("X-API-Version", API_VERSION);
    reply.header("X-API-Stability", STABILITY);
    const path = withoutVersion(url);
    if (path.startsWith("/docs") || path === "/openapi.json") return;

    const apiKey = await resolveApiKey(req);

    if (apiKey) {
      req.apiKey = apiKey;
      await consumeApiKey(apiKey, reply);
      if (req.method !== "GET" && apiKey.scope !== "write") throw forbidden("api key is read-only");
    }
    const user = await resolveUser(req);
    if (!user && apiKey) req.user = apiKey.owner;
    if (!apiKey && req.method === "GET" && path !== "/health" && !path.startsWith("/auth/")) {
      await (user ? sessionRead : anonymousRead)(req, reply);
    }
    if (user) req.user = user;
    if (req.method !== "GET" && !req.user && !path.startsWith("/auth/")) throw unauthorized();
  });

  const health = async () => {
    const r = await query<{ n: string }>("SELECT count(*)::text AS n FROM source");
    return { ok: true, sources: Number(r.rows[0]?.n ?? 0) };
  };
  app.get(`${CURRENT_PREFIX}/health`, health);
  for (const route of ROUTES) await app.register(route, { prefix: CURRENT_PREFIX });

  await app.register(swagger, { mode: "static", specification: { document: spec as never } });
  await app.register(swaggerUi, { routePrefix: "/api/docs", uiConfig: { docExpansion: "list" } });
  // Swagger UI sert /api/docs et /api/docs/json ; ces adresses exposent la
  // même spec que /api/openapi.json et /api/v1/openapi.json.
  app.get("/api/openapi.json", (_req, reply) => reply.type("application/json").send(spec));
  app.get(`${CURRENT_PREFIX}/openapi.json`, (_req, reply) => reply.type("application/json").send(spec));
}
