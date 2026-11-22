/**
 * Daily new-service detection against a throwaway database.
 *
 * Each test pins one behaviour: first observation is immutable, a new NA
 * service is recorded once with its latency, out-of-region organisations are
 * skipped, the pass keeps a daily cadence, and the read route exposes the
 * result with English field names.
 */
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { closePools, query } from "../src/db.js";
import { enregistrerServices, servicesDepuisInternetDb } from "../src/exposition/services.js";
import {
	resetNewServiceDetectionState,
	runNewServiceDetection,
} from "../src/exposition/new-service-monitor.js";
import newExposedServicesRoute from "../src/routes/exposition-new-services.js";

after(async () => { await closePools(); });
beforeEach(() => { resetNewServiceDetectionState(); });

async function createOrg(dept: string): Promise<number> {
	const slug = `new-service-${dept}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const result = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,$3,$4) RETURNING id",
		[`Organisation ${slug}`, slug, "collectivite", dept],
	);
	return result.rows[0]!.id;
}

async function expose(orgId: number, ip: string, consultedAt: Date): Promise<number> {
	const services = servicesDepuisInternetDb({ ip, ports: [443] }, { consulteLe: consultedAt });
	await enregistrerServices(orgId, services);
	const row = await query<{ id: string }>(
		"SELECT id FROM exposition_service WHERE org_id=$1 AND ip=$2 AND port=443",
		[orgId, ip],
	);
	return Number(row.rows[0]!.id);
}

test("a refresh moves consulted_at but never first_seen_at", async () => {
	const orgId = await createOrg("33");
	const first = new Date("2026-11-20T08:00:00.000Z");
	const serviceId = await expose(orgId, "198.51.100.10", first);

	await expose(orgId, "198.51.100.10", new Date("2026-11-21T08:00:00.000Z"));
	const row = await query<{ first_seen_at: Date; consulted_at: Date }>(
		"SELECT first_seen_at, consulted_at FROM exposition_service WHERE id=$1",
		[serviceId],
	);
	assert.equal(new Date(row.rows[0]!.first_seen_at).toISOString(), first.toISOString());
	assert.equal(new Date(row.rows[0]!.consulted_at).toISOString(), "2026-11-21T08:00:00.000Z");
});

test("the daily pass records a new service once with its measured latency", async () => {
	const orgId = await createOrg("Gironde");
	const firstSeen = new Date("2026-11-21T00:00:00.000Z");
	const serviceId = await expose(orgId, "198.51.100.20", firstSeen);

	const detectedAt = Date.parse("2026-11-21T12:00:00.000Z");
	const pass = await runNewServiceDetection({ now: detectedAt, force: true });
	assert.equal(pass.ran, true);
	assert.ok(pass.recorded >= 1);

	const rows = await query<{ first_seen_at: Date; detected_at: Date }>(
		"SELECT first_seen_at, detected_at FROM exposition_service_detection WHERE service_id=$1",
		[serviceId],
	);
	assert.equal(rows.rows.length, 1);
	assert.equal(new Date(rows.rows[0]!.first_seen_at).toISOString(), firstSeen.toISOString());
	assert.equal(new Date(rows.rows[0]!.detected_at).toISOString(), new Date(detectedAt).toISOString());

	const again = await runNewServiceDetection({ now: detectedAt + 86_400_000, force: true });
	assert.equal(again.recorded, 0);
	const count = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM exposition_service_detection WHERE service_id=$1",
		[serviceId],
	);
	assert.equal(count.rows[0]!.n, "1");
});

test("an out-of-region organisation is never recorded", async () => {
	const orgId = await createOrg("75");
	const serviceId = await expose(orgId, "198.51.100.30", new Date("2026-11-21T00:00:00.000Z"));

	await runNewServiceDetection({ now: Date.parse("2026-11-21T12:00:00.000Z"), force: true });
	const rows = await query(
		"SELECT 1 FROM exposition_service_detection WHERE service_id=$1",
		[serviceId],
	);
	assert.equal(rows.rows.length, 0);
});

test("the pass runs at most once per 24 hours unless forced", async () => {
	const start = Date.parse("2026-11-21T00:00:00.000Z");
	assert.equal((await runNewServiceDetection({ now: start })).ran, true);
	assert.equal((await runNewServiceDetection({ now: start + 3_600_000 })).ran, false);
	assert.equal((await runNewServiceDetection({ now: start + 3_600_000, force: true })).ran, true);
});

test("the read route returns recent detections with English field names", async () => {
	const orgId = await createOrg("64");
	const serviceId = await expose(orgId, "198.51.100.40", new Date("2026-11-21T02:00:00.000Z"));
	await runNewServiceDetection({ now: Date.now(), force: true });

	const app = Fastify({ logger: false });
	await app.register(newExposedServicesRoute, { prefix: "/api" });
	await app.ready();
	try {
		const response = await app.inject({ method: "GET", url: "/api/exposition/new-services?days=7" });
		assert.equal(response.statusCode, 200);
		const body = response.json() as {
			windowDays: number;
			targetHours: number;
			summary: { total: number; last24h: number };
			services: Record<string, unknown>[];
		};
		assert.equal(body.windowDays, 7);
		assert.equal(body.targetHours, 24);
		assert.ok(body.summary.total >= 1);
		const found = body.services.find((service) => service.serviceId === serviceId);
		assert.ok(found, "the new service is listed");
		assert.equal(found.orgId, orgId);
		assert.equal(typeof found.firstSeenAt, "string");
		assert.equal(typeof found.detectedAt, "string");
		assert.equal(typeof found.latencyHours, "number");
		assert.equal("first_seen_at" in found, false);
	} finally {
		await app.close();
	}
});
