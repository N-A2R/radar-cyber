/**
 * Aucune route API ne doit exister sans décision d'accès explicite.
 *
 * Le test enregistre exactement le même registre de routes que le serveur,
 * collecte les déclarations via `onRoute`, puis vérifie que la matrice couvre
 * chaque method + chemin. Il vérifie aussi que les règles spécifiques ne sont
 * pas masquées par une règle paramétrée plus générale.
 */
import { test, before, after } from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { installErrorHandler } from "../src/errors.js";
import { installAccessControl, reglePour, POLITIQUE_ACCES } from "../src/security/rbac.js";
import { registerApiRoutes } from "../src/routes/index.js";
import { installPublicApi } from "../src/openapi/install.js";

type RouteDeclaree = { method: string; url: string };

let app: FastifyInstance;
const routes: RouteDeclaree[] = [];

before(async () => {
  app = Fastify({ logger: false });
  installErrorHandler(app);
  app.addHook("onRoute", (route) => {
    const url = String(route.url ?? "");
    if (!url.startsWith("/api")) return;
    const methodes = Array.isArray(route.method) ? route.method : [route.method];
    for (const methode of methodes) routes.push({ method: String(methode).toUpperCase(), url });
  });
  installAccessControl(app);
  await installPublicApi(app);
  await registerApiRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test("toutes les routes enregistrées ont une règle de sécurité", () => {
  assert.ok(routes.length > 40, `${routes.length} routes attendues, la liste a été réduite par erreur`);
  const sansRegle = routes.filter((r) => reglePour(r.method, r.url) === null);
  assert.deepEqual(sansRegle, [], `routes sans règle : ${sansRegle.map((r) => `${r.method} ${r.url}`).join(", ")}`);
});

test("les routes les plus spécifiques ne sont pas interceptées", () => {
  const cas = [
    { route: "/api/orgs/liees", niveau: "lecteur" },
    { route: "/api/orgs/liees/historique", niveau: "lecteur" },
    { route: "/api/alerts/stats", niveau: "public" },
    { route: "/api/journal/review/export.csv", niveau: "admin" },
    { route: "/api/review/refuser-sans-indice", niveau: "admin" },
    { route: "/api/v1/events", niveau: "public" },
    { route: "/api/v1/openapi.json", niveau: "public" },
    { route: "/api/docs/static/swagger-ui.css", niveau: "public" },
    { route: "/api/v1/keys", niveau: "lecteur" },
  ] as const;
  for (const { route, niveau } of cas) {
    assert.equal(reglePour("GET", route)?.niveau ?? reglePour("POST", route)?.niveau, niveau, route);
  }
});

test("chaque règle déclarée correspond à une route réellement enregistrée", () => {
  const orphelines = POLITIQUE_ACCES.filter(
    (r) => !routes.some((route) => reglePour(route.method, route.url) === r),
  );
  // /api/health est enregistrée par le registre ; aucune règle ne doit rester
  // sans route, sinon la matrice donne une fausse impression de couverture.
  assert.deepEqual(orphelines.map((r) => `${r.methode} ${r.route}`), []);
});

test("la déclaration OBJECTIF du rapport suit la couverture réelle", async () => {
  const rapport = await readFile(new URL("../../../docs/conformite.md", import.meta.url), "utf8");
  const objectif = rapport.match(
    /^OBJECTIF : (?<etat>atteint|partiel) — (?<valeur>\d+) \/ (?<cible>\d+) routes API[^\n]*?\(HEAD inclus ; (?<regles>\d+) règles déclarées, (?<sansRegle>\d+) route sans règle, (?<orphelines>\d+) règle orpheline\)/m,
  );
  assert.ok(objectif, "OBJECTIF du rapport absent ou mal formé");
  const groupes = objectif.groups!;
  const sansRegle = routes.filter((r) => reglePour(r.method, r.url) === null);
  const orphelines = POLITIQUE_ACCES.filter(
    (r) => !routes.some((route) => reglePour(route.method, route.url) === r),
  );
  assert.equal(groupes.etat, "atteint");
  assert.equal(Number(groupes.valeur), routes.length, "valeur déclarée ≠ routes enregistrées");
  assert.equal(Number(groupes.cible), routes.length, "cible déclarée ≠ routes enregistrées");
  assert.equal(Number(groupes.regles), POLITIQUE_ACCES.length, "règles déclarées ≠ matrice RBAC");
  assert.equal(Number(groupes.sansRegle), sansRegle.length);
  assert.equal(Number(groupes.orphelines), orphelines.length);
});
