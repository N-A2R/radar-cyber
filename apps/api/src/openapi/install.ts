/**
 * Surface HTTP publique ajoutée à l'application existante : documentation,
 * versioning, clés d'API et quota. L'identité (session/clé) est résolue en
 * amont par `installIdentityResolution`, la décision d'accès par la matrice
 * RBAC ; ce hook ne fait que le quota, les en-têtes publics et la limitation
 * des lectures anonymes.
 */
import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { consumeApiKey } from "../api-key.js";
import { forbidden } from "../errors.js";
import { rateLimit } from "../middleware/rate-limit.js";
import { query } from "../db.js";
import { buildOpenApi } from "./spec.js";
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
import registreTraitementsRoute from "../routes/registre-traitements.js";
import violationsRgpdRoute from "../routes/violations-rgpd.js";
import keysRoute from "../routes/keys.js";
import naRoute from "../routes/na.js";
import orgsLieesHistoriqueRoute from "../routes/orgs-liees-historique.js";
import orgsLieesRoute from "../routes/orgs-liees.js";
import orgsRoute from "../routes/orgs.js";
import quarantineRoute from "../routes/quarantine.js";
import reviewRoute from "../routes/review.js";
import searchRoute from "../routes/search.js";
import sourcesRoute from "../routes/sources.js";
import sourcesDashboardRoute from "../routes/sources-dashboard.js";
import sourcesVerificationRoute from "../routes/sources-verification.js";
import statsDepartementsRoute from "../routes/stats-departements.js";
import statsRoute from "../routes/stats.js";
import streamRoute from "../routes/stream.js";
import todayRoute from "../routes/today.js";
import exportMispRoute from "../routes/export-misp.js";

/** Les routes historiques, exposées aussi sous `/api/v1`. */
const ROUTES = [
  eventsRoute, historyRoute, healthDetailRoute, healthCausesRoute, todayRoute,
  statsDepartementsRoute, couvertureRoute, flowsRoute, orgsRoute, directoryRoute,
  naRoute, graphRoute, streamRoute, sourcesRoute, sourcesDashboardRoute, sourcesVerificationRoute, statsRoute, searchRoute,
  enrichRoute, authRoute, alertsRoute, quarantineRoute, reviewRoute, journalRoute,
  registreTraitementsRoute,
  violationsRgpdRoute,
  orgsLieesRoute, orgsLieesHistoriqueRoute, ingestRoute, dossierRoute, keysRoute,
  custodyRoute, exportMispRoute,
];
const OPEN_READ_RPM = Number(process.env.RADAR_PUBLIC_READ_RPM ?? 120);
const SESSION_READ_RPM = Number(process.env.RADAR_SESSION_READ_RPM ?? 600);
const anonymousRead = rateLimit({ max: OPEN_READ_RPM, windowMs: 60_000 });
const sessionRead = rateLimit({ max: SESSION_READ_RPM, windowMs: 60_000 });

export async function installPublicApi(app: FastifyInstance): Promise<void> {
  const spec = buildOpenApi();
  // Ce hook doit précéder l'enregistrement des routes pour s'appliquer à
  // toutes, y compris aux alias versionnés. Il s'exécute après la décision
  // RBAC : une requête refusée ne consomme pas le quota de la clé (NET-14).
  app.addHook("onRequest", async (req, reply) => {
    const url = req.url.split("?")[0] ?? "";
    if (!url.startsWith("/api/")) return;
    reply.header("X-API-Version", API_VERSION);
    reply.header("X-API-Stability", STABILITY);
    const path = withoutVersion(url);
    if (path.startsWith("/docs") || path === "/openapi.json") return;

    const estLecture = req.method === "GET" || req.method === "HEAD";
    const apiKey = req.apiKey;
    if (apiKey) {
      if (!estLecture && apiKey.scope !== "write") throw forbidden("api key is read-only");
      await consumeApiKey(apiKey, reply);
    }
    // HEAD est une lecture : les sondes de disponibilité ne doivent pas être
    // facturées comme des écritures (M8).
    if (!apiKey && estLecture && path !== "/health" && !path.startsWith("/auth/")) {
      await (req.user ? sessionRead : anonymousRead)(req, reply);
    }
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
