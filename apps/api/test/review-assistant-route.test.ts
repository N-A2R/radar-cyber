/**
 * GET /api/review-assistant/suggest — English response, no stored state.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import reviewAssistantRoute from "../src/routes/review-assistant.js";

let app: FastifyInstance;

before(async () => {
	app = Fastify({ logger: false });
	await app.register(reviewAssistantRoute);
	await app.ready();
});

after(async () => {
	if (app) await app.close();
});

test("the endpoint returns an English suggestion for a French locality", async () => {
	const res = await app.inject({ method: "GET", url: "/review-assistant/suggest?hint=Universite%20Paris%20Sud" });
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<Record<string, unknown>>();
	assert.equal(body.action, "review");
	assert.equal(body.reason, "na-scope-signal");
	assert.deepEqual(Object.keys(body).sort(), [
		"action", "claimId", "confidence", "personalDataFindings", "reason", "scope",
	]);
});

test("the endpoint rejects a declared country outside the region", async () => {
	const res = await app.inject({
		method: "GET",
		url: "/review-assistant/suggest?hint=acme.com%5C%241M%5CUSA%5C40GB%5C100%25%20DISCLOSED",
	});
	assert.equal(res.statusCode, 200, res.body);
	assert.equal(res.json<{ action: string }>().action, "reject");
});

test("the response never echoes the submitted hint", async () => {
	const res = await app.inject({
		method: "GET",
		url: "/review-assistant/suggest?hint=Private%20Victim%20Name&hasDescription=true",
	});
	assert.equal(res.statusCode, 200, res.body);
	assert.ok(!/Private|Victim/i.test(res.body));
	assert.equal(res.json<{ personalDataFindings: number }>().personalDataFindings, 0);
});
