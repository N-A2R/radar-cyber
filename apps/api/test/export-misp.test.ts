/**
 * Export MISP : 25 signaux dont 3 TLP:AMBER.
 *
 * Vérifie le critère de sortie sur une base réelle : la route rend 22 Events
 * MISP (les 3 AMBER sont absents), chaque Event passe le schéma MISP core
 * format (fixture dérivée de draft-dulaunoy-misp-core-format), et l'appel
 * écrit exactement une ligne `export_run` avec le SHA-256 du corps servi.
 *
 * Rejouer :
 *   pnpm -F @radar/api test -- test/export-misp.test.ts
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv from "ajv";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { closePools, query } from "../src/db.js";

const TAG = `misp${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const SOURCE = `misp-export-${TAG}`;
const AMBER_TITLES = [0, 1, 2].map((i) => `[AMBER] Signal restreint ${i} ${TAG}`);

type MispResponse = { response: Array<{ Event: Record<string, unknown> }> };

let app: FastifyInstance;
let bodyText = "";
let body: MispResponse;
let firstRunId = 0;
const ids: number[] = [];

const schema = JSON.parse(
	readFileSync(new URL("./fixtures/misp-core-format-event.schema.json", import.meta.url), "utf8"),
) as object;
const ajv = new Ajv({ allErrors: true, strict: false });
const validerEvent = ajv.compile(schema);

before(async () => {
	app = await buildApp();
	await app.ready();

	await query(
		`INSERT INTO source (id, name, family, url, retain_raw)
		 VALUES ($1, 'Source MISP de test', 'cti', 'https://example.invalid/misp', false)
		 ON CONFLICT (id) DO NOTHING`,
		[SOURCE],
	);

	for (let i = 0; i < 25; i += 1) {
		// Trois faits restreints, dont un déclaré uniquement dans evidence :
		// le trigger TLP de la migration 200 durcit alors la colonne.
		const ambre = i < 3;
		const tlpColonne = ambre ? (i === 1 ? "AMBER" : "TLP:AMBER") : i % 3 === 0 ? "TLP:GREEN" : "CLEAR";
		const evidence: { run_id: string; tlp?: string } = { run_id: "1" };
		if (i === 2) evidence.tlp = "TLP:AMBER";
		else if (!ambre && i % 3 === 0) evidence.tlp = "TLP:GREEN";
		const titre = ambre ? AMBER_TITLES[i]! : `Signal régional ${i} ${TAG}`;
		const observation = new Date(Date.UTC(2026, 10, 1, 10, i, 0)).toISOString();
		const inserted = await query<{ id: number }>(
			`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, evidence,
			                    tlp, regional, severity, confidence, observed_at)
			 VALUES ($1, 'cti', 'ambient_signal', $2, $3, $4, $5::jsonb, $6, $7, 3, 'B2', $8)
			 RETURNING id`,
			[
				`${TAG}-event-${i}`, titre, SOURCE, `https://example.invalid/misp/item-${i}`,
				JSON.stringify(evidence), tlpColonne, i % 2 === 0, observation,
			],
		);
		ids.push(Number(inserted.rows[0]!.id));
	}
});

after(async () => {
	if (ids.length > 0) await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [ids]);
	await query("DELETE FROM export_run WHERE filters->>'source' = $1", [SOURCE]);
	await query("DELETE FROM source WHERE id = $1", [SOURCE]);
	await app.close();
	await closePools();
});

test("25 signaux, 3 TLP:AMBER exclus : 22 Events MISP valides par le schéma", async () => {
	const res = await app.inject({ method: "GET", url: `/export/misp?source=${SOURCE}&limit=100` });
	assert.equal(res.statusCode, 200, res.body);
	assert.match(res.headers["content-type"] ?? "", /^application\/json/);
	bodyText = res.body;
	body = res.json<MispResponse>();

	assert.equal(body.response.length, 22, "22 faits diffusables attendus");
	assert.doesNotMatch(bodyText, /AMBER/i, "aucun TLP:AMBER ne doit apparaître dans le flux");
	for (const titre of AMBER_TITLES) assert.ok(!bodyText.includes(titre), `titre restreint fuité : ${titre}`);

	for (const item of body.response) {
		const ok = validerEvent(item);
		assert.ok(ok, `Event MISP invalide : ${JSON.stringify(validerEvent.errors)}`);
		const event = item.Event;
		assert.match(String(event.uuid), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		assert.ok(Array.isArray(event.Tag));
		const tlp = (event.Tag as Array<{ name: string }>).find((t) => t.name.startsWith("tlp:"));
		assert.ok(tlp?.name === "tlp:clear" || tlp?.name === "tlp:green", `tag TLP inattendu : ${tlp?.name}`);
	}

	const uuids = new Set(body.response.map((item) => String(item.Event.uuid)));
	assert.equal(uuids.size, 22, "les UUID MISP sont stables et uniques");

	const premier = await query<{
		id: number; sha256: string; event_count: number; excluded_count: number; payload_bytes: number;
	}>("SELECT id, sha256, event_count, excluded_count, payload_bytes FROM export_run WHERE format = 'misp'");
	assert.equal(premier.rows.length, 1, "un seul export journalisé");
	const run = premier.rows[0]!;
	firstRunId = Number(run.id);
	assert.equal(run.event_count, 22);
	assert.equal(run.excluded_count, 3);
	assert.equal(run.sha256, createHash("sha256").update(bodyText, "utf8").digest("hex"));
	assert.equal(Number(run.payload_bytes), Buffer.byteLength(bodyText, "utf8"));

	const total = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM export_run WHERE format = 'misp' AND sha256 IS NOT NULL",
	);
	assert.equal(total.rows[0]!.n, 1, "critère : une ligne export_run MISP avec sha256");
	console.log(
		`export/misp : ${body.response.length}/25 événements, 3 exclus, export_run=1, sha256=${run.sha256.slice(0, 16)}…`,
	);
});

test("les alias /api et /api/v1 servent le même flux", async () => {
	for (const url of [`/api/export/misp?source=${SOURCE}&limit=100`, `/api/v1/export/misp?source=${SOURCE}&limit=100`]) {
		const res = await app.inject({ method: "GET", url });
		assert.equal(res.statusCode, 200, `${url} : ${res.body}`);
		assert.equal(res.json<MispResponse>().response.length, 22, url);
		assert.equal(res.body, bodyText, `${url} doit rendre le même corps`);
		await query("DELETE FROM export_run WHERE id <> $1 AND filters->>'source' = $2", [firstRunId, SOURCE]);
	}
	const total = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM export_run WHERE format = 'misp' AND sha256 IS NOT NULL",
	);
	assert.equal(total.rows[0]!.n, 1, "les alias ne changent pas le critère de journalisation");
});
