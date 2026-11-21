/**
 * `/health/detail` — les chiffres affichés sont-ils les chiffres de la base ?
 *
 * Un test de forme (les clés) ne suffit pas : une route peut renvoyer des clés
 * correctes avec des compteurs inventés. Chaque entier est donc comparé à une
 * requête indépendante, exécutée ici dans la base de test — le même geste que
 * `psql` sur la base réelle.
 *
 * Isolation : cinq sources, une organisation, des événements et trois files
 * jetables, supprimés dans `after`.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import healthDetailRoute, { type HealthDetail } from "../src/routes/health-detail.js";

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
      `INSERT INTO source (id, name, family, url, enabled)
       VALUES ($1,$2,'cti','https://exemple.invalid/${key}',$3)`,
      [id, `${key} (test ${TAG})`, key !== "disabled"],
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
    `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, severity, source_id, org_id)
     VALUES ($1,$5,'ambient_signal','Fait vert (test)', now() - interval '2 hours',2,$9,$13),
            ($2,$6,'ambient_signal','Fait orange (test)', now() - interval '3 days',2,$10,$13),
            ($3,$7,'ambient_signal','Fait rouge (test)', now() - interval '10 days',2,$11,NULL),
            ($4,$8,'ambient_signal','Fait source désactivée (test)', now() - interval '2 hours',2,$12,NULL)`,
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
    "events24h", "families", "generatedAt", "ok", "orgs7j", "queues", "sources", "windowDays",
  ]);
  assert.deepEqual(Object.keys(body.sources).sort(), [
    "actives7j", "bySource", "declared", "enabled", "muettes7j",
  ]);
  assert.deepEqual(Object.keys(body.queues).sort(), ["pending", "promoted", "reviewed"]);
  const entiers = [
    body.sources.declared, body.sources.enabled, body.sources.actives7j,
    body.sources.muettes7j, body.events24h, body.orgs7j,
    body.queues.pending, body.queues.reviewed, body.queues.promoted,
  ];
  for (const n of entiers) assert.ok(Number.isInteger(n) && n >= 0, `entier attendu : ${n}`);
  for (const s of body.sources.bySource) {
    assert.ok(s.ageHours === null || (Number.isInteger(s.ageHours) && s.ageHours >= 0));
  }
  for (const f of body.families) {
    assert.ok(f.ageHours === null || Number.isInteger(f.ageHours));
    assert.ok(f.ageDays === null || Number.isInteger(f.ageDays));
  }
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

test("chaque source et chaque famille porte le bon âge et la bonne couleur", async () => {
  const b = await lire();
  const parId = new Map(b.sources.bySource.map((s) => [s.id, s]));
  const attendus: [keyof typeof IDS, string, number | null][] = [
    ["green", "green", 2],
    ["orange", "orange", 72],
    ["red", "red", 240],
    ["muette", "red", null],
    ["disabled", "green", 2],
  ];
  for (const [key, tone, age] of attendus) {
    const s = parId.get(IDS[key]);
    assert.ok(s, `source ${key} absente de la réponse`);
    assert.equal(s.tone, tone, `couleur de ${key}`);
    if (age === null) {
      assert.equal(s.ageHours, null, "une source sans fait n'a pas d'âge mesuré");
      assert.equal(s.lastEventAt, null);
    } else {
      assert.ok(s.ageHours !== null && Math.abs(s.ageHours - age) <= 1, `âge de ${key}`);
    }
    const collecte = await query<{ at: string | null }>(
      `SELECT COALESCE(max(finished_at), s.last_ok_at)::text AS at
         FROM collector_run r RIGHT JOIN source s ON s.id=r.source_id
        WHERE s.id=$1
        GROUP BY s.last_ok_at`,
      [IDS[key]],
    );
    assert.equal(
      s.lastCollectedAt === null ? null : Date.parse(s.lastCollectedAt),
      collecte.rows[0]?.at === null || collecte.rows[0]?.at === undefined ? null : Date.parse(collecte.rows[0].at),
      `collecte de ${key}`,
    );
  }

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
