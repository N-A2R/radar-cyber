/**
 * GET /api/stats/departements — intégration contre la base de test jetable.
 *
 * Le jeu vérifie les trois comptages ET les limites d'inférence documentées
 * dans la route : `source` n'a pas de département, on tire l'indice du nom,
 * de l'URL, d'un code postal ou de l'identifiant ; une source sans indice ou
 * à deux départements candidats ne compte nulle part.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import statsRoute, { departementDeLaSource } from "../src/routes/stats.js";
import statsDepartementsRoute from "../src/routes/stats-departements.js";

const TAG = `sd${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  gironde: `${TAG}-gironde`,
  landes: `${TAG}-landes`,
  lot: `${TAG}-47`,
  postal: `${TAG}-postal`,
  nationale: `${TAG}-nationale`,
  morte: `${TAG}-creuse`,
  equivogue: `${TAG}-equivogue`,
};
const ALL_IDS = Object.values(IDS);

let app: FastifyInstance;
let base: Map<string, StatDept>;
let base24h: Map<string, Dept24h>;
const ORG_SLUGS: string[] = [];

type StatDept = {
  departement: string;
  organisations: number;
  evenements7j: number;
  sourcesActives: number;
};

type Dept24h = { dept: string; evenements: number; organisations: number };

before(async () => {
  // La base de test contient déjà les sources des migrations : on mesure
  // l'apport de nos fixtures, pas le total absolu.
  app = Fastify();
  await app.register(statsRoute, { prefix: "/api" });
  await app.ready();
  const avant = await lire();
  base = new Map(avant.departements.map((d) => [d.departement, d]));
  base24h = new Map(avant.departements24h.map((d) => [d.dept, d]));
  const sources: Array<[string, string, string, boolean]> = [
    [IDS.gironde, `Sud Ouest — Gironde (test ${TAG})`, "https://exemple.invalid/gironde/rss", true],
    [IDS.landes, `Sud Ouest — Landes (test ${TAG})`, "https://exemple.invalid/landes/rss", true],
    [IDS.lot, `La Dépêche — Lot-et-Garonne (test ${TAG})`, "https://exemple.invalid/lot-et-garonne,47/rss.xml", true],
    [IDS.postal, `Source code postal (test ${TAG})`, "https://exemple.invalid/33000/feed", true],
    [IDS.nationale, `Source nationale (test ${TAG})`, "https://exemple.invalid/national/feed", true],
    [IDS.morte, `Sud Ouest — Creuse (test ${TAG})`, "https://exemple.invalid/creuse/rss", false],
    [IDS.equivogue, `La Montagne — Corrèze et Creuse (test ${TAG})`, "https://exemple.invalid/montagne/rss", true],
  ];
  for (const [id, name, url, enabled] of sources) {
    await query(
      `INSERT INTO source (id, name, family, url, enabled)
       VALUES ($1,$2,'cti',$3,$4)`,
      [id, name, url, enabled],
    );
  }

  const orgs: Array<[string, string]> = [
    [`${TAG}-org33a`, "33"],
    [`${TAG}-org33b`, "33"],
    [`${TAG}-org40`, "40"],
    [`${TAG}-org47`, "47"],
  ];
  const orgIds: number[] = [];
  for (const [slug, dept] of orgs) {
    ORG_SLUGS.push(slug);
    const r = await query<{ id: number }>(
      `INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'entreprise',$3) RETURNING id`,
      [`Organisation ${slug} ${TAG}`, slug, dept],
    );
    orgIds.push(Number(r.rows[0].id));
  }

  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, severity, source_id, org_id, source_url, evidence)
     VALUES ($1,'cti','ambient_signal','Fait 33', now() - interval '1 hour',2,$9,$15,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($2,'cti','ambient_signal','Fait 33 sans org', now() - interval '2 days',2,$9,NULL,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($3,'cti','ambient_signal','Fait 40', now() - interval '3 days',2,$10,$16,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($4,'cti','ambient_signal','Fait 40 ancien', now() - interval '10 days',2,$10,NULL,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($5,'cti','ambient_signal','Fait 47 sans org', now() - interval '1 day',2,$11,NULL,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($6,'cti','ambient_signal','Fait national', now() - interval '1 hour',2,$12,NULL,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($7,'cti','ambient_signal','Fait source morte', now() - interval '1 hour',2,$13,NULL,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($8,'cti','ambient_signal','Fait ambigu', now() - interval '1 hour',2,$14,NULL,'https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
    [
      `${TAG}:e33a`, `${TAG}:e33b`, `${TAG}:e40a`, `${TAG}:e40old`,
      `${TAG}:e47`, `${TAG}:enational`, `${TAG}:emorte`, `${TAG}:eambig`,
      IDS.gironde, IDS.landes, IDS.lot, IDS.nationale, IDS.morte, IDS.equivogue,
      orgIds[0], orgIds[2],
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

async function lire(): Promise<{ windowDays: number; departements: StatDept[]; departements24h: Dept24h[] }> {
  const res = await app.inject({ method: "GET", url: "/api/stats/departements" });
  assert.equal(res.statusCode, 200, res.body);
  return res.json();
}
function apport(
  apres: Map<string, StatDept>,
  code: string,
  cle: "organisations" | "evenements7j" | "sourcesActives",
): number {
  return (apres.get(code)?.[cle] ?? 0) - (base.get(code)?.[cle] ?? 0);
}

test("la route fournit les douze départements et des compteurs entiers", async () => {
  const body = await lire();
  assert.equal(body.windowDays, 7);
  // La route ne renvoie que des départements de Nouvelle-Aquitaine, dans l'ordre,
  // sans doublon. Le nombre exact dépend des données présentes dans la base
  // partagée par la suite : l'invariant est l'appartenance, pas le compte.
  // Contrat de la route : les douze départements de Nouvelle-Aquitaine sont
  // TOUJOURS présents (même à zéro), et un département hors région rencontré
  // en base est ajouté plutôt que masqué. On vérifie la présence des douze et
  // l'absence de doublon, pas un total exact.
  const NA = ["16","17","19","23","24","33","40","47","64","79","86","87"];
  const depts = body.departements.map((d) => d.departement);
  assert.equal(new Set(depts).size, depts.length, "aucun département en double");
  for (const d of NA) {
    assert.ok(depts.includes(d), `département ${d} absent`);
  }
  assert.deepEqual(depts, [...depts].sort(), "départements triés");
  for (const d of body.departements) {
    assert.deepEqual(Object.keys(d).sort(), [
      "departement", "evenements7j", "organisations", "sourcesActives",
    ]);
    for (const n of [d.organisations, d.evenements7j, d.sourcesActives]) {
      assert.ok(Number.isInteger(n) && n >= 0, `compteur invalide pour ${d.departement} : ${n}`);
    }
  }
});

test("le filtre 24 h ne propose que les départements actifs sur la période", async () => {
  const apres = new Map((await lire()).departements24h.map((d) => [d.dept, d]));
  const delta = (dept: string, cle: "evenements" | "organisations") =>
    (apres.get(dept)?.[cle] ?? 0) - (base24h.get(dept)?.[cle] ?? 0);

  // Un seul fait rattaché il y a 1 h dans le jeu de fixtures.
  assert.equal(delta("33", "evenements"), 1);
  assert.equal(delta("33", "organisations"), 1);
  // Les faits à 2, 3 et 10 jours sont hors de la fenêtre courte.
  assert.equal(delta("40", "evenements"), 0);
  assert.equal(delta("47", "evenements"), 0);
  for (const d of apres.values()) {
    assert.ok(Number.isInteger(d.evenements) && d.evenements > 0);
    assert.ok(Number.isInteger(d.organisations) && d.organisations > 0);
  }
});

test("organisations et événements 7 j sont comptés par département", async () => {
  const parCode = new Map((await lire()).departements.map((d) => [d.departement, d]));

  assert.equal(apport(parCode, "33", "organisations"), 2);
  assert.equal(apport(parCode, "40", "organisations"), 1);
  assert.equal(apport(parCode, "47", "organisations"), 1);

  // Le 33 compte un fait rattaché et un fait sans org attribué à sa source.
  assert.equal(apport(parCode, "33", "evenements7j"), 2, "un fait rattaché et un fait sans org attribué à sa source");
  assert.equal(apport(parCode, "40", "evenements7j"), 1, "le fait de 10 jours est hors fenêtre");
  assert.equal(apport(parCode, "47", "evenements7j"), 1, "repli sur l'identifiant -47");
  assert.equal(apport(parCode, "23", "evenements7j"), 1, "un fait ancien de source morte reste un fait");
  assert.equal(apport(parCode, "16", "evenements7j"), 0);
});

test("les sources actives sont inférées et ne sont jamais comptées deux fois", async () => {
  const parCode = new Map((await lire()).departements.map((d) => [d.departement, d]));

  // Gironde par le libellé, 33 par code postal, Landes, Lot-et-Garonne par -47.
  assert.equal(apport(parCode, "33", "sourcesActives"), 2);
  assert.equal(apport(parCode, "40", "sourcesActives"), 1);
  assert.equal(apport(parCode, "47", "sourcesActives"), 1);
  assert.equal(apport(parCode, "23", "sourcesActives"), 0, "source désactivée");
  assert.equal(apport(parCode, "19", "sourcesActives"), 0, "deux départements candidats : on renonce");
  const total = (await lire()).departements.reduce(
    (n, d) => n + (base.has(d.departement) ? d.sourcesActives - (base.get(d.departement)?.sourcesActives ?? 0) : 0),
    0,
  );
  assert.equal(total, 4, "aucune source sans indice ne doit être attribuée");
});

test("l'inférence accepte les alias connus et refuse les indices contradictoires", () => {
  const source = (id: string, name: string, url: string, description: string | null = null) => ({
    id, name, url, description, enabled: true,
  });
  assert.equal(departementDeLaSource(source("x", "Conseil départemental de la Gironde", "https://exemple.invalid")), "33");
  assert.equal(departementDeLaSource(source("x", "Préfecture des Landes", "https://exemple.invalid")), "40");
  assert.equal(departementDeLaSource(source("x", "Flux CD33", "https://exemple.invalid")), "33");
  assert.equal(departementDeLaSource(source("x", "Aucun indice", "https://exemple.invalid/feed")), null);
  assert.equal(departementDeLaSource(source("x", "Charente et Charente-Maritime", "https://exemple.invalid")), null);
});

test("les deux routes départements coexistent sans collision au démarrage", async () => {
  const serveur = Fastify();
  try {
    await serveur.register(statsDepartementsRoute, { prefix: "/api" });
    await serveur.register(statsRoute, { prefix: "/api" });
    await serveur.ready();

    const fil = await serveur.inject({ method: "GET", url: "/api/today/departements" });
    assert.equal(fil.statusCode, 200, fil.body);
    assert.ok(Array.isArray(fil.json().departements));

    const stats = await serveur.inject({ method: "GET", url: "/api/stats/departements" });
    assert.equal(stats.statusCode, 200, stats.body);
    assert.equal(stats.json().windowDays, 7);
  } finally {
    await serveur.close();
  }
});
