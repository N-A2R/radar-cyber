/**
 * Graphe temporel : forme du contrat, fenêtre de validité et requête de
 * changement. La projection est reconstruite depuis la base de test éphémère
 * (aucune donnée de production, aucune écriture dans la base réelle).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import graphTemporalRoute from "../src/routes/graph-temporal.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `gt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const MARCH = "2026-03-10T10:00:00.000Z";
const DOMAIN = `${TAG}.example`;
const NOVEMBER = "2026-11-10T10:00:00.000Z";

let app: FastifyInstance;
let orgId: number;
const IP = "203.0.113.7";
let dnsCreated = false;

type TemporalResponse = {
  nodes: { id: string; label: string; kind: string; validFrom: string; validTo: string | null }[];
  links: { source: string; target: string; type: string; validFrom: string; validTo: string | null }[];
  meta: { at: string; entity: string | null; changedSince: string | null; returned: number };
};

const eventIds: Record<string, number> = {};

before(async () => {
  await query(
    `INSERT INTO source (id, name, family, url) VALUES ($1,$2,'ransomware','https://example.invalid/gt')`,
    [TAG, `Source graphe ${TAG}`],
  );
  const org = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, domain)
     VALUES ($1,$2,'entreprise','Gironde',$3) RETURNING id`,
    [`Organisation graphe ${TAG}`, `org-graphe-${TAG}`, DOMAIN],
  );
  orgId = org.rows[0]!.id;
  for (const [key, when, family, group] of [
    ["mars", MARCH, "ransomware", "lockbit3"],
    ["novembre", NOVEMBER, "vuln", "qilin"],
  ] as const) {
    const inserted = await query<{ id: number }>(
      `INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, valid_at,
                          source_id, org_id, evidence, source_url)
       VALUES ($1,$2,'observation',$3,$4,$4,$5,$6,$7::jsonb || '{"run_id":"1"}'::jsonb,'https://example.invalid/event') RETURNING id`,
      [`${TAG}-${key}`, family, `Fait ${key} ${TAG}`, when, TAG, orgId,
        JSON.stringify({ group })],
    );
    eventIds[key] = inserted.rows[0]!.id;
  }
  const dns = await query<{ reg: string | null }>("SELECT to_regclass('public.dns_domaine')::text AS reg");
  if (!dns.rows[0]?.reg) {
    dnsCreated = true;
    await query(`CREATE TABLE dns_domaine (
      domain text PRIMARY KEY, label text, org_ids integer[] NOT NULL DEFAULT '{}',
      active boolean NOT NULL DEFAULT true, first_seen timestamptz NOT NULL DEFAULT now(),
      last_try timestamptz, last_success timestamptz, last_state text NOT NULL DEFAULT 'jamais')`);
    await query(`CREATE TABLE dns_snapshot (
      id bigserial PRIMARY KEY, domain text NOT NULL REFERENCES dns_domaine(domain) ON DELETE CASCADE,
      observed_at timestamptz NOT NULL DEFAULT now(), a text[] NOT NULL DEFAULT '{}',
      aaaa text[] NOT NULL DEFAULT '{}', mx text[] NOT NULL DEFAULT '{}',
      ns text[] NOT NULL DEFAULT '{}', ptr jsonb NOT NULL DEFAULT '{}',
      registrar text, errors text[] NOT NULL DEFAULT '{}')`);
  }
  await query(
    `INSERT INTO dns_domaine (domain, label, org_ids, first_seen)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (domain) DO UPDATE SET org_ids = EXCLUDED.org_ids`,
    [DOMAIN, `Domaine ${TAG}`, [orgId], MARCH],
  );
  await query("INSERT INTO dns_snapshot (domain, observed_at, a) VALUES ($1,$2,$3)",
    [DOMAIN, MARCH, [IP]]);
  await query("SELECT refresh_graphe_temporal()");
  app = Fastify();
  await app.register(graphTemporalRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await supprimerEvenementsArchivees("dedup_key LIKE $1", [`${TAG}-%`]);
  await query("DELETE FROM org WHERE id = $1", [orgId]);
  await query("DELETE FROM source WHERE id = $1", [TAG]);
  await query("DELETE FROM dns_snapshot WHERE domain = $1", [DOMAIN]);
  await query("DELETE FROM dns_domaine WHERE domain = $1", [DOMAIN]);
  await query("SELECT refresh_graphe_temporal()");
  if (dnsCreated) {
    await query("DROP TABLE IF EXISTS dns_snapshot");
    await query("DROP TABLE IF EXISTS dns_domaine");
  }
  await closePools();
});

const get = async (url: string) => {
  const res = await app.inject({ method: "GET", url });
  assert.equal(res.statusCode, 200, res.body);
  return res.json<TemporalResponse>();
};

test("la réponse respecte la forme du graphe et ne contient que des liens satisfaits", async () => {
  const body = await get("/api/graph/temporal?limit=2000");
  const ids = new Set(body.nodes.map((node) => node.id));
  assert.deepEqual(Object.keys(body).sort(), ["links", "meta", "nodes"]);
  assert.ok(body.nodes.length > 0 && body.links.length > 0);
  for (const node of body.nodes) {
    for (const field of ["id", "label", "kind", "validFrom"] as const) {
      assert.equal(typeof node[field], "string", `${field} manquant sur ${node.id}`);
    }
  }
  for (const link of body.links) {
    assert.ok(ids.has(link.source) && ids.has(link.target), "aucun lien pendant");
    for (const field of ["source", "target", "type", "validFrom"] as const) {
      assert.equal(typeof link[field], "string", `${field} manquant sur ${link.type}`);
    }
    assert.ok("validTo" in link, "validTo est exposé, même quand il est nul");
  }
  const types = new Set(body.links.map((link) => link.type));
  for (const expected of ["targeted_by", "reported_by", "contains", "claims", "located_in", "owns_domain"]) {
    assert.ok(types.has(expected), `type ${expected} absent`);
  }
});

test("à une date D, seules les relations valides à D sont renvoyées", async () => {
  const mars = await get(`/api/graph/temporal?entity=org:${orgId}&at=2026-03-15T00:00:00Z`);
  assert.ok(mars.nodes.some((node) => node.id === `event:${eventIds.mars}`));
  assert.ok(!mars.nodes.some((node) => node.id === `event:${eventIds.novembre}`));
  assert.ok(mars.nodes.some((node) => node.id === "dept:Gironde"));
  const eventMarch = await get(`/api/graph/temporal?entity=event:${eventIds.mars}&at=2026-03-15T00:00:00Z`);
  assert.ok(eventMarch.nodes.some((node) => node.id === "group:lockbit3"));
  assert.ok(eventMarch.nodes.some((node) => node.id === `source:${TAG}`));
  assert.ok(!eventMarch.nodes.some((node) => node.id === "group:qilin"));
  assert.equal(mars.meta.entity, `org:${orgId}`);
  assert.equal(mars.meta.at, "2026-03-15T00:00:00.000Z");
});

test("les relations créées sur un mois sont isolées de celles du mois suivant", async () => {
  const mars = await get(
    `/api/graph/temporal?entity=org:${orgId}&changedSince=2026-03-01T00:00:00Z&changedUntil=2026-04-01T00:00:00Z`,
  );
  assert.ok(mars.links.some((link) => link.target === `event:${eventIds.mars}`));
  assert.ok(!mars.links.some((link) => link.target === `event:${eventIds.novembre}`));
  assert.equal(mars.meta.changedSince, "2026-03-01T00:00:00.000Z");

  const novembre = await get(
    `/api/graph/temporal?entity=org:${orgId}&changedSince=2026-11-01T00:00:00Z&changedUntil=2026-12-01T00:00:00Z`,
  );
  assert.ok(novembre.links.some((link) => link.target === `event:${eventIds.novembre}`));
  assert.ok(!novembre.links.some((link) => link.target === `event:${eventIds.mars}`));
});

test("les paramètres invalides sont refusés sans requête", async () => {
  for (const url of [
    "/api/graph/temporal?at=hier",
    "/api/graph/temporal?changedSince=2026-99-01",
    "/api/graph/temporal?limit=0",
    "/api/graph/temporal?limit=10001",
  ]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 400, url);
  }
});

test("une résolution DNS porte sa période de validité mesurée", async () => {
  const body = await get(`/api/graph/temporal?entity=domain:${DOMAIN}&at=2026-03-15T00:00:00Z`);
  assert.ok(body.nodes.some((node) => node.id === `ip:${IP}`));
  const link = body.links.find((l) => l.type === "resolves_to");
  assert.ok(link, "lien resolves_to absent");
  assert.equal(link.source, `domain:${DOMAIN}`);
  assert.equal(link.target, `ip:${IP}`);
  assert.equal(link.validFrom, MARCH);
});
