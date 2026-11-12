/**
 * File de revue — contrôles en base : ordre, décisions groupées, annulation.
 *
 * Isolation : faits jetables portant une source préfixée, supprimés dans
 * `after`, ainsi que les événements et alertes issus des promotions de test.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { query, closePools } from "../src/db.js";
import { applyReview, reviewQueue } from "../src/quarantine/review.js";

const TAG = `rev${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const SOURCE = `${TAG}-source`;
const createdEvents: string[] = [];
let seq = 0;

async function claim(hint: string, overrides: { groupe?: string; description?: string; claimedAt?: string } = {}): Promise<number> {
	seq += 1;
	const hash = createHash("sha256").update(`${TAG}-${seq}-${hint}`).digest("hex");
	const r = await query<{ id: number }>(
		`INSERT INTO quarantine_raw
		   (source, source_url, groupe, org_hint, claimed_at, extracted, tlp, content_hash, status)
		 VALUES ($1,$2,$3,$4,$5::timestamptz,$6::jsonb,'RED',$7,'pending') RETURNING id`,
		[
			SOURCE,
			`https://exemple.test/${hash.slice(0, 8)}`,
			overrides.groupe ?? "lockbit3",
			hint,
			overrides.claimedAt ?? new Date().toISOString(),
			JSON.stringify(overrides.description ? { description: overrides.description } : {}),
			hash,
		],
	);
	return Number(r.rows[0].id);
}

after(async () => {
	const events = await query<{ id: number }>(
		"SELECT id FROM event WHERE dedup_key IN (SELECT 'quarantine:' || content_hash FROM quarantine_raw WHERE source = $1)",
		[SOURCE],
	);
	for (const row of events.rows) createdEvents.push(String(row.id));
	if (createdEvents.length) {
		await query("DELETE FROM alert WHERE event_id = ANY($1::bigint[])", [createdEvents]);
		await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [createdEvents]);
	}
	await query("DELETE FROM quarantine_raw WHERE source = $1", [SOURCE]);
	await closePools();
});

test("la file remontée en tête les faits actionnables, pas les plus récents", async () => {
	const foreign = await claim(`acme-${TAG}.com\\$5M\\United States\\20GB\\100% DISCLOSED`);
	const french = await claim(`Groupe Test ${TAG}`);
	const result = await reviewQueue({ source: SOURCE, limit: 10 });
	assert.equal(result.total, 2);
	assert.equal(result.rows[0].id, french, "l'indice français doit passer devant");
	assert.equal(result.rows[0].triage.referentialGap, true);
	assert.equal(result.rows[1].id, foreign);
	assert.equal(result.rows[1].triage.suggested, "reject");
	assert.ok(result.rows[0].triage.reasons.length > 0, "la trace du score est exposée");
});

test("filtre par seau et pagination", async () => {
	const result = await reviewQueue({ source: SOURCE, bucket: "tiede", limit: 1 });
	assert.ok(result.total >= 1);
	assert.ok(result.rows.every((row) => row.triage.bucket === "tiede"));
	assert.equal(result.rows.length, 1);
	const page2 = await reviewQueue({ source: SOURCE, limit: 1, page: 1 });
	assert.notEqual(page2.rows[0]?.id, result.rows[0]?.id);
});

test("rejet groupé : statut, journal et motif", async () => {
	const a = await claim(` foreign-a-${TAG}`);
	const b = await claim(`foreign-b-${TAG}`);
	const outcome = await applyReview([a, b], "reject", "hors périmètre régional", "analyste@test");
	assert.equal(outcome.changed, 2);
	assert.deepEqual(outcome.skipped, []);
	const rows = await query<{ status: string; review: Array<{ action: string; reason: string; by: string }> }>(
		`SELECT status, extracted->'_review' AS review FROM quarantine_raw WHERE id = ANY($1::bigint[])`,
		[[a, b]],
	);
	for (const row of rows.rows) {
		assert.equal(row.status, "rejected");
		assert.equal(row.review.length, 1);
		assert.equal(row.review[0].action, "reject");
		assert.equal(row.review[0].reason, "hors périmètre régional");
		assert.equal(row.review[0].by, "analyste@test");
	}
});

test("annulation : retour en attente, journal conservé", async () => {
	const id = await claim(`undo-${TAG}`);
	await applyReview([id], "reject", "erreur de tri", "analyste@test");
	const outcome = await applyReview([id], "undo", null, "analyste@test");
	assert.equal(outcome.changed, 1);
	const r = await query<{ status: string; review: unknown[] }>(
		"SELECT status, extracted->'_review' AS review FROM quarantine_raw WHERE id=$1", [id],
	);
	assert.equal(r.rows[0].status, "pending");
	assert.equal(r.rows[0].review.length, 2, "l'annulation s'ajoute au journal, elle ne l'efface pas");
});

test("promotion : événement créé, rejeu sans doublon, annulation refusée", async () => {
	const id = await claim(`Commune de Pessac ${TAG}`, { description: "Revendication de test" });
	const first = await applyReview([id], "promote", "incident plausible", "analyste@test");
	assert.equal(first.promoted, 1);
	assert.equal(first.changed, 1);

	const event = await query<{ id: number; org_id: number | null }>(
		`SELECT id, org_id FROM event WHERE dedup_key =
		   (SELECT 'quarantine:' || content_hash FROM quarantine_raw WHERE id=$1)`, [id],
	);
	assert.equal(event.rows.length, 1, "la promotion crée l'événement public");

	const again = await applyReview([id], "promote", null, "analyste@test");
	assert.equal(again.promoted, 0);
	assert.equal(again.skipped[0]?.reason, "déjà promu");

	const undo = await applyReview([id], "undo", null, "analyste@test");
	assert.equal(undo.changed, 0, "une promotion ne se défait pas depuis la file");
	assert.equal(undo.skipped[0]?.reason, "non annulable");
});

test("le journal de revue sort de la quarantaine, jamais dans le contenu extrait", async () => {
	const id = await claim(`leak-${TAG}`, { description: "texte de test" });
	await applyReview([id], "review", "à vérifier", "analyste@test");
	const r = await query<{ extracted: Record<string, unknown> }>(
		"SELECT extracted FROM quarantine_raw WHERE id=$1", [id],
	);
	assert.ok("_review" in r.rows[0].extracted, "le journal est bien stocké dans extracted");
	assert.equal(r.rows[0].extracted.description, "texte de test", "le contenu extrait reste intact");

	// La file expose le journal par son propre champ.
	const pending = await reviewQueue({ source: SOURCE, status: "reviewed", limit: 50 });
	const row = pending.rows.find((item) => item.id === id);
	assert.ok(row, "le fait marqué « revu » doit rester consultable");
	assert.equal(row?.review[0]?.reason, "à vérifier");
});

test("sélection vide : rien n'est fait, rien ne plante", async () => {
	const outcome = await applyReview([], "reject", "motif", "analyste@test");
	assert.equal(outcome.requested, 0);
	assert.equal(outcome.changed, 0);
});
