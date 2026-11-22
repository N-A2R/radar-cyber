/**
 * Mesure reproductible de l'objectif du rapport docs/conformite.md :
 * chaque route /api/* enregistrée doit avoir une décision d'accès explicite
 * dans la matrice RBAC, et aucune règle ne doit rester sans route.
 *
 *   pnpm mesure:conformite
 *
 * Aucune base, aucun réseau, aucune donnée personnelle.
 */
import Fastify from "fastify";
import { installAccessControl, reglePour, POLITIQUE_ACCES } from "../src/security/rbac.js";
import { registerApiRoutes } from "../src/routes/index.js";

type RouteDeclaree = { method: string; url: string };

const app = Fastify({ logger: false });
const routes: RouteDeclaree[] = [];

app.addHook("onRoute", (route) => {
  const url = String(route.url ?? "");
  if (!url.startsWith("/api")) return;
  const methodes = Array.isArray(route.method) ? route.method : [route.method];
  for (const methode of methodes) routes.push({ method: String(methode).toUpperCase(), url });
});

installAccessControl(app);
await registerApiRoutes(app);
await app.ready();

const sansRegle = routes
  .filter((route) => reglePour(route.method, route.url) === null)
  .map((route) => `${route.method} ${route.url}`);
const reglesOrphelines = POLITIQUE_ACCES
  .filter((regle) => !routes.some((route) => route.method === regle.methode && route.url === regle.route))
  .map((regle) => `${regle.methode} ${regle.route}`);

console.log(JSON.stringify({
  routes: routes.length,
  regles: POLITIQUE_ACCES.length,
  routesSansRegle: sansRegle,
  reglesOrphelines,
}, null, 2));

if (routes.length === 0 || sansRegle.length > 0 || reglesOrphelines.length > 0) process.exitCode = 1;

await app.close();
