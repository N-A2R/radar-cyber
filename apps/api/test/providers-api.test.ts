/**
 * HTTP behavior of the public provider map: regional filtering, concentration
 * counts and anonymity. Each case uses isolated rows in the test database.
 *
 * Replay: pnpm -F @radar/api test -- test/providers-api.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { query } from "../src/db.js";
import providersRoute from "../src/routes/providers.js";
import { reglePour } from "../src/security/rbac.js";

const TAG = `pv${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SUFFIX = `${TAG}.provider.test`;
const PROVIDER = `Test Provider ${TAG}`;
const SECRET = `Non-public organization ${TAG}`;
const DOMAIN_A = `a-${TAG}.fr`;
const DOMAIN_B = `b-${TAG}.fr`;

let app: FastifyInstance;

before(async () => {
  await query(
    "INSERT INTO dns_fournisseur (suffix, name, category, mode) VALUES ($1, $2, 'dns', 'suffix')",
    [SUFFIX, PROVIDER],
  );
  const result = await query<{ id: number }>(
    `INSERT INTO org (name, slug, kind, dept, lat, lon, status)
     VALUES ($1, $2, 'entreprise', '33', 45.8, 0.6, 'confirme'),
            ($3, $4, 'entreprise', '24', 45.2, 0.2, 'confirme'),
            ($5, $6, 'entreprise', '75', 48.8, 2.3, 'confirme')
     RETURNING id`,
    [
      SECRET, `${TAG}-a`,
      `Second organization ${TAG}`, `${TAG}-b`,
      `Hors region ${TAG}`, `${TAG}-hors`,
    ],
  );
  const [naA, naB, outside] = result.rows.map((row) => row.id);
  await query(
    `INSERT INTO provider_domain (domain, org_ids, ns, mx, errors)
     VALUES ($1, $3::int[], $5::text[], '{}'::text[], '{}'::text[]),
            ($2, $4::int[], $5::text[], '{}'::text[], '{}'::text[])`,
    [DOMAIN_A, DOMAIN_B, [naA, outside], [naB], [`ns1.${SUFFIX}`]],
  );
  app = Fastify({ logger: false });
  await app.register(providersRoute, { prefix: "/api" });
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  await query("DELETE FROM provider_domain WHERE domain = ANY($1::text[])", [[DOMAIN_A, DOMAIN_B]]);
  await query("DELETE FROM dns_fournisseur WHERE suffix = $1", [SUFFIX]);
  await query("DELETE FROM org WHERE slug LIKE $1", [`${TAG}-%`]);
});

test("serves the provider map publicly from the route registry", async () => {
  assert.equal(reglePour("GET", "/api/na/providers")?.niveau, "public");
  const response = await app.inject({ method: "GET", url: "/api/na/providers" });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.headers.etag !== undefined, true);
});

test("counts only Nouvelle-Aquitaine organizations per provider", async () => {
  const response = await app.inject({ method: "GET", url: "/api/na/providers" });
  const report = response.json<{
    totals: { organizationsAttributed: number; domainsObserved: number };
    concentration: { topProvider: { name: string; organizations: number } };
    providers: Array<{ name: string; organizations: number }>;
  }>();
  assert.equal(report.totals.organizationsAttributed, 2);
  assert.equal(report.totals.domainsObserved, 2);
  assert.equal(report.concentration.topProvider.name, PROVIDER);
  assert.equal(report.concentration.topProvider.organizations, 2);
  assert.deepEqual(
    report.providers.map((provider) => provider.organizations),
    [2],
  );
});

test("never exposes organization names in the response", async () => {
  const response = await app.inject({ method: "GET", url: "/api/na/providers" });
  assert.ok(!response.body.includes(SECRET), "organization names must stay out of the map");
  for (const point of response.json<{ organizationPoints: Array<Record<string, unknown>> }>()
    .organizationPoints) {
    assert.deepEqual(Object.keys(point).sort(), ["dept", "lat", "lon", "orgId", "providers"]);
  }
});
