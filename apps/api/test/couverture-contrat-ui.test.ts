/**
 * Contrat HTTP consommé par l'écran Coverage.
 *
 * La route sert une mesure figée : on vérifie ici les champs que l'UI lit,
 * leur cohérence arithmétique et la stabilité de l'ETag. `stale` et `parMois`
 * sont des ajouts en cours de publication : le test les valide dès qu'ils
 * apparaissent dans la réponse, sans faire échouer la suite avant leur arrivée.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import couvertureRoute from "../src/routes/couverture.js";

type Ligne = { vus: number; total: number; taux: number };
type Corps = {
  dateCalcul: string;
  hashCorpus: string;
  fenetre: { debut: string; fin: string };
  global: Ligne;
  parMotif: Array<{ motif: string; incidents: number; part: number }>;
  parDepartement: Array<Ligne & { departement: string }>;
  parSecteur: Array<Ligne & { secteur: string }>;
  parMois?: Array<Ligne & { mois: string }>;
  stale?: boolean;
};

let app: FastifyInstance;

before(async () => {
  app = Fastify();
  await app.register(couvertureRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test("GET /api/couverture fournit les sections affichées par Coverage", async () => {
  const reponse = await app.inject({ method: "GET", url: "/api/couverture" });
  assert.equal(reponse.statusCode, 200);
  const corps = reponse.json<Corps>();

  assert.match(corps.dateCalcul, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(corps.hashCorpus, /^[0-9a-f]{64}$/);
  assert.match(corps.fenetre.debut, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(corps.fenetre.fin, /^\d{4}-\d{2}-\d{2}$/);

  assert.ok(corps.global.total > 0);
  assert.ok(corps.global.vus >= 0 && corps.global.vus <= corps.global.total);
  assert.equal(corps.global.taux, Math.round((corps.global.vus / corps.global.total) * 1000) / 10);

  assert.equal(
    corps.parMotif.reduce((somme, motif) => somme + motif.incidents, 0),
    corps.global.total,
  );
  for (const section of [corps.parDepartement, corps.parSecteur]) {
    assert.equal(section.reduce((somme, ligne) => somme + ligne.total, 0), corps.global.total);
    assert.equal(section.reduce((somme, ligne) => somme + ligne.vus, 0), corps.global.vus);
  }
  assert.ok(corps.parDepartement.every((ligne) => ligne.departement.length > 0));
  assert.ok(corps.parSecteur.every((ligne) => ligne.secteur.length > 0));

  if (corps.parMois !== undefined) {
    assert.ok(corps.parMois.length > 0);
    assert.ok(corps.parMois.every((ligne) => /^\d{4}-\d{2}$/.test(ligne.mois)));
    assert.equal(corps.parMois.reduce((somme, ligne) => somme + ligne.total, 0), corps.global.total);
    assert.equal(corps.parMois.reduce((somme, ligne) => somme + ligne.vus, 0), corps.global.vus);
    const mois = corps.parMois.map((ligne) => ligne.mois);
    assert.deepEqual(mois, [...mois].sort());
  }
  if (corps.stale !== undefined) assert.equal(typeof corps.stale, "boolean");
});

test("la mesure est reproductible : ETag identique entre deux appels", async () => {
  const premier = await app.inject({ method: "GET", url: "/api/couverture" });
  const second = await app.inject({ method: "GET", url: "/api/couverture" });
  assert.equal(second.statusCode, 200);
  assert.ok(premier.headers.etag);
  assert.equal(premier.headers.etag, second.headers.etag);
  assert.equal(premier.body, second.body);

  const revalidate = await app.inject({
    method: "GET",
    url: "/api/couverture",
    headers: { "if-none-match": String(premier.headers.etag) },
  });
  assert.equal(revalidate.statusCode, 304);
});
