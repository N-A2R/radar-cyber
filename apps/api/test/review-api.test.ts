/**
 * API de revue : file authentifiée, décision avec rattachement et journal,
 * statistiques lues en base. Isolation par source, organisation et compte
 * uniques ; le journal append-only n'est pas nettoyé (sujets préfixés).
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import authRoute from "../src/routes/auth.js";
import reviewRoute from "../src/routes/review.js";

const TAG = `rvw${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
const EMAIL = `${TAG}@review.test`;
const TOKEN = `tok-${TAG}`;

let app: FastifyInstance;
let orgId: number;
let maskedOrgId: number;
let seq = 0;

const auth = { authorization: `Bearer ${TOKEN}` };

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
		`INSERT INTO org (name, slug, kind, city, dept, domain, status)
		 VALUES ($1,$2,'entreprise','Pessac','33',$3,'confirme') RETURNING id`,
		[`Org Revue ${TAG}`, `${TAG}-org`, `${TAG}.example`],
	);
	orgId = Number(org.rows[0].id);
	const masked = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, dept, status)
		 VALUES ($1,$2,'entreprise','Bordeaux','33','confirme') RETURNING id`,
		[`Masque ${TAG}`, `${TAG}-masque`],
	);
	maskedOrgId = Number(masked.rows[0].id);

	app = Fastify();
	await app.register(authRoute, { prefix: "/api" });
	await app.register(reviewRoute, { prefix: "/api" });
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	const events = await query<{ id: number }>(
		`SELECT id FROM event WHERE dedup_key IN
		   (SELECT 'quarantine:' || content_hash FROM quarantine_raw WHERE source=$1)`,
		[SOURCE],
	);
	const ids = events.rows.map((row) => String(row.id));
	if (ids.length > 0) {
		await query("DELETE FROM alert WHERE event_id = ANY($1::bigint[])", [ids]);
		await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [ids]);
	}
	await query("DELETE FROM quarantine_raw WHERE source=$1", [SOURCE]);
	if (orgId) await query("DELETE FROM org WHERE id=$1", [orgId]);
	if (maskedOrgId) await query("DELETE FROM org WHERE id=$1", [maskedOrgId]);
	await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
	await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
	await closePools();
});

async function claim(hint: string | null, overrides: { status?: string; description?: string } = {}): Promise<number> {
	seq += 1;
	const hash = createHash("sha256").update(`${TAG}-claim-${seq}`).digest("hex");
	const r = await query<{ id: number }>(
		`INSERT INTO quarantine_raw
		   (source, source_url, groupe, org_hint, claimed_at, extracted, tlp, content_hash, status)
		 VALUES ($1,$2,'lockbit3',$3,now(),$4::jsonb,'RED',$5,$6) RETURNING id`,
		[
			SOURCE,
			`https://exemple.test/${hash.slice(0, 8)}`,
			hint,
			JSON.stringify(overrides.description ? { description: overrides.description } : {}),
			hash,
			overrides.status ?? "pending",
		],
	);
	return Number(r.rows[0].id);
}

test("les trois routes exigent un jeton valide", async () => {
	for (const [method, url] of [
		["GET", "/api/review/queue"],
		["GET", "/api/review/stats"],
		["POST", "/api/review/1/decision"],
	] as const) {
		const without = await app.inject({ method, url, payload: method === "POST" ? {} : undefined });
		assert.equal(without.statusCode, 401, `${url} sans jeton`);
		const bad = await app.inject({
			method, url,
			headers: { authorization: "Bearer jeton-inexistant" },
			payload: method === "POST" ? {} : undefined,
		});
		assert.equal(bad.statusCode, 401, `${url} avec un jeton invalide`);
	}
});

test("file : seulement les pending avec indice, candidats et géographie", async () => {
	const withHint = await claim(`${TAG}.example`);
	await claim(null);
	await claim(`${TAG}.example`, { status: "rejected" });

	const res = await app.inject({
		method: "GET",
		url: "/api/review/queue?limit=50",
		headers: auth,
	});
	assert.equal(res.statusCode, 200);
	const body = res.json<{
		rows: Array<{
			id: number;
			orgHint: string | null;
			city: string | null;
			dept: string | null;
			rejectRule: string | null;
			candidates: Array<{
				id: number; name: string; score: number; via: string;
				city: string | null; dept: string | null;
			}>;
			triage: { reasons: unknown[] };
		}>;
		counts: Record<string, number>;
	}>();
	const row = body.rows.find((item) => item.id === withHint);
	assert.ok(row, "la revendication en attente avec indice doit être dans la file");
	assert.equal(body.rows.some((item) => item.orgHint === null), false);
	assert.ok(body.counts.pending >= 1);

	const candidates = row.candidates as Array<Record<string, unknown>>;
	assert.ok(candidates.some((candidate) =>
		candidate.id === orgId
		&& candidate.name === `Org Revue ${TAG}`
		&& typeof candidate.score === "number" && Number(candidate.score) > 0
		&& candidate.via === "domain"
		&& candidate.city === "Pessac"
		&& candidate.dept === "33",
	), `candidat attendu, reçu ${JSON.stringify(candidates)}`);
	assert.equal(row.city, "Pessac");
	assert.equal(row.dept, "33");
	assert.equal(row.rejectRule, null, "aucune règle de précision active par défaut");
	assert.ok(row.triage.reasons.length > 0);
});

test("file : la règle de refus est exposée quand le drapeau est actif", async () => {
	const masked = await claim(`Masque ${TAG}*`);
	const previous = process.env.PRECISION_RULES;
	process.env.PRECISION_RULES = "on";
	try {
		const res = await app.inject({ method: "GET", url: "/api/review/queue?limit=200", headers: auth });
		assert.equal(res.statusCode, 200);
		const row = res.json<{ rows: Array<{ id: number; rejectRule: string | null }> }>()
			.rows.find((item) => item.id === masked);
		assert.ok(row);
		assert.equal(row.rejectRule, "3-masquage");
	} finally {
		if (previous === undefined) delete process.env.PRECISION_RULES;
		else process.env.PRECISION_RULES = previous;
	}
});

test("accepter : rattachement dans event.org_id, sortie de file et journal signé", async () => {
	const id = await claim(`${TAG}.example`, { description: "Revendication de test" });
	const res = await app.inject({
		method: "POST",
		url: `/api/review/${id}/decision`,
		headers: auth,
		payload: { decision: "accepter", orgId, raison: "domaine confirmé au registre" },
	});
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<{ eventId: number; orgId: number; status: string; by: string }>();
	assert.equal(body.status, "promoted");
	assert.equal(body.orgId, orgId);
	assert.equal(body.by, EMAIL);
	assert.ok(body.eventId > 0);

	const event = await query<{ org_id: number }>("SELECT org_id FROM event WHERE id=$1", [body.eventId]);
	assert.equal(event.rows[0]?.org_id, orgId, "l'acceptation écrit bien event.org_id");
	const quarantine = await query<{ status: string; promoted: boolean; review: Array<{ by: string; reason: string }> }>(
		"SELECT status, promoted, extracted->'_review' AS review FROM quarantine_raw WHERE id=$1", [id],
	);
	assert.equal(quarantine.rows[0].status, "promoted");
	assert.equal(quarantine.rows[0].promoted, true);
	assert.equal(quarantine.rows[0].review[0]?.by, EMAIL);
	assert.equal(quarantine.rows[0].review[0]?.reason, "domaine confirmé au registre");

	const journal = await query<{ actor: string; kind: string; payload: Record<string, unknown> }>(
		"SELECT actor, kind, payload FROM journal WHERE subject=$1 AND kind='review.decided'",
		[`quarantine:${id}`],
	);
	assert.equal(journal.rows.length, 1);
	assert.equal(journal.rows[0].actor, `humain:${EMAIL}`);
	assert.equal(journal.rows[0].payload.decision, "accepter");
	assert.equal(journal.rows[0].payload.orgId, orgId);

	const queue = await app.inject({ method: "GET", url: "/api/review/queue?limit=200", headers: auth });
	assert.equal(queue.json<{ rows: Array<{ id: number }> }>().rows.some((item) => item.id === id), false);
});

test("refuser : motif obligatoire, classement, journal et sortie de file", async () => {
	const id = await claim(`${TAG}.example`);
	const invalid = await app.inject({
		method: "POST",
		url: `/api/review/${id}/decision`,
		headers: auth,
		payload: { decision: "refuser", raison: "   " },
	});
	assert.equal(invalid.statusCode, 400);
	const noOrg = await app.inject({
		method: "POST",
		url: `/api/review/${id}/decision`,
		headers: auth,
		payload: { decision: "accepter", orgId: 999999999, raison: "test" },
	});
	assert.equal(noOrg.statusCode, 404);
	const unknown = await app.inject({
		method: "POST",
		url: "/api/review/999999999/decision",
		headers: auth,
		payload: { decision: "refuser", raison: "test" },
	});
	assert.equal(unknown.statusCode, 404);

	const res = await app.inject({
		method: "POST",
		url: `/api/review/${id}/decision`,
		headers: auth,
		payload: { decision: "refuser", raison: "hors périmètre régional" },
	});
	assert.equal(res.statusCode, 200, res.body);
	const again = await app.inject({
		method: "POST",
		url: `/api/review/${id}/decision`,
		headers: auth,
		payload: { decision: "refuser", raison: "doublon" },
	});
	assert.equal(again.statusCode, 409, "une ligne décidée ne revient pas dans la file");

	const quarantine = await query<{ status: string }>("SELECT status FROM quarantine_raw WHERE id=$1", [id]);
	assert.equal(quarantine.rows[0].status, "rejected");
	const journal = await query<{ actor: string; payload: Record<string, unknown> }>(
		"SELECT actor, payload FROM journal WHERE subject=$1 AND kind='review.decided'",
		[`quarantine:${id}`],
	);
	assert.equal(journal.rows.length, 1);
	assert.equal(journal.rows[0].actor, `humain:${EMAIL}`);
	assert.equal(journal.rows[0].payload.reason, "hors périmètre régional");
	const queue = await app.inject({ method: "GET", url: "/api/review/queue?limit=200", headers: auth });
	assert.equal(queue.json<{ rows: Array<{ id: number }> }>().rows.some((item) => item.id === id), false);
});

test("stats : les quatre comptes sont lus en base", async () => {
	const before = await query<Record<string, number>>(
		`SELECT
		   (SELECT count(*)::int FROM quarantine_raw WHERE kind='claim' AND status='pending' AND promoted=false
		      AND org_hint IS NOT NULL AND btrim(org_hint) <> '') AS pending,
		   (SELECT count(DISTINCT subject)::int FROM journal WHERE kind='review.decided'
		      AND (payload->>'decision'='accepter' OR payload->>'action'='promote')) AS acceptees,
		   (SELECT count(DISTINCT subject)::int FROM journal WHERE kind='review.decided'
		      AND (payload->>'decision'='refuser' OR payload->>'action'='reject')) AS refusees,
		   (SELECT count(*)::int FROM quarantine_raw WHERE promoted=true) AS promues`,
	);
	const res = await app.inject({ method: "GET", url: "/api/review/stats", headers: auth });
	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.json(), Object.fromEntries(
		Object.entries(before.rows[0]).map(([key, value]) => [key, Number(value)]),
	));
	const stats = res.json<Record<string, number>>();
	assert.ok(stats.acceptees >= 1 && stats.refusees >= 1 && stats.promues >= 1);
});
