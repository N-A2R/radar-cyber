/**
 * Fiche d'organisation : la réponse HTTP est vérifiée sur la base de test
 * jetable, avec un jeu de données isolé par préfixe (aucune donnée de prod).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { query, closePools } from "../src/db.js";
import orgsRoute from "../src/routes/orgs.js";

const TAG = `of${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const EMAIL = `${TAG}@orgs-fiche.test`;
const TOKEN = `tok-${TAG}`;
const SRC_A = `${TAG}-a`;
const SRC_B = `${TAG}-b`;
const auth = { authorization: `Bearer ${TOKEN}` };

let app: FastifyInstance;
let orgId: number;

before(async () => {
	const user = await query<{ id: number }>(
		"INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','lecteur') RETURNING id",
		[EMAIL],
	);
	await query(
		"INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
		[hashSessionToken(TOKEN), user.rows[0].id],
	);
	const org = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, domain, status)
		 VALUES ($1,$2,'entreprise','Bordeaux',$3,'confirme') RETURNING id`,
		[`Org Fiche ${TAG}`, `${TAG}-org`, `${TAG}.example`],
	);
	orgId = Number(org.rows[0].id);

	await query(
		`INSERT INTO source (id, name, family, url) VALUES
		   ($1,$2,'ransomware','https://example.invalid/a'),
		   ($3,$4,'ransomware','https://example.invalid/b')`,
		[SRC_A, `${TAG} A`, SRC_B, `${TAG} B`],
	);
	await query(
		`INSERT INTO org_alias (org_id, alias, source)
		 SELECT $1, 'alias-' || lpad(i::text, 2, '0'), 'test'
		 FROM generate_series(0, 51) AS i`,
		[orgId],
	);
	await query(
		"INSERT INTO org_alias (org_id, alias, source, status) VALUES ($1,'aaa-rejete','test','rejected')",
		[orgId],
	);
	await query(
		"INSERT INTO org_alias (org_id, alias, source, valid_to) VALUES ($1,'aaa-perime','test', now() - interval '1 day')",
		[orgId],
	);
	await query(
		`INSERT INTO asset (org_id, kind, value) VALUES
		   ($1,'domain',$2), ($1,'subdomain',$3), ($1,'ip','10.0.0.1')`,
		[orgId, `${TAG}.example`, `www.${TAG}.example`],
	);
	await query(
		`INSERT INTO event (dedup_key, family, assertion_type, title, observed_at, severity, source_id, org_id)
		 SELECT $1 || '-' || i, 'ransomware', 'third_party_claim',
		        'Fait ' || lpad(i::text, 2, '0'),
		        now() - (25 - i) * interval '1 day', 3,
		        CASE WHEN i % 2 = 0 THEN $2 ELSE $3 END, $4
		 FROM generate_series(1, 25) AS i`,
		[TAG, SRC_A, SRC_B, orgId],
	);

	app = Fastify();
	await app.register(orgsRoute, { prefix: "/api" });
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	if (orgId) {
		await query("DELETE FROM event WHERE org_id=$1", [orgId]);
		await query("DELETE FROM org_alias WHERE org_id=$1", [orgId]);
		await query("DELETE FROM asset WHERE org_id=$1", [orgId]);
		await query("DELETE FROM org WHERE id=$1", [orgId]);
	}
	await query("DELETE FROM source WHERE id=ANY($1::text[])", [[SRC_A, SRC_B]]);
	await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
	await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
	await closePools();
});

test("404 explicite pour un identifiant absent ou invalide", async () => {
	for (const id of ["999999999", "pas-un-nombre"]) {
		const res = await app.inject({ method: "GET", url: `/api/orgs/${id}`, headers: auth });
		assert.equal(res.statusCode, 404, `${id} → ${res.body}`);
		assert.deepEqual(res.json(), { error: "not found" });
	}
});

test("la fiche renvoie l'org, 50 alias, les domaines, 20 événements et les sources citantes", async () => {
	const res = await app.inject({ method: "GET", url: `/api/orgs/${orgId}`, headers: auth });
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<{
		org: { id: number; name: string };
		aliases: string[];
		domains: string[];
		sourcesCount: number;
		events: { total: number; recent: Array<{ id: string; title: string }> };
	}>();

	assert.equal(body.org.id, orgId);
	assert.equal(body.org.name, `Org Fiche ${TAG}`);
	assert.equal(body.aliases.length, 50, "les alias sont plafonnés à 50");
	assert.ok(body.aliases.includes("alias-00"));
	assert.ok(!body.aliases.includes("alias-51"), "le 51e alias n'est pas renvoyé");
	assert.ok(!body.aliases.includes("aaa-rejete"), "un alias rejeté est exclu");
	assert.ok(!body.aliases.includes("aaa-perime"), "un alias périmé est exclu");
	assert.deepEqual(body.domains, [`${TAG}.example`, `www.${TAG}.example`]);
	assert.equal(body.sourcesCount, 2, "deux sources distinctes citent l'organisation");
	assert.equal(body.events.total, 25);
	assert.equal(body.events.recent.length, 20, "le fil est plafonné à 20 événements");
	assert.equal(body.events.recent[0]?.title, "Fait 25", "le plus récent vient en premier");
	assert.equal(new Set(body.events.recent.map((event) => event.id)).size, 20);
});
