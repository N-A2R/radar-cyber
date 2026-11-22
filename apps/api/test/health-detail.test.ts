/**
 * `/health/detail` — les chiffres affichés sont-ils les chiffres de la base ?
 *
 * Un test de forme (les clés) ne suffit pas : une route peut renvoyer des clés
 * correctes avec des compteurs inventés. Chaque entier est donc comparé à une
 * requête indépendante, exécutée ici dans la base de test — le même geste que
 * `psql` sur la base réelle. La latence, la taille et les volumes de la base
 * sont relus de la même façon ; le statut « morte » est déclaré en base.
 *
 * Isolation : cinq sources, une organisation, des événements et trois files
 * jetables, supprimés dans `after`.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import healthDetailRoute, { type HealthDetail, type HealthSources } from "../src/routes/health-detail.js";

const TAG = `hd${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const IDS = {
  green: `${TAG}-green`,
  orange: `${TAG}-orange`,
  red: `${TAG}-red`,
  muette: `${TAG}-muette`,
  disabled: `${TAG}-disabled`,
};
const ALL_IDS = Object.values(IDS);
const FAMILY = { green: "cert_fr", orange: "typosquat", red: "leaks" };
const ORG_SLUG = `org-${TAG}`;
let orgId: number;
let app: FastifyInstance;

before(async () => {
  for (const [key, id] of Object.entries(IDS)) {
    await query(
      `INSERT INTO source (id, name, family, url, enabled, statut)
       VALUES ($1,$2,'cti','https://exemple.invalid/${key}',$3,$4)`,
      [id, `${key} (test ${TAG})`, key !== "disabled", key === "disabled" ? "morte" : "active"],
    );
  }
  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, city) VALUES ($1,$2,'entreprise','Bordeaux') RETURNING id`,
    [`Organisation ${TAG}`, ORG_SLUG],
  );
  orgId = org.rows[0].id;

  await query(
    `INSERT INTO collector_run (source_id, finished_at, status, items_in, items_new)
     VALUES ($1, now() - interval '1 hour','ok',10,1),
            ($2, now() - interval '2 days','ok',10,1),
            ($3, now() - interval '9 days','ok',10,1),
            ($4, now() - interval '1 hour','ok',40,0),
            ($5, now() - interval '1 hour','ok',10,1)`,
    ALL_IDS,
  );

  await query(
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, severity, source_id, org_id, source_url, evidence)
     VALUES ($1,$5,'ambient_signal','Fait vert (test)', now() - interval '2 hours',2,$9,$13,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($2,$6,'ambient_signal','Fait orange (test)', now() - interval '3 days',2,$10,$13,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($3,$7,'ambient_signal','Fait rouge (test)', now() - interval '10 days',2,$11,NULL,'https://example.invalid/event','{"run_id":"1"}'::jsonb),
            ($4,$8,'ambient_signal','Fait source désactivée (test)', now() - interval '2 hours',2,$12,NULL,'https://example.invalid/event','{"run_id":"1"}'::jsonb)`,
    [
      `${TAG}:ev-green`, `${TAG}:ev-orange`, `${TAG}:ev-red`, `${TAG}:ev-disabled`,
      FAMILY.green, FAMILY.orange, FAMILY.red, "cti",
      IDS.green, IDS.orange, IDS.red, IDS.disabled, orgId,
    ],
  );

  await query(
    `INSERT INTO quarantine_raw (source, source_url, content_hash, status, kind, promoted_at, promoted_by)
     VALUES ($1,'https://exemple.invalid/q1',$2,'pending','claim',NULL,NULL),
            ($1,'https://exemple.invalid/q2',$3,'pending','claim',NULL,NULL),
            ($1,'https://exemple.invalid/q3',$4,'reviewed','claim',NULL,NULL),
            ($1,'https://exemple.invalid/q4',$5,'promoted','claim',now(),'test'),
            ($1,'https://exemple.invalid/q5',$6,'promoted','claim',now(),'test')`,
    [TAG, `${TAG}:h1`, `${TAG}:h2`, `${TAG}:h3`, `${TAG}:h4`, `${TAG}:h5`],
  );

  app = Fastify();
  await app.register(healthDetailRoute);
  await app.ready();
});

after(async () => {
  await query("DELETE FROM quarantine_raw WHERE source = $1", [TAG]);
  await query("DELETE FROM event WHERE source_id = ANY($1)", [ALL_IDS]);
  await query("DELETE FROM collector_run WHERE source_id = ANY($1)", [ALL_IDS]);
  await query("DELETE FROM source WHERE id = ANY($1)", [ALL_IDS]);
  await query("DELETE FROM org WHERE id = $1", [orgId]);
  await app.close();
  await closePools();
});

async function lire(): Promise<HealthDetail> {
  const res = await app.inject({ method: "GET", url: "/health/detail" });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as HealthDetail;
}

async function lireSources(qs = ""): Promise<HealthSources> {
  const res = await app.inject({ method: "GET", url: `/health/sources${qs}` });
  assert.equal(res.statusCode, 200, res.body);
  return res.json() as HealthSources;
}

async function entier(sql: string): Promise<number> {
  const r = await query<{ n: number }>(sql);
  return Number(r.rows[0]?.n ?? -1);
}

test("la route porte toutes les clés attendues et des entiers", async () => {
  const body = await lire();
  assert.equal(body.ok, true);
  assert.equal(body.windowDays, 7);
  assert.ok(Date.parse(body.generatedAt) > 0);
  assert.deepEqual(Object.keys(body).sort(), [
    "db", "events24h", "families", "generatedAt", "ok", "orgs7j", "queues", "sources", "windowDays",
  ]);
  assert.deepEqual(Object.keys(body.sources).sort(), [
    "actives7j", "declared", "enabled", "muettes7j",
  ]);
  assert.deepEqual(Object.keys(body.queues).sort(), ["pending", "promoted", "reviewed"]);
  const entiers = [
    body.sources.declared, body.sources.enabled, body.sources.actives7j,
    body.sources.muettes7j, body.events24h, body.orgs7j,
    body.queues.pending, body.queues.reviewed, body.queues.promoted,
  ];
  for (const n of entiers) assert.ok(Number.isInteger(n) && n >= 0, `entier attendu : ${n}`);
  for (const f of body.families) {
    assert.ok(f.ageHours === null || Number.isInteger(f.ageHours));
    assert.ok(f.ageDays === null || Number.isInteger(f.ageDays));
  }
});

test("latence, taille et volumes viennent de la base de test", async () => {
  const b = await lire();
  assert.deepEqual(Object.keys(b.db).sort(), [
    "aliases", "events", "latencyMs", "orgs", "sizeBytes",
  ]);
  assert.ok(Number.isFinite(b.db.latencyMs) && b.db.latencyMs >= 0, `latence : ${b.db.latencyMs}`);
  const mesure = await query<{
    taille: string;
    orgs: number;
    aliases: number;
    events: number;
  }>(`
    SELECT pg_database_size(current_database())::text AS taille,
           (SELECT count(*)::int FROM org) AS orgs,
           (SELECT count(*)::int FROM org_alias) AS aliases,
           (SELECT count(*)::int FROM event) AS events
  `);
  const m = mesure.rows[0];
  assert.ok(Number(m.taille) > 0, "la base de test occupe de l'espace");
  assert.equal(b.db.sizeBytes, Number(m.taille));
  assert.equal(b.db.orgs, Number(m.orgs));
  assert.equal(b.db.aliases, Number(m.aliases));
  assert.equal(b.db.events, Number(m.events));
});

test("les compteurs sont ceux de la base, pas une estimation", async () => {
  const b = await lire();
  assert.equal(
    b.sources.declared,
    await entier("SELECT count(*)::int AS n FROM source"),
  );
  assert.equal(
    b.sources.enabled,
    await entier("SELECT count(*)::int AS n FROM source WHERE enabled"),
  );
  assert.equal(
    b.sources.actives7j,
    await entier(`SELECT count(DISTINCT e.source_id)::int AS n FROM event e
                    JOIN source s ON s.id=e.source_id
                   WHERE s.enabled
                     AND COALESCE(e.observed_at,e.collected_at) >= now() - interval '7 days'`),
  );
  assert.equal(b.sources.muettes7j, b.sources.enabled - b.sources.actives7j);
  assert.equal(
    b.events24h,
    await entier(`SELECT count(*)::int AS n FROM event
                   WHERE COALESCE(observed_at,collected_at) >= now() - interval '24 hours'`),
  );
  assert.equal(
    b.orgs7j,
    await entier(`SELECT count(DISTINCT org_id)::int AS n FROM event
                   WHERE org_id IS NOT NULL
                     AND COALESCE(observed_at,collected_at) >= now() - interval '7 days'`),
  );
  const files = await query<{ pending: number; reviewed: number; promoted: number }>(
    `SELECT count(*) FILTER (WHERE status='pending')::int AS pending,
            count(*) FILTER (WHERE status='reviewed')::int AS reviewed,
            count(*) FILTER (WHERE status='promoted')::int AS promoted
       FROM quarantine_raw`,
  );
  assert.deepEqual(b.queues, {
    pending: Number(files.rows[0].pending),
    reviewed: Number(files.rows[0].reviewed),
    promoted: Number(files.rows[0].promoted),
  });
});

test("chaque famille porte le bon âge et la bonne couleur", async () => {
  const b = await lire();
  const famillesBase = await query<{ family: string; age_hours: number; last_at: string }>(
    `SELECT family,
            GREATEST(0, floor(extract(epoch FROM
              (now() - max(COALESCE(observed_at, collected_at)))) / 3600))::int AS age_hours,
            max(COALESCE(observed_at, collected_at))::text AS last_at
       FROM event GROUP BY family`,
  );
  const parFamille = new Map(famillesBase.rows.map((f) => [f.family, f]));
  assert.equal(b.families.length, parFamille.size);
  for (const f of b.families) {
    const attendu = parFamille.get(f.family);
    assert.ok(attendu, `famille ${f.family} absente de la base`);
    assert.equal(f.ageHours, attendu.age_hours, `âge de ${f.family}`);
    assert.equal(Date.parse(f.lastEventAt ?? ""), Date.parse(attendu.last_at), `date de ${f.family}`);
    assert.equal(f.ageDays, Math.floor(Number(attendu.age_hours) / 24));
  }
});

test("le tableau paginé ne renvoie que la page demandée", async () => {
  const complet = await lireSources(`?q=${TAG}&pageSize=2&sort=name&dir=asc`);
  assert.equal(complet.total, await entier("SELECT count(*)::int AS n FROM source"));
  assert.equal(
    complet.counts.ok + complet.counts.error + complet.counts.pending,
    complet.total,
    "les trois états couvrent toutes les sources",
  );
  assert.equal(complet.matching, ALL_IDS.length, "les cinq sources du test correspondent au filtre");
  assert.equal(complet.pages, Math.ceil(ALL_IDS.length / 2));
  assert.equal(complet.items.length, 2, "la page porte exactement pageSize lignes");
  assert.deepEqual(
    Object.keys(complet.items[0]).sort(),
    ["enabled", "family", "id", "lastError", "lastErrorAt", "lastItems", "lastOkAt", "name", "status", "url"],
  );

  const suite = await lireSources(`?q=${TAG}&pageSize=2&sort=name&dir=asc&page=3`);
  assert.equal(suite.page, 3);
  assert.equal(suite.items.length, 1, "la dernière page porte le reliquat");
  const idsPage1 = await lireSources(`?q=${TAG}&pageSize=5&sort=name&dir=asc`);
  assert.deepEqual(idsPage1.items.map((s) => s.id).sort(), [...ALL_IDS].sort());
});

test("les filtres état, famille et recherche sont appliqués par SQL", async () => {
  const parEtat = await lireSources(`?q=${TAG}&status=pending&pageSize=50`);
  // Les cinq sources du test n'ont ni succès ni erreur : elles sont « en attente ».
  assert.equal(parEtat.matching, ALL_IDS.length);
  const ok = await lireSources(`?q=${TAG}&status=ok`);
  assert.equal(ok.matching, 0, "aucune source du test n'a de succès");
  const parFamille = await lireSources(`?q=${TAG}&family=cti&pageSize=50`);
  assert.equal(parFamille.matching, ALL_IDS.length);
  const autreFamille = await lireSources(`?q=${TAG}&family=cert_fr`);
  assert.equal(autreFamille.matching, 0);
  const sansCorrespondance = await lireSources(`?q=${TAG}-introuvable`);
  assert.equal(sansCorrespondance.matching, 0);
  assert.equal(sansCorrespondance.items.length, 0);
});

test("les bornes de pagination sont respectées, même hostiles", async () => {
  const enorme = await lireSources("?pageSize=100000&page=-3&sort=inconnu&dir=sideways");
  assert.ok(enorme.pageSize <= 200, `pageSize borné (${enorme.pageSize})`);
  assert.equal(enorme.page, 1, "une page négative retombe sur la première");
  assert.equal(enorme.items.length, 200, "la page est bornée à 200 lignes");
});
