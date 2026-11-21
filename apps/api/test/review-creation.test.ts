/**
 * Décision « creer » depuis la file de revue.
 *
 * Isolation : source, indice et compte uniques ; organisations, événements et
 * lignes de quarantaine supprimés et vérifiés dans `after`. Le journal est
 * append-only et n'est pas nettoyé, comme dans les autres tests de revue.
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { hashSessionToken } from "../src/auth.js";
import { closePools, query } from "../src/db.js";
import authRoute from "../src/routes/auth.js";
import reviewRoute from "../src/routes/review.js";

const TAG = `rc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
const EMAIL = `${TAG}@creation.test`;
const TOKEN = `tok-${TAG}`;
const HINT = "connectwell.com";
const RAISON = "société absente du registre";

let app: FastifyInstance;
let seq = 0;
const auth = { authorization: `Bearer ${TOKEN}` };
const createdOrgIds: number[] = [];
const createdEventIds: number[] = [];

before(async () => {
	const user = await query<{ id: number }>(
		"INSERT INTO app_user (email, password_hash, role) VALUES ($1,'x','lecteur') RETURNING id",
		[EMAIL],
	);
	await query(
		"INSERT INTO app_session (token, user_id, expires_at) VALUES ($1,$2, now() + interval '1 hour')",
		[hashSessionToken(TOKEN), user.rows[0].id],
	);
	app = Fastify();
	await app.register(authRoute, { prefix: "/api" });
	await app.register(reviewRoute, { prefix: "/api" });
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	for (const eventId of createdEventIds) {
		await query("DELETE FROM alert WHERE event_id=$1", [eventId]);
		await query("DELETE FROM event WHERE id=$1", [eventId]);
		const rest = await query<{ n: number }>("SELECT count(*)::int AS n FROM event WHERE id=$1", [eventId]);
		assert.equal(rest.rows[0]?.n, 0, `événement ${eventId} supprimé`);
	}
	for (const orgId of createdOrgIds) {
		await query("DELETE FROM org_alias WHERE org_id=$1", [orgId]);
		await query("DELETE FROM org WHERE id=$1", [orgId]);
		const rest = await query<{ n: number }>("SELECT count(*)::int AS n FROM org WHERE id=$1", [orgId]);
		assert.equal(rest.rows[0]?.n, 0, `organisation ${orgId} supprimée`);
	}
	await query("DELETE FROM quarantine_raw WHERE source=$1", [SOURCE]);
	const rows = await query<{ n: number }>("SELECT count(*)::int AS n FROM quarantine_raw WHERE source=$1", [SOURCE]);
	assert.equal(rows.rows[0]?.n, 0, "lignes de quarantaine supprimées");
	await query("DELETE FROM app_session WHERE token=$1", [hashSessionToken(TOKEN)]);
	await query("DELETE FROM app_user WHERE email=$1", [EMAIL]);
	const users = await query<{ n: number }>("SELECT count(*)::int AS n FROM app_user WHERE email=$1", [EMAIL]);
	assert.equal(users.rows[0]?.n, 0, "compte de test supprimé");
	await closePools();
});

async function claim(hint: string | null): Promise<number> {
	seq += 1;
	const hash = createHash("sha256").update(`${TAG}-claim-${seq}`).digest("hex");
	const r = await query<{ id: number }>(
		`INSERT INTO quarantine_raw
		   (source, source_url, groupe, org_hint, claimed_at, extracted, tlp, content_hash, status)
		 VALUES ($1,$2,'lockbit3',$3,now(),'{}'::jsonb,'RED',$4,'pending') RETURNING id`,
		[SOURCE, `https://exemple.test/${hash.slice(0, 8)}`, hint, hash],
	);
	return Number(r.rows[0].id);
}

function decide(id: number, body: Record<string, unknown>) {
	return app.inject({
		method: "POST",
		url: `/api/review/${id}/decision`,
		headers: auth,
		payload: body,
	});
}

type CreationResponse = {
	ok: boolean;
	id: number;
	decision: string;
	orgId: number;
	orgName: string;
	eventId: number;
	cree: boolean;
	status: string;
	reason: string;
	by: string;
};

test("creer : organisation créée depuis l'indice, événement attaché et journal signé", async () => {
	const id = await claim(HINT);
	const res = await decide(id, { decision: "creer", raison: RAISON });
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<CreationResponse>();
	assert.equal(body.ok, true);
	assert.equal(body.cree, true);
	assert.equal(body.decision, "creer");
	assert.equal(body.status, "promoted");
	assert.equal(body.reason, RAISON);
	assert.equal(body.by, EMAIL);
	assert.ok(body.orgId > 0);
	assert.ok(body.eventId > 0);
	if (!createdOrgIds.includes(body.orgId)) createdOrgIds.push(body.orgId);
	createdEventIds.push(body.eventId);

	const org = await query<{ name: string; domain: string | null; entity_source: string }>(
		"SELECT name, domain, entity_source FROM org WHERE id=$1", [body.orgId],
	);
	assert.equal(org.rows[0]?.name, HINT);
	assert.equal(org.rows[0]?.domain, HINT);
	assert.equal(org.rows[0]?.entity_source, `hint:quarantine:${id}`);

	const event = await query<{ org_id: number }>("SELECT org_id FROM event WHERE id=$1", [body.eventId]);
	assert.equal(Number(event.rows[0]?.org_id), body.orgId, "l'événement porte l'organisation créée");

	const line = await query<{ promoted: boolean; status: string; promoted_by: string; review: unknown }>(
		`SELECT promoted, status, promoted_by, extracted->'_review' AS review
		   FROM quarantine_raw WHERE id=$1`, [id],
	);
	assert.equal(line.rows[0]?.promoted, true);
	assert.equal(line.rows[0]?.status, "promoted");
	assert.equal(line.rows[0]?.promoted_by, EMAIL);
	const review = line.rows[0]?.review as Array<{ action: string; by: string; reason: string }> | null;
	assert.equal(review?.[0]?.action, "promote");
	assert.equal(review?.[0]?.by, EMAIL);
	assert.equal(review?.[0]?.reason, RAISON);

	const journal = await query<{ payload: { decision: string; action: string; reason: string; cree: boolean; orgId: number }; actor: string }>(
		`SELECT payload, actor FROM journal
		  WHERE kind='review.decided' AND subject=$1 ORDER BY id DESC LIMIT 1`, [`quarantine:${id}`],
	);
	assert.equal(journal.rows[0]?.actor, `humain:${EMAIL}`);
	assert.equal(journal.rows[0]?.payload.decision, "creer");
	assert.equal(journal.rows[0]?.payload.action, "promote");
	assert.equal(journal.rows[0]?.payload.reason, RAISON);
	assert.equal(journal.rows[0]?.payload.cree, true);
	assert.equal(journal.rows[0]?.payload.orgId, body.orgId);

	const creation = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM journal WHERE kind='org.created' AND payload->>'orgId'=$1",
		[String(body.orgId)],
	);
	assert.equal(creation.rows[0]?.n, 1, "la création est tracée");
});

test("creer : un domaine déjà connu est réutilisé sans doublon (cree:false)", async () => {
	const first = await query<{ id: number }>("SELECT id FROM org WHERE domain=$1", [HINT]);
	const existingId = Number(first.rows[0].id);
	const id = await claim(HINT);
	const res = await decide(id, { decision: "creer", raison: RAISON });
	assert.equal(res.statusCode, 200, res.body);
	const body = res.json<CreationResponse>();
	assert.equal(body.cree, false);
	assert.equal(body.orgId, existingId);
	createdEventIds.push(body.eventId);

	const count = await query<{ n: number }>("SELECT count(*)::int AS n FROM org WHERE domain=$1", [HINT]);
	assert.equal(count.rows[0]?.n, 1, "aucune organisation supplémentaire");
	const event = await query<{ org_id: number }>("SELECT org_id FROM event WHERE id=$1", [body.eventId]);
	assert.equal(Number(event.rows[0]?.org_id), existingId);
});

test("creer : indice inexploitable, orgId interdit et motif requis", async () => {
	const empty = await claim("   ");
	const bad = await decide(empty, { decision: "creer", raison: RAISON });
	assert.equal(bad.statusCode, 400);
	assert.equal(bad.json<{ error: string }>().error, "indice inexploitable");

	const junk = await claim("???");
	const junkRes = await decide(junk, { decision: "creer", raison: RAISON });
	assert.equal(junkRes.statusCode, 400);
	assert.equal(junkRes.json<{ error: string }>().error, "indice inexploitable");

	const withOrg = await claim(HINT);
	const refused = await decide(withOrg, { decision: "creer", orgId: 1, raison: RAISON });
	assert.equal(refused.statusCode, 400);
	assert.equal(refused.json<{ error: string }>().error, "invalid input");
	assert.ok(refused.json<{ details: Array<{ path: string }> }>().details.some((d) => d.path === "orgId"));

	const noReason = await claim(HINT);
	const missing = await decide(noReason, { decision: "creer" });
	assert.equal(missing.statusCode, 400);
	assert.ok(missing.json<{ details: Array<{ path: string }> }>().details.some((d) => d.path === "raison"));

	const pending = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM quarantine_raw WHERE source=$1 AND id=ANY($2::int[]) AND promoted=false AND status='pending'`,
		[SOURCE, [empty, junk, withOrg, noReason]],
	);
	assert.equal(pending.rows[0]?.n, 4, "aucune ligne décidée après un refus 400");
});
