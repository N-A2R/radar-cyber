/**
 * GET /api/orgs/:id sur la base de test dédiée.
 *
 * Le jeu inséré dépasse volontairement les bornes annoncées (52 alias,
 * 24 événements) pour prouver que la fiche tranche, ordonne et déduplique,
 * et qu'un identifiant absent répond 404.
 *
 * Rejouer : pnpm -F @radar/api test -- test/orgs-fiche.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import orgsRoute from "../src/routes/orgs.js";
import { installErrorHandler } from "../src/errors.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `fiche${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const EMAIL = `${TAG}@orgs-fiche.test`;
const TOKEN = `tok-${TAG}`;
const auth = { authorization: `Bearer ${TOKEN}` };

const SOURCES = [`${TAG}-src-a`, `${TAG}-src-b`, `${TAG}-src-c`];
const ALIASES = Array.from({ length: 52 }, (_, i) => `${TAG}-alias-${String(i).padStart(2, "0")}`);
const EVENT_COUNT = 24;

type Fiche = {
  org: { id: number; name: string; slug: string; domain: string | null; website: string | null };
  aliases: string[];
  domains: string[];
  sourceCount: number;
  events: {
    total: number;
    recent: { id: string; title: string; observedAt: string | null }[];
  };
};

let app: FastifyInstance;
let orgId: number;
let userId: number;

before(async () => {
  const user = await query<{ id: number }>(
    "INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','lecteur') RETURNING id",
    [EMAIL],
  );
  userId = Number(user.rows[0].id);
  await query(
    "INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
    [hashSessionToken(TOKEN), userId],
  );

  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, sector, city, dept, website, domain, status)
     VALUES ($1,$2,'entreprise','informatique','Bordeaux','33',$3,$4,'confirme') RETURNING id`,
    [`Organisation Fiche ${TAG}`, `${TAG}-org`, `https://www.${TAG}.example/`, `${TAG}.example`],
  );
  orgId = Number(org.rows[0].id);

  for (const [i, id] of SOURCES.entries()) {
    await query(
      "INSERT INTO source (id, name, family, url) VALUES ($1,$2,'cti',$3)",
      [id, `Source ${i} ${TAG}`, `https://${TAG}.example/${i}`],
    );
  }

  await query(
    `INSERT INTO org_alias (org_id, alias, source, status)
     SELECT $1, a, 'test', 'active' FROM unnest($2::text[]) AS a`,
    [orgId, ALIASES],
  );
  await query(
    `INSERT INTO org_alias (org_id, alias, source, status, valid_to) VALUES
       ($1,$2,'test','rejected',NULL),
       ($1,$3,'test','active',now() - interval '1 day')`,
    [orgId, `${TAG}-alias-rejete`, `${TAG}-alias-expire`],
  );

  await query(
    `INSERT INTO asset (org_id, kind, value) VALUES
       ($1,'domain',$2), ($1,'subdomain',$3), ($1,'domain',$4), ($1,'ip','198.51.100.7')`,
    [orgId, `${TAG}-asset.example`, `www.${TAG}-asset.example`, `${TAG}.example`],
  );

  const base = Date.now();
  for (let i = 0; i < EVENT_COUNT; i++) {
    await query(
      `INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, org_id, observed_at, source_url, evidence)
       VALUES ($1,'cti','confirmed_incident',$2,2,$3,$4,$5,'https://example.invalid/event','{"run_id":"1","tlp":"CLEAR"}'::jsonb)`,
      [
        `${TAG}-event-${i}`,
        `Événement ${i}`,
        SOURCES[i % SOURCES.length],
        orgId,
        new Date(base - (EVENT_COUNT - i) * 60_000).toISOString(),
      ],
    );
  }

  app = Fastify({ logger: false });
  installErrorHandler(app);
  await app.register(orgsRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await supprimerEvenementsArchivees("dedup_key LIKE $1", [`${TAG}-event-%`]);
  await query("DELETE FROM org_alias WHERE org_id=$1", [orgId]);
  await query("DELETE FROM org WHERE id=$1", [orgId]); // les actifs partent en cascade
  await query("DELETE FROM source WHERE id = ANY($1::text[])", [SOURCES]);
  await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
  await query("DELETE FROM app_user WHERE id=$1", [userId]);
  await closePools();
});

test("la fiche renvoie identité, 50 alias, domaines, 20 événements et sources", async () => {
  const res = await app.inject({ method: "GET", url: `/api/orgs/${orgId}`, headers: auth });
  assert.equal(res.statusCode, 200, res.body.slice(0, 300));
  const body = res.json<Fiche>();

  assert.equal(body.org.id, orgId);
  assert.equal(body.org.name, `Organisation Fiche ${TAG}`);
  assert.equal(body.org.slug, `${TAG}-org`);
  assert.equal(body.org.domain, `${TAG}.example`);
  assert.equal(body.org.website, `https://www.${TAG}.example/`);

  assert.equal(body.aliases.length, 50, "les alias sont bornés à 50");
  assert.deepEqual(body.aliases, ALIASES.slice(0, 50));
  assert.ok(!body.aliases.some((a) => a.includes("rejete") || a.includes("expire")));

  assert.deepEqual(body.domains, [`${TAG}-asset.example`, `${TAG}.example`]);

  assert.equal(body.sourceCount, SOURCES.length, "une source comptée une seule fois");
  assert.equal(body.events.total, EVENT_COUNT);
  assert.equal(body.events.recent.length, 20, "les événements récents sont bornés à 20");
  assert.deepEqual(
    body.events.recent.map((e) => e.title),
    Array.from({ length: 20 }, (_, i) => `Événement ${EVENT_COUNT - 1 - i}`),
    "du plus récent au plus ancien",
  );
});

test("404 explicite quand l'organisation est absente", async () => {
  for (const url of [`/api/orgs/${orgId + 1_000_000}`, "/api/orgs/pas-un-id"]) {
    const res = await app.inject({ method: "GET", url, headers: auth });
    assert.equal(res.statusCode, 404, `${url} : ${res.body.slice(0, 200)}`);
    assert.deepEqual(res.json(), { error: { code: "NOT_FOUND", message: "not found", details: null } });
  }
});

test("la fiche exige un jeton valide", async () => {
  for (const headers of [{}, { authorization: "Bearer jeton-inexistant" }]) {
    const res = await app.inject({ method: "GET", url: `/api/orgs/${orgId}`, headers });
    assert.equal(res.statusCode, 401);
  }
});
