/**
 * Global search: bounded trigram matching over the full corpus.
 *
 * Each test owns one behaviour. Rows are isolated by TAG and removed in
 * `after`, so the suite never depends on the content of the working database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import searchRoute from "../src/routes/search.js";

const TAG = `sch${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
const KNOWN_NAME = "Hôpital Universitaire de Rennes";
const KNOWN_QUERY = "hopital universitaire rennes";
const INDICATOR_ID = 1_000_000_000 + Math.floor(Math.random() * 1_000_000_000);
let app: FastifyInstance;
let knownOrgId: number;
let knownEventId: number;

before(async () => {
	const orgs = [
		[KNOWN_NAME, `${TAG}-connu`, "Rennes"],
		["Hôpital de Rennes", `${TAG}-hopital`, "Rennes"],
		["Université de Rennes", `${TAG}-universite`, "Rennes"],
		["Centre Hospitalier Universitaire de Brest", `${TAG}-brest`, "Brest"],
	] as const;
	for (const [name, slug, city] of orgs) {
		const r = await query<{ id: number }>(
			`INSERT INTO org (name, slug, kind, city, dept, status)
			 VALUES ($1, $2, 'sante', $3, '35', 'confirme') RETURNING id`,
			[name, slug, city],
		);
		if (name === KNOWN_NAME) knownOrgId = Number(r.rows[0].id);
	}
	await query(
		"INSERT INTO source (id, name, family, url, retain_raw) VALUES ($1, $2, 'ransomware', 'https://example.test/s', false)",
		[SOURCE, `Source ${TAG}`],
	);
	const events = [
		[`${TAG}-connu`, `Ransomware : ${KNOWN_NAME} en analyse`, knownOrgId],
		[`${TAG}-autre`, "Ransomware : un autre établissement à Brest", null],
	] as const;
	for (const [dedupKey, title, orgId] of events) {
		const r = await query<{ id: number }>(
			`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, org_id)
			 VALUES ($1, 'ransomware', 'confirmed_incident', $2, $3, $4) RETURNING id`,
			[dedupKey, title, SOURCE, orgId],
		);
		if (dedupKey === `${TAG}-connu`) knownEventId = Number(r.rows[0].id);
	}
	await query(
		`INSERT INTO indicator (id, type, value, first_seen, last_seen, tlp)
		 VALUES ($1, 'domain', $2, now(), now(), 'clear')`,
		[INDICATOR_ID, `${TAG}.example.test`],
	);

	app = Fastify();
	await app.register(searchRoute);
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	await query("DELETE FROM event WHERE dedup_key LIKE $1", [`${TAG}-%`]);
	await query("DELETE FROM org WHERE slug LIKE $1", [`${TAG}-%`]);
	await query("DELETE FROM indicator WHERE id = $1", [INDICATOR_ID]);
	await query("DELETE FROM source WHERE id = $1", [SOURCE]);
	await closePools();
});

async function search(q: string): Promise<{ orgs: Array<{ id: number; name: string }>; events: Array<{ id: number; title: string }>; indicators: Array<{ id: number; value: string }> }> {
	const res = await app.inject({ method: "GET", url: `/search?q=${encodeURIComponent(q)}` });
	assert.equal(res.statusCode, 200, res.body);
	return res.json();
}

test("an accent-free multi-token query ranks the exact organisation first", async () => {
	const hits = await search(KNOWN_QUERY);
	assert.equal(hits.orgs[0]?.id, knownOrgId, `results: ${JSON.stringify(hits.orgs)}`);
	assert.equal(hits.orgs[0]?.name, KNOWN_NAME);
});

test("event titles are searched through their normalized columns", async () => {
	const hits = await search(KNOWN_QUERY);
	assert.equal(Number(hits.events[0]?.id), knownEventId, `results: ${JSON.stringify(hits.events)}`);
});

test("indicator values are searched by substring", async () => {
	const hits = await search(TAG);
	assert.equal(Number(hits.indicators[0]?.id), INDICATOR_ID);
});

test("short queries return empty lists without touching the database", async () => {
	assert.deepEqual(await search("ab"), { orgs: [], events: [], indicators: [] });
});

test("a broad query returns at most 50 distinct organisations", async () => {
	const batch = Array.from({ length: 55 }, (_, i) => `Organisation Batch ${TAG} ${String(i).padStart(2, "0")}`);
	for (const [i, name] of batch.entries()) {
		await query(
			"INSERT INTO org (name, slug, kind, status) VALUES ($1, $2, 'entreprise', 'confirme')",
			[name, `${TAG}-batch-${i}`],
		);
	}
	try {
		const hits = await search(`organisation batch ${TAG}`);
		assert.equal(hits.orgs.length, 50);
		assert.equal(new Set(hits.orgs.map((org) => org.id)).size, 50);
	} finally {
		await query("DELETE FROM org WHERE slug LIKE $1", [`${TAG}-batch-%`]);
	}
});

test("common French function words do not dilute the ranking", async () => {
	const hits = await search(`hopital de ${TAG}`);
	assert.equal(hits.orgs.findIndex((org) => org.id === knownOrgId), 0);
});
