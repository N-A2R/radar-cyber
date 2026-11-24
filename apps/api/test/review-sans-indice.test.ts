/**
 * Refus massif des revendications sans indice : garde admin, une seule
 * transaction, une seule trace de journal. La base de test est créée par
 * `test/run.ts` ; les lignes fabriquées sont retirées ensuite.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import authRoute from "../src/routes/auth.js";
import reviewRoute from "../src/routes/review.js";

const TAG = `sansind${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
const ADMIN_EMAIL = `${TAG}-admin@review.test`;
const ANALYSTE_EMAIL = `${TAG}-analyste@review.test`;
const ADMIN_TOKEN = `tok-admin-${TAG}`;
const ANALYSTE_TOKEN = `tok-analyste-${TAG}`;
const RAISON = "sans indice : jamais rattachable";
const SUJET_LOT = "review.batch:refuser-sans-indice";
const URL_LOT = "/api/review/refuser-sans-indice";

let app: FastifyInstance;
let seq = 0;

const adminAuth = { authorization: `Bearer ${ADMIN_TOKEN}` };
const analysteAuth = { authorization: `Bearer ${ANALYSTE_TOKEN}` };

async function session(email: string, token: string, role: string): Promise<void> {
	const user = await query<{ id: number }>(
		"INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x',$2) RETURNING id",
		[email, role],
	);
	await query(
		"INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
		[hashSessionToken(token), user.rows[0].id],
	);
}

before(async () => {
	await session(ADMIN_EMAIL, ADMIN_TOKEN, "admin");
	await session(ANALYSTE_EMAIL, ANALYSTE_TOKEN, "analyste");
	app = Fastify();
	await app.register(authRoute, { prefix: "/api" });
	await app.register(reviewRoute, { prefix: "/api" });
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	await query("DELETE FROM quarantine_raw WHERE source=$1", [SOURCE]);
	for (const token of [ADMIN_TOKEN, ANALYSTE_TOKEN]) {
		await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(token)]);
	}
	await query("DELETE FROM app_user WHERE email IN ($1,$2)", [ADMIN_EMAIL, ANALYSTE_EMAIL]);
	await closePools();
});

async function claim(orgHint: string | null): Promise<number> {
	seq += 1;
	const hash = createHash("sha256").update(`${TAG}-claim-${seq}`).digest("hex");
	const r = await query<{ id: number }>(
		`INSERT INTO quarantine_raw
		   (source, source_url, groupe, org_hint, claimed_at, extracted, tlp, content_hash, status)
		 VALUES ($1,$2,'lockbit3',$3,now(),'{}'::jsonb,'RED',$4,'pending') RETURNING id`,
		[SOURCE, `https://exemple.test/${hash.slice(0, 8)}`, orgHint, hash],
	);
	return Number(r.rows[0].id);
}

test("refus massif : jeton admin et raison non vide exigés", async () => {
	await claim("indice présent");
	for (const [headers, expected] of [[undefined, 401], [analysteAuth, 403]] as const) {
		const res = await app.inject({
			method: "POST", url: URL_LOT, headers,
			payload: { raison: RAISON },
		});
		assert.equal(res.statusCode, expected, `statut pour ${JSON.stringify(headers)}`);
	}
	for (const payload of [{}, { raison: "   " }, { raison: RAISON, extra: 1 }]) {
		const res = await app.inject({ method: "POST", url: URL_LOT, headers: adminAuth, payload });
		assert.equal(res.statusCode, 400, `raison invalide : ${JSON.stringify(payload)}`);
	}
});

test("trois lignes sans indice : refusées, une seule entrée de journal", async () => {
	const ids = [await claim(null), await claim(""), await claim("   ")];
	const avecIndice = await claim("indice valide");

	const res = await app.inject({ method: "POST", url: URL_LOT, headers: adminAuth, payload: { raison: RAISON } });
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<{ traites: number; journalConsignes: number }>();
	assert.equal(body.traites, 3);
	assert.equal(body.journalConsignes, 1);

	const rows = await query<{ id: number; status: string; promoted: boolean; review: Array<{ by: string; action: string; reason: string }> }>(
		`SELECT id, status, promoted, extracted->'_review' AS review
		   FROM quarantine_raw WHERE id = ANY($1::bigint[]) ORDER BY id`,
		[ids],
	);
	assert.deepEqual(rows.rows.map((row) => Number(row.id)), ids);
	for (const row of rows.rows) {
		assert.equal(row.status, "rejected", `ligne ${row.id} refusée`);
		assert.equal(row.promoted, false);
		assert.equal(row.review[0]?.by, ADMIN_EMAIL);
		assert.equal(row.review[0]?.action, "reject");
		assert.equal(row.review[0]?.reason, RAISON);
	}
	const temoin = await query<{ status: string }>("SELECT status FROM quarantine_raw WHERE id=$1", [avecIndice]);
	assert.equal(temoin.rows[0].status, "pending", "une ligne avec indice reste en attente");

	const journal = await query<{ actor: string; payload: Record<string, unknown> }>(
		"SELECT actor, payload FROM journal WHERE subject=$1", [SUJET_LOT],
	);
	assert.equal(journal.rows.length, 1, "un seul fait de journal pour les trois lignes");
	assert.equal(journal.rows[0].actor, `humain:${ADMIN_EMAIL}`);
	assert.equal(journal.rows[0].payload.reason, RAISON);
	assert.equal(journal.rows[0].payload.traites, 3);
	assert.deepEqual(journal.rows[0].payload.quarantineIds, ids);

	const parLigne = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM journal
		  WHERE subject IN (
		    SELECT 'quarantine:' || content_hash FROM quarantine_raw WHERE id = ANY($1::bigint[])
		  )`,
		[ids],
	);
	assert.equal(parLigne.rows[0].n, 0, "aucune entrée de journal par ligne");
});

test("rejouer le lot ne traite rien et n'écrit pas de second fait", async () => {
	const res = await app.inject({ method: "POST", url: URL_LOT, headers: adminAuth, payload: { raison: "second passage" } });
	assert.equal(res.statusCode, 200, res.body);
	assert.equal(res.json<{ traites: number }>().traites, 0);
	const journal = await query<{ n: number }>("SELECT count(*)::int AS n FROM journal WHERE subject=$1", [SUJET_LOT]);
	assert.equal(journal.rows[0].n, 1);
});
