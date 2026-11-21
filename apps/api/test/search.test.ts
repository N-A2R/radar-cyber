/**
 * Recherche globale : tsvector français, classement par pertinence, limite 50.
 *
 * Jeu isolé par TAG : une organisation au nom connu et des leurres qui
 * partagent ses jetons. On cherche le nom sans accents, en minuscules : c'est
 * la configuration `french` (et non une égalité exacte) qui doit la ramener
 * en tête. Le même principe est vérifié sur les événements.
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

	app = Fastify();
	await app.register(searchRoute);
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	await query("DELETE FROM event WHERE dedup_key LIKE $1", [`${TAG}-%`]);
	await query("DELETE FROM org WHERE slug LIKE $1", [`${TAG}-%`]);
	await query("DELETE FROM source WHERE id = $1", [SOURCE]);
	await closePools();
});

async function search(q: string): Promise<{ orgs: Array<{ id: number; name: string }>; events: Array<{ id: number; title: string }>; indicators: unknown[] }> {
	const res = await app.inject({ method: "GET", url: `/search?q=${encodeURIComponent(q)}` });
	assert.equal(res.statusCode, 200, res.body);
	return res.json();
}

test("un nom connu (sans accents) arrive en tête des organisations", async () => {
	const hits = await search(KNOWN_QUERY);
	assert.equal(hits.orgs[0]?.id, knownOrgId, `résultats : ${JSON.stringify(hits.orgs)}`);
	assert.equal(hits.orgs[0]?.name, KNOWN_NAME);
});

test("le titre d'événement est recherché et classé", async () => {
	const hits = await search(KNOWN_QUERY);
	assert.equal(Number(hits.events[0]?.id), knownEventId, `résultats : ${JSON.stringify(hits.events)}`);
});

test("la limite est 50 et les requêtes courtes ne interrogent pas la base", async () => {
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
		const short = await search("ab");
		assert.deepEqual(short, { orgs: [], events: [], indicators: [] });
	} finally {
		await query("DELETE FROM org WHERE slug LIKE $1", [`${TAG}-batch-%`]);
	}
});
