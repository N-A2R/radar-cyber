/**
 * Complete Nouvelle-Aquitaine graph: one behaviour per test.
 * The projection is read from the ephemeral test database; production data is
 * never read or written here.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import graphCompletRoute from "../src/routes/graph-complet.js";

const TAG = `gc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const NA = TAG.toLowerCase();
const ALIAS = `Alias ${TAG} SARL`;
const VICTIM = `VICTIM_SENSITIVE_${TAG}`;
const CT_DOMAIN = `${NA}.na.example`;
const CT_HOST = `www.${CT_DOMAIN}`;
const DNS_DOMAIN = `${NA}-dns.na.example`;
const IP = "203.0.113.42";

type Edge = { source: string; target: string; type: string; evidence?: Record<string, unknown> };
type GraphResponse = {
  edges: Edge[];
  nodes: { id: string; kind: string }[];
  meta: {
    type: string | null;
    node: string | null;
    kind: string | null;
    limit: number;
    offset: number;
    returned: number;
    total?: number;
    byType?: Record<string, number>;
  };
};

let app: FastifyInstance;
let orgId: number;
let outsideOrgId: number;
let incidentId: number;

async function get(url: string): Promise<{ status: number; body: GraphResponse }> {
  const res = await app.inject({ method: "GET", url });
  return { status: res.statusCode, body: res.json<GraphResponse>() };
}

before(async () => {
  app = Fastify();
  await app.register(graphCompletRoute, { prefix: "/api" });
  await app.ready();

  const regional = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, city, secteur_groupe, naf, siren, entity_code)
     VALUES ($1,$2,'entreprise','33','Bordeaux','sante','8610Z','123456789','123456789')
     RETURNING id`,
    [`Regional Org ${TAG}`, `regional-${NA}`],
  );
  orgId = regional.rows[0]!.id;

  const outside = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'entreprise','75') RETURNING id`,
    [`Outside Org ${TAG}`, `outside-${NA}`],
  );
  outsideOrgId = outside.rows[0]!.id;

  await query(
    `INSERT INTO org_alias (org_id, alias, source) VALUES ($1,$2,'sirene')`,
    [orgId, ALIAS],
  );

  const claim = await query<{ id: number }>(
    `INSERT INTO leak_claim (fingerprint, source, site_slug, group_name, victim, org_id, na)
     VALUES ($1,'press','site','LockBit', $2, $3, true) RETURNING id`,
    [`fingerprint-${NA}`, VICTIM, orgId],
  );
  incidentId = claim.rows[0]!.id;

  await query(
    `INSERT INTO ct_sous_domaine (sous_domaine, domaine, organisation, source, premiere_vue, certificat_id, emetteur)
     VALUES ($1,$2,'Regional Org','crt.sh', now(),$3,'Let us Encrypt')`,
    [CT_HOST, CT_DOMAIN, `${TAG}-cert`],
  );

  await query(`INSERT INTO dns_domaine (domain, org_ids) VALUES ($1, ARRAY[$2]::integer[])`,
    [DNS_DOMAIN, orgId]);
  await query(`INSERT INTO dns_snapshot (domain, a) VALUES ($1, ARRAY[$2]::text[])`,
    [DNS_DOMAIN, IP]);
});

after(async () => {
  await query("DELETE FROM dns_snapshot WHERE domain = $1", [DNS_DOMAIN]);
  await query("DELETE FROM dns_domaine WHERE domain = $1", [DNS_DOMAIN]);
  await query("DELETE FROM ct_sous_domaine WHERE domaine = $1", [CT_DOMAIN]);
  await query("DELETE FROM leak_claim WHERE id = $1", [incidentId]);
  await query("DELETE FROM org_alias WHERE org_id IN ($1,$2)", [orgId, outsideOrgId]);
  await query("DELETE FROM org WHERE id IN ($1,$2)", [orgId, outsideOrgId]);
  await app.close();
  await closePools();
});

test("returns the department edge of a regional organisation", async () => {
  const { status, body } = await get(`/api/graph/complet?node=org:${orgId}&type=located_in`);
  assert.equal(status, 200);
  assert.deepEqual(
    body.edges.map((e) => [e.type, e.target]),
    [["located_in", "dept:33"]],
  );
});

test("excludes organisations outside Nouvelle-Aquitaine", async () => {
  const { status, body } = await get(`/api/graph/complet?node=org:${outsideOrgId}`);
  assert.equal(status, 200);
  assert.equal(body.edges.length, 0);
});

test("hashes aliases instead of exposing their clear-text name", async () => {
  const { status, body } = await get(`/api/graph/complet?node=org:${orgId}&type=has_alias`);
  assert.equal(status, 200);
  const digest = createHash("md5").update(ALIAS.toLowerCase()).digest("hex");
  assert.equal(body.edges[0]?.target, `alias:${digest}`);
  assert.equal(JSON.stringify(body).includes(ALIAS), false);
});

test("links an incident to its organisation without victim data", async () => {
  const { status, body } = await get(`/api/graph/complet?node=incident:${incidentId}`);
  assert.equal(status, 200);
  assert.deepEqual(
    body.edges.map((e) => e.type).sort(),
    ["affects", "claimed_by"],
  );
  assert.equal(JSON.stringify(body).includes(VICTIM), false);
});

test("links a domain to its host, certificate and issuer", async () => {
  const domain = await get(`/api/graph/complet?node=domain:${CT_DOMAIN}&type=has_host`);
  const host = await get(`/api/graph/complet?node=host:${CT_HOST}&type=signed_by`);
  const cert = await get(`/api/graph/complet?node=cert:${TAG}-cert`);
  assert.equal(domain.status, 200);
  assert.equal(domain.body.edges[0]?.target, `host:${CT_HOST}`);
  assert.equal(host.body.edges[0]?.target, `cert:${TAG}-cert`);
  assert.deepEqual(cert.body.edges.map((e) => e.type).sort(), ["issued_by", "signed_by"]);
});

test("links a domain to the IP address observed in DNS", async () => {
  const { status, body } = await get(`/api/graph/complet?node=domain:${DNS_DOMAIN}&type=resolves_to`);
  assert.equal(status, 200);
  assert.deepEqual(body.edges.map((e) => e.target), [`ip:${IP}`]);
});

test("filters edges by target kind", async () => {
  const { status, body } = await get(`/api/graph/complet?kind=ip`);
  assert.equal(status, 200);
  assert.ok(body.edges.length > 0);
  assert.ok(body.edges.every((e) => e.target.startsWith("ip:")));
});

test("reports total edge count and per-type breakdown with stats", async () => {
  const { status, body } = await get(`/api/graph/complet?stats=true`);
  assert.equal(status, 200);
  assert.ok((body.meta.total ?? 0) >= 8);
  assert.ok((body.meta.byType?.located_in ?? 0) >= 1);
});

test("rejects invalid paging parameters", async () => {
  for (const url of ["/api/graph/complet?limit=0", "/api/graph/complet?offset=-1"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 400);
  }
});
