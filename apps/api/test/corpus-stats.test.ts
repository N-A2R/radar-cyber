/**
 * GET /api/corpus/stats — intégration contre la base de test jetable.
 *
 * On mesure l'apport de fixtures propres à un TAG unique, pas les totaux
 * absolus : la base de test contient déjà une source et une organisation.
 * Le jeu distingue volontairement un incident ancien (compté comme incident,
 * pas comme source productive) d'un signal récent d'une source sans département
 * (compté comme productif, pas comme incident).
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import corpusRoute from "../src/routes/corpus.js";

type CorpusStats = {
  sourcesParDepartement: { departement: string; sources: number }[];
  sourcesParFamille: { family: string; sources: number }[];
  organisationsAvecDomaine: number;
  incidentsCorpus: number;
  sourcesProductives: number;
  sourcesTotales: number;
  tauxSourcesProductives: number | null;
  windowDays: number;
};

const TAG = `cs${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  gironde: `${TAG}-gironde`,
  landes: `${TAG}-landes`,
  nationale: `${TAG}-nationale`,
  ancienne: `${TAG}-creuse`,
};
const ALL_IDS = Object.values(IDS);
const ORG_SLUGS = [`${TAG}-avec`, `${TAG}-sans`, `${TAG}-vide`];

let app: FastifyInstance;
let base: CorpusStats;

before(async () => {
  app = Fastify();
  await app.register(corpusRoute, { prefix: "/api" });
  await app.ready();
  base = await lire();

  const sources: Array<[string, string, string, string]> = [
    [IDS.gironde, `Presse Gironde test ${TAG}`, "presse", "https://exemple.invalid/gironde/rss"],
    [IDS.landes, `Sud Ouest Landes test ${TAG}`, "cti", "https://exemple.invalid/landes/rss"],
    [IDS.nationale, `Flux national test ${TAG}`, "cti", "https://exemple.invalid/national/feed"],
    [IDS.ancienne, `Journal Creuse test ${TAG}`, "leaks", "https://exemple.invalid/creuse/feed"],
  ];
  for (const [id, name, family, url] of sources) {
    await query(
      `INSERT INTO source (id, name, family, url, enabled) VALUES ($1,$2,$3,$4,true)`,
      [id, name, family, url],
    );
  }

  await query(
    `INSERT INTO org (name, slug, kind, domain)
     VALUES ($1,$2,'entreprise',$3),
            ($4,$5,'entreprise',NULL),
            ($6,$7,'entreprise','   ')`,
    [
      `Avec domaine ${TAG}`, ORG_SLUGS[0], `${TAG}.example.invalid`,
      `Sans domaine ${TAG}`, ORG_SLUGS[1],
      `Domaine vide ${TAG}`, ORG_SLUGS[2],
    ],
  );

  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, severity, source_id)
     VALUES ($1,'presse','confirmed_incident','Incident Gironde', now() - interval '2 days',3,$5),
            ($2,'cti','confirmed_incident','Incident Landes ancien', now() - interval '40 days',3,$6),
            ($3,'cti','ambient_signal','Signal national', now() - interval '1 day',2,$7),
            ($4,'leaks','confirmed_incident','Incident Creuse ancien', now() - interval '40 days',3,$8)`,
    [
      `${TAG}:incident33`, `${TAG}:incident40`, `${TAG}:signal`, `${TAG}:incident23`,
      IDS.gironde, IDS.landes, IDS.nationale, IDS.ancienne,
    ],
  );
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM event WHERE source_id = ANY($1)", [ALL_IDS]);
  await query("DELETE FROM source WHERE id = ANY($1)", [ALL_IDS]);
  await query("DELETE FROM org WHERE slug = ANY($1)", [ORG_SLUGS]);
  await closePools();
});

async function lire(): Promise<CorpusStats> {
  const res = await app.inject({ method: "GET", url: "/api/corpus/stats" });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}

function sourceDe(liste: { family: string; sources: number }[], family: string): number {
  return liste.find((l) => l.family === family)?.sources ?? 0;
}
function sourcesDuDept(liste: { departement: string; sources: number }[], dept: string): number {
  return liste.find((l) => l.departement === dept)?.sources ?? 0;
}

test("la route renvoie une structure complète et des compteurs entiers", async () => {
  const corps = await lire();
  assert.deepEqual(Object.keys(corps).sort(), [
    "incidentsCorpus", "organisationsAvecDomaine", "sourcesParDepartement",
    "sourcesParFamille", "sourcesProductives", "sourcesTotales",
    "tauxSourcesProductives", "windowDays",
  ]);
  assert.equal(corps.windowDays, 30);
  const codes = corps.sourcesParDepartement.map((d) => d.departement);
  assert.deepEqual(codes, [...new Set(codes)].sort((a, b) => a.localeCompare(b, "fr")));
  for (const code of ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"]) {
    assert.ok(codes.includes(code), `département ${code} absent`);
  }
  for (const n of [corps.organisationsAvecDomaine, corps.incidentsCorpus, corps.sourcesProductives, corps.sourcesTotales]) {
    assert.ok(Number.isInteger(n) && n >= 0, `compteur invalide : ${n}`);
  }
  assert.ok(corps.tauxSourcesProductives === null ||
    (corps.tauxSourcesProductives >= 0 && corps.tauxSourcesProductives <= 100));
});

test("sources par département et par famille, organisations avec domaine", async () => {
  const apres = await lire();
  assert.equal(sourcesDuDept(apres.sourcesParDepartement, "33") - sourcesDuDept(base.sourcesParDepartement, "33"), 1);
  assert.equal(sourcesDuDept(apres.sourcesParDepartement, "40") - sourcesDuDept(base.sourcesParDepartement, "40"), 1);
  assert.equal(sourcesDuDept(apres.sourcesParDepartement, "23") - sourcesDuDept(base.sourcesParDepartement, "23"), 1);
  assert.equal(sourceDe(apres.sourcesParFamille, "presse") - sourceDe(base.sourcesParFamille, "presse"), 1);
  assert.equal(sourceDe(apres.sourcesParFamille, "cti") - sourceDe(base.sourcesParFamille, "cti"), 2);
  assert.equal(sourceDe(apres.sourcesParFamille, "leaks") - sourceDe(base.sourcesParFamille, "leaks"), 1);
  // Un domaine vide ne vaut pas un domaine, et l'absence de domaine non plus.
  assert.equal(apres.organisationsAvecDomaine - base.organisationsAvecDomaine, 1);
});

test("incidents et productivité : un incident ancien n'est pas une source productive", async () => {
  const apres = await lire();
  assert.equal(apres.incidentsCorpus - base.incidentsCorpus, 3);
  assert.equal(apres.sourcesProductives - base.sourcesProductives, 2);
  assert.equal(apres.sourcesTotales - base.sourcesTotales, 4);
  assert.equal(
    apres.tauxSourcesProductives,
    Math.round((apres.sourcesProductives / apres.sourcesTotales) * 1000) / 10,
  );
});
