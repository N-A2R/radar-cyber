/**
 * HTTP behavior of the public SPOF list: registry access, regional filtering,
 * threshold validation and anonymity. Each case uses isolated test rows.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { query } from "../src/db.js";
import providerSpofRoute from "../src/routes/provider-spof.js";
import { reglePour } from "../src/security/rbac.js";

const TAG = `sp${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SUFFIX = `${TAG}.spof.test`;
const PROVIDER = `Test SPOF Provider ${TAG}`;
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
			`Outside region ${TAG}`, `${TAG}-out`,
		],
	);
	const [naA, naB, outside] = result.rows.map((row) => row.id);
	await query(
		`INSERT INTO provider_domain (domain, org_ids, ns, mx)
		 VALUES ($1, $3::int[], $5::text[], '{}'::text[]),
		        ($2, $4::int[], $5::text[], '{}'::text[])`,
		[DOMAIN_A, DOMAIN_B, [naA, outside], [naB], [`ns1.${SUFFIX}`]],
	);
	app = Fastify({ logger: false });
	await app.register(providerSpofRoute, { prefix: "/api" });
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	await query("DELETE FROM provider_domain WHERE domain = ANY($1::text[])", [[DOMAIN_A, DOMAIN_B]]);
	await query("DELETE FROM dns_fournisseur WHERE suffix = $1", [SUFFIX]);
	await query("DELETE FROM org WHERE slug LIKE $1", [`${TAG}-%`]);
});

test("serves the SPOF list publicly from the route registry", async () => {
	assert.equal(reglePour("GET", "/api/na/provider-spof")?.niveau, "public");
	const response = await app.inject({ method: "GET", url: "/api/na/provider-spof?threshold=1" });
	assert.equal(response.statusCode, 200, response.body);
	assert.equal(response.json<{ scope: string }>().scope, "nouvelle-aquitaine");
});

test("counts only Nouvelle-Aquitaine organizations per provider", async () => {
	const response = await app.inject({ method: "GET", url: "/api/na/provider-spof?threshold=1" });
	const report = response.json<{
		providers: Array<{ name: string; categories: string[]; organizations: number; domains: number }>;
		totals: { organizationsObserved: number; organizationsAttributed: number };
	}>();
	assert.deepEqual(report.providers, [{
		name: PROVIDER, categories: ["dns"], organizations: 2, domains: 2,
	}]);
	assert.equal(report.totals.organizationsObserved, 2);
	assert.equal(report.totals.organizationsAttributed, 2);
});

test("rejects an invalid threshold", async () => {
	const response = await app.inject({ method: "GET", url: "/api/na/provider-spof?threshold=nope" });
	assert.equal(response.statusCode, 400);
	assert.equal(response.json<{ error: { code: string } }>().error.code, "INVALID_THRESHOLD");
});

test("never exposes organization names in the response", async () => {
	const response = await app.inject({ method: "GET", url: "/api/na/provider-spof?threshold=1" });
	assert.equal(response.body.includes(SECRET), false);
	assert.equal(response.body.includes(DOMAIN_A), false);
});
