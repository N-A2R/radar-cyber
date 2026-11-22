/** GET /api/cyber-contracts — a fixed projection of public contract facts. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import cyberContractsRoute from "../src/routes/cyber-contracts.js";

let app: FastifyInstance;

before(async () => {
	app = Fastify({ logger: false });
	await app.register(cyberContractsRoute);
	await app.ready();
});

after(async () => {
	if (app) await app.close();
});

test("response exposes only organisation-level contract fields", async () => {
	const res = await app.inject({ method: "GET", url: "/cyber-contracts" });
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<{ markets: Record<string, unknown>[]; contracts: number }>();
	assert.ok(body.contracts > 0);
	assert.deepEqual(Object.keys(body.markets[0]).sort(), [
		"amountEur", "amountKind", "awardees", "buyer", "department",
		"firstPublished", "id", "noticeIds", "object",
	]);
	assert.ok(!/"(donnees|gestion|payload|victim|victime|email|telephone)":/i.test(res.body));
});

test("department filter narrows the market list", async () => {
	const all = await app.inject({ method: "GET", url: "/cyber-contracts" });
	const filtered = await app.inject({ method: "GET", url: "/cyber-contracts?dept=87" });
	assert.equal(filtered.statusCode, 200, filtered.body);
	const body = filtered.json<{ markets: { department: string }[]; contracts: number }>();
	assert.ok(body.contracts > 0 && body.contracts < all.json<{ contracts: number }>().contracts);
	assert.ok(body.markets.every((market) => market.department === "87"));
});
