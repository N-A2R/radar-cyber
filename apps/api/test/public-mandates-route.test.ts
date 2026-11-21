/**
 * GET /api/public-mandates — the public projection must stay role-level.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import publicMandatesRoute from "../src/routes/public-mandates.js";

const TAG = `pmr${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const SLUG_A = `na-commune-${TAG}-a`;
const SLUG_B = `na-commune-${TAG}-b`;
let orgIds: number[] = [];
let app: FastifyInstance;

before(async () => {
	const inserted = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, dept) VALUES
		    ($1,$2,'collectivite','16'), ($1,$3,'collectivite','17') RETURNING id`,
		[`Commune ${TAG}`, SLUG_A, SLUG_B],
	);
	orgIds = inserted.rows.map((row) => Number(row.id));
	await query(
		`INSERT INTO public_mandate
		    (org_id, siren, mandate_role, jurisdiction_kind, jurisdiction_code, dept, source, proof_url)
		 VALUES ($1,NULL,'mayor','commune',$3,'16','test-source','https://example.invalid/proof'),
		        ($2,NULL,'mayor','commune',$4,'17','test-source','https://example.invalid/proof')`,
		[orgIds[0], orgIds[1], `${TAG}1`, `${TAG}2`],
	);
	app = Fastify({ logger: false });
	await app.register(publicMandatesRoute);
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	await query("DELETE FROM public_mandate WHERE org_id = ANY($1::bigint[])", [orgIds]);
	await query("DELETE FROM org WHERE id = ANY($1::int[])", [orgIds]);
	await closePools();
});

test("response exposes only role-level office fields", async () => {
	const res = await app.inject({ method: "GET", url: "/public-mandates?limit=10" });
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<{ total: number; byRole: Record<string, number>; mandates: unknown[] }>();
	assert.equal(body.total, 2);
	assert.equal(body.byRole.mayor, 2);
	assert.equal(body.byRole.epci_president, 0);
	assert.equal(body.mandates.length, 2);
	assert.deepEqual(
		Object.keys(body.mandates[0] as object).sort(),
		["dept", "jurisdictionCode", "jurisdictionKind", "mandateRole", "orgId", "proofUrl", "siren", "source"],
	);
	assert.ok(!/name|email|phone|victim/i.test(res.body));
});

test("role and department filters are applied", async () => {
	const byRole = await app.inject({ method: "GET", url: "/public-mandates?role=mayor&dept=16" });
	assert.equal(byRole.statusCode, 200, byRole.body);
	assert.equal(byRole.json<{ total: number }>().total, 1);
	const wrongDept = await app.inject({ method: "GET", url: "/public-mandates?dept=75" });
	assert.equal(wrongDept.json<{ total: number }>().total, 2, "invalid dept is ignored, not applied");
	const wrongRole = await app.inject({ method: "GET", url: "/public-mandates?role=unknown" });
	assert.equal(wrongRole.json<{ total: number }>().total, 2, "invalid role is ignored, not applied");
});
