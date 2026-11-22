/**
 * Behavior: the public English endpoint reports archive metadata only and is
 * declared in the access-control matrix.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools } from "../src/db.js";
import warcProofsRoute from "../src/routes/warc-proofs.js";
import { POLITIQUE_ACCES } from "../src/security/rbac.js";

let app: FastifyInstance;

before(async () => {
	app = Fastify({ logger: false });
	await app.register(warcProofsRoute);
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	await closePools();
});

test("GET /warc/proofs returns English counters without archived bodies", async () => {
	const res = await app.inject({ method: "GET", url: "/warc/proofs" });
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<Record<string, unknown>>();
	for (const key of ["eligibleFacts", "factsWithArchivableProof", "target", "coveragePercent", "recent"]) {
		assert.ok(key in body, `${key} must be published`);
	}
	assert.equal(body.scope, "Nouvelle-Aquitaine");
	assert.match(String(body.definition), /verified on disk/);
	assert.ok(!/victim|@|<html/i.test(res.body));
});

test("the route is declared public in the access matrix", () => {
	assert.ok(
		POLITIQUE_ACCES.some((r) => r.methode === "GET" && r.route === "/api/warc/proofs" && r.niveau === "public"),
	);
});
