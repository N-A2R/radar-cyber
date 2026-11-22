/**
 * `/ingest` — le contrat appliqué à la porte HTTP.
 *
 * Cette route n'avait **aucun test**. Elle accepte des événements poussés par
 * des bots ; c'est l'entrée la moins contrôlée du système, et celle où une
 * famille inventée se retrouvait en base sans bruit. On vérifie ici que le
 * contrat tranche, que les réparations passent, et que le client reçoit de
 * quoi se corriger.
 *
 * Isolation : compte et jeton jetables, événements préfixés, tout est supprimé
 * dans `after`. La route est montée seule, sans les collecteurs.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { query, closePools } from "../src/db.js";
import ingestRoute from "../src/routes/ingest.js";
import { hashSessionToken } from "../src/auth.js";

const TAG = `ing${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const EMAIL = `${TAG}@exemple.invalid`;
const TOKEN = randomBytes(24).toString("hex");
const PREFIX = `test-${TAG}:`;

let app: FastifyInstance;
let userId: number;
/** Vrai si ce test a cree la source : on ne supprime que ce qu'on a cree. */
let createdSource = false;
const DEFAULT_SOURCE = "hermes_radar_cyber";

before(async () => {
	// La base de test ne charge que `init.sql` + migrations + quelques sources
	// de fixture, pas les 16 catalogues. On cree la source attendue par le
	// defaut de la route, et seulement elle.
	const exists = await query("SELECT id FROM source WHERE id = $1", [DEFAULT_SOURCE]);
	if ((exists.rowCount ?? 0) === 0) {
		await query(
			`INSERT INTO source (id, name, family, url, kind, enabled)
			 VALUES ($1,'Hermes (jeu de test)','cti','https://exemple.invalid/hermes','interne',false)`,
			[DEFAULT_SOURCE],
		);
		createdSource = true;
	}

	const u = await query<{ id: number }>(
		`INSERT INTO app_user (email, password_hash, role) VALUES ($1,$2,'analyste') RETURNING id`,
		[EMAIL, createHash("sha256").update("jetable").digest("hex")],
	);
	userId = Number(u.rows[0].id);
	await query(
		`INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')`,
		[hashSessionToken(TOKEN), userId],
	);
	app = Fastify();
	await app.register(ingestRoute);
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	await query("DELETE FROM alert WHERE event_id IN (SELECT id FROM event WHERE dedup_key LIKE $1)", [`${PREFIX}%`]);
	await query("DELETE FROM event WHERE dedup_key LIKE $1", [`${PREFIX}%`]);
	await query("DELETE FROM app_session WHERE user_id = $1", [userId]);
	await query("DELETE FROM app_user WHERE id = $1", [userId]);
	// Les runs de la route /ingest citent la source : ils partent avant elle.
	await query("DELETE FROM collector_run WHERE source_id = $1", [DEFAULT_SOURCE]);
	if (createdSource) await query("DELETE FROM source WHERE id = $1", [DEFAULT_SOURCE]);
	await closePools();
});

function post(events: unknown[], token: string | null = TOKEN) {
	return app.inject({
		method: "POST",
		url: "/ingest",
		headers: token ? { authorization: `Bearer ${token}` } : {},
		payload: { profile: TAG, events },
	});
}

function item(suffix: string, overrides: Record<string, unknown> = {}) {
	return { dedup_key: `${PREFIX}${suffix}`, title: `Alerte de test ${suffix}`, ...overrides };
}

test("sans jeton, l'ingestion est refusée", async () => {
	const r = await post([item("anon")], null);
	assert.equal(r.statusCode, 401);
});

test("un lot conforme est inséré, un rejeu n'ajoute rien", async () => {
	const first = await post([item("ok1"), item("ok2")]);
	assert.equal(first.statusCode, 200);
	const body = first.json();
	assert.equal(body.inserted, 2);
	assert.equal(body.skipped, 0);

	const replay = await post([item("ok1"), item("ok2")]);
	assert.equal(replay.json().inserted, 0);
	assert.equal(replay.json().skipped, 2, "déduplication par clé");

	const stored = await query<{ family: string; assertion_type: string }>(
		"SELECT family, assertion_type FROM event WHERE dedup_key = $1",
		[`${PREFIX}ok1`],
	);
	assert.equal(stored.rows[0].family, "cti", "défaut historique conservé");
	assert.equal(stored.rows[0].assertion_type, "ambient_signal");
});

test("famille inconnue : rejetée, motif rendu au client", async () => {
	const r = await post([item("badfam", { family: "darkweb" })]);
	assert.equal(r.statusCode, 200);
	const body = r.json();
	assert.equal(body.inserted, 0);
	assert.equal(body.skipped, 1);
	assert.equal(body.rejected[0].reasons[0], "famille-inconnue");
	assert.equal(body.contract.rejections[0].count, 1);

	const stored = await query("SELECT id FROM event WHERE dedup_key = $1", [`${PREFIX}badfam`]);
	assert.equal(stored.rowCount, 0, "rien ne doit atteindre la base");
});

test("les familles élargies passent la porte HTTP", async () => {
	const r = await post([
		item("leak", { family: "leaks" }),
		item("paste", { family: "paste" }),
		item("press", { family: "presse_cyber" }),
	]);
	assert.equal(r.json().inserted, 3);
	const rows = await query<{ family: string }>(
		"SELECT family FROM event WHERE dedup_key = ANY($1::text[]) ORDER BY family",
		[[`${PREFIX}leak`, `${PREFIX}paste`, `${PREFIX}press`]],
	);
	assert.deepEqual(rows.rows.map((x) => x.family), ["leaks", "paste", "presse_cyber"]);
});

test("un lot mixte : les bons passent, les mauvais sont comptés", async () => {
	const r = await post([
		item("mix1"),
		item("mix2", { family: "invente" }),
		item("mix3", { assertion_type: "supposition" }),
		item("mix4", { title: "x" }),
		item("mix5", { dedup_key: "court" }),
	]);
	const body = r.json();
	assert.equal(body.inserted, 1);
	assert.equal(body.skipped, 4);
	assert.equal(body.rejected.length, 4);
	const reasons = body.rejected.flatMap((x: { reasons: string[] }) => x.reasons);
	assert.ok(reasons.includes("famille-inconnue"));
	assert.ok(reasons.includes("assertion-inconnue"));
	assert.ok(reasons.includes("titre-trop-court"));
});

test("les réparations passent et sont annoncées, sans rejet", async () => {
	const r = await post([
		item("repair", { severity: 99, confidence: "b2", observed_at: "pas une date", source_url: "ni une url", title: `  Titre   espacé  ${TAG}  ` }),
	]);
	const body = r.json();
	assert.equal(body.inserted, 1);
	assert.equal(body.skipped, 0);
	const codes = body.contract.repairs.map((x: { code: string }) => x.code);
	for (const code of ["severite-bornes", "confidence-casse", "date-illisible", "url-illisible", "titre-espaces"]) {
		assert.ok(codes.includes(code), `réparation attendue : ${code}`);
	}

	const stored = await query<{ severity: number; confidence: string; title: string; observed_at: string | null; source_url: string | null }>(
		"SELECT severity, confidence, title, observed_at, source_url FROM event WHERE dedup_key = $1",
		[`${PREFIX}repair`],
	);
	assert.equal(stored.rows[0].severity, 5);
	assert.equal(stored.rows[0].confidence, "B2");
	assert.equal(stored.rows[0].title, `Titre espacé ${TAG}`);
	assert.equal(stored.rows[0].observed_at, null);
	// L'URL illisible est réparée en l'écartant ; la provenance exigée par la
	// migration 206 prend alors le relais (URN de la source, jamais une URL
	// inventée).
	assert.equal(stored.rows[0].source_url, `urn:source:${DEFAULT_SOURCE}`);
});

test("la provenance Hermes reste dans evidence", async () => {
	await post([item("prov", { org_name: "Commune de Pessac", evidence: { brut: true } })]);
	const r = await query<{ evidence: { hermes: boolean; profile: string; org_name: string; evidence: { brut: boolean } } }>(
		"SELECT evidence FROM event WHERE dedup_key = $1",
		[`${PREFIX}prov`],
	);
	assert.equal(r.rows[0].evidence.hermes, true);
	assert.equal(r.rows[0].evidence.profile, TAG);
	assert.equal(r.rows[0].evidence.org_name, "Commune de Pessac");
	assert.equal(r.rows[0].evidence.evidence.brut, true);
});

test("un lot vide répond sans erreur", async () => {
	const r = await post([]);
	assert.equal(r.statusCode, 200);
	assert.equal(r.json().inserted, 0);
});

test("provenance inconnue : refus lisible, pas une violation de clé étrangère", async () => {
	// Régression verrouillée : le défaut était `hermes`, absent du catalogue,
	// et tout bot sans `source_id` prenait un 500 sur event_source_id_fkey.
	const r = await post([item("unknown-src", { source_id: "source-qui-nexiste-pas" })]);
	assert.equal(r.statusCode, 200, "un refus métier n'est pas une erreur serveur");
	const body = r.json();
	assert.equal(body.inserted, 0);
	assert.equal(body.rejected[0].reasons[0], "source-inconnue");

	const defaut = await post([item("default-src")]);
	assert.equal(defaut.json().inserted, 1, "le défaut doit exister au catalogue");
	const stored = await query<{ source_id: string }>("SELECT source_id FROM event WHERE dedup_key = $1", [`${PREFIX}default-src`]);
	assert.equal(stored.rows[0].source_id, "hermes_radar_cyber");
});

test("le defaut de la route existe au catalogue, sans base", () => {
	// C'est le verrou du bug trouve ici : `/ingest` utilisait `hermes`, absent
	// de db/sources.sql, et tout bot sans source_id violait la cle etrangere.
	// Ce controle ne depend pas du contenu de la base de test.
	const catalog = readFileSync(fileURLToPath(new URL("../../../db/sources.sql", import.meta.url)), "utf8");
	assert.ok(catalog.includes("'" + DEFAULT_SOURCE + "'"), DEFAULT_SOURCE + " doit etre declare au catalogue");
	const route = readFileSync(fileURLToPath(new URL("../src/routes/ingest.ts", import.meta.url)), "utf8");
	assert.ok(route.includes('DEFAULT_SOURCE_ID = "' + DEFAULT_SOURCE + '"'), "la route doit pointer sur la source du catalogue");
	assert.ok(!route.includes('?? "hermes"'), "l'ancien defaut casse ne doit pas revenir");
});
