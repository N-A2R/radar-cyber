/**
 * Un lien défait ne doit pas laisser un faux drapeau régional.
 *
 * Base jetable fournie par `test/run.ts` : aucun test n'écrit dans `radar`.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closePools, query, withTransaction } from "../src/db.js";
import { defaireRattachement } from "../src/match/detachement.js";

const TAG = `portee-detachement-${process.pid}`;
const ids: number[] = [];

async function eventRattache(titre: string, orgId: number, suffixe: string, motif = "rattachement"): Promise<number> {
	const { rows } = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, summary, observed_at,
		                    source_id, source_url, evidence, org_id, regional, regional_motif)
		 VALUES ($1, 'ransomware', 'third_party_claim', $2, '', now(),
		         'ransomlook', 'https://example.invalid/evenement', '{"run_id":"1"}'::jsonb,
		         $3, true, $4)
		 RETURNING id`,
		[`${TAG}:${suffixe}`, titre, orgId, motif],
	);
	const id = rows[0]!.id;
	ids.push(id);
	return id;
}

after(async () => {
	if (ids.length) {
		await query("DELETE FROM event WHERE id = ANY($1::int[])", [ids]);
	}
	await closePools();
});

test("un rattachement défait sur un texte non régional rend le drapeau à faux et journalise l'avant/après", async () => {
	const org = await query<{ id: number }>("SELECT id FROM org ORDER BY id LIMIT 1");
	const orgId = org.rows[0]!.id;
	const id = await eventRattache("Cyberattaque chez une entreprise à Paris", orgId, "hors-region");

	const resultat = await withTransaction((client) =>
		defaireRattachement(client, {
			eventId: id,
			orgId,
			motif: "body-only-name",
			regle: "coherence@1",
			journal: {
				kind: "attachment.coherence",
				actor: "test",
				summary: "incoherent attachment removed (body-only-name)",
			},
		}),
	);
	assert.equal(resultat.updated, true);
	assert.deepEqual(resultat.avant, { regional: true, motif: "rattachement" });
	assert.deepEqual(resultat.apres, { regional: false, motif: "aucun" });

	const event = await query<{ org_id: number | null; regional: boolean; regional_motif: string }>(
		"SELECT org_id, regional, regional_motif FROM event WHERE id = $1",
		[id],
	);
	assert.equal(event.rows[0]?.org_id, null);
	assert.equal(event.rows[0]?.regional, false);
	assert.equal(event.rows[0]?.regional_motif, "aucun");

	const journal = await query<{ payload: Record<string, unknown> }>(
		"SELECT payload FROM journal WHERE kind = 'attachment.coherence' AND subject = $1",
		[`event:${id}`],
	);
	assert.equal(journal.rows.length, 1);
	const payload = journal.rows[0]!.payload as {
		orgRetiree: number;
		reason?: string;
		porteeAvant: { regional: boolean; motif: string };
		porteeApres: { regional: boolean; motif: string };
	};
	assert.equal(payload.orgRetiree, orgId);
	assert.equal(payload.porteeAvant.motif, "rattachement");
	assert.equal(payload.porteeApres.regional, false);
});

test("un texte qui nomme un département reste régional avec le motif departement", async () => {
	const org = await query<{ id: number }>("SELECT id FROM org ORDER BY id LIMIT 1");
	const orgId = org.rows[0]!.id;
	const id = await eventRattache("Cyberattaque en Gironde", orgId, "gironde");

	const resultat = await withTransaction((client) =>
		defaireRattachement(client, {
			eventId: id,
			orgId,
			motif: "no-shared-node",
			regle: "repair-jetons",
			journal: {
				kind: "event.rattachement",
				actor: "test",
				summary: "réparation : rattachement défait",
				subject: `${TAG}:gironde`,
			},
		}),
	);
	assert.deepEqual(resultat.apres, { regional: true, motif: "departement" });

	const event = await query<{ regional: boolean; regional_motif: string }>(
		"SELECT regional, regional_motif FROM event WHERE id = $1",
		[id],
	);
	assert.equal(event.rows[0]?.regional, true);
	assert.equal(event.rows[0]?.regional_motif, "departement");
});

test("un écart d'organisation ne défait rien et n'écrit rien", async () => {
	const org = await query<{ id: number }>("SELECT id FROM org ORDER BY id LIMIT 1");
	const orgId = org.rows[0]!.id;
	const id = await eventRattache("Cyberattaque à Bordeaux", orgId, "conflit");

	const resultat = await withTransaction((client) =>
		defaireRattachement(client, {
			eventId: id,
			orgId: orgId + 1,
			motif: "perime",
			regle: "test",
			journal: { kind: "event.rattachement", actor: "test", summary: "test" },
		}),
	);
	assert.equal(resultat.updated, false);
	const event = await query<{ org_id: number; regional: boolean; regional_motif: string }>(
		"SELECT org_id, regional, regional_motif FROM event WHERE id = $1",
		[id],
	);
	assert.equal(event.rows[0]?.org_id, orgId);
	assert.equal(event.rows[0]?.regional_motif, "rattachement");
	const journal = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM journal WHERE subject = $1",
		[`event:${id}`],
	);
	assert.equal(journal.rows[0]?.n, "0");
});

test("un motif régional issu de la source survit au détachement", async () => {
	const org = await query<{ id: number }>("SELECT id FROM org ORDER BY id LIMIT 1");
	const orgId = org.rows[0]!.id;
	const id = await eventRattache("Communiqué régional sans département dans le titre", orgId, "source-region", "nouvelle-aquitaine");

	const resultat = await withTransaction((client) =>
		defaireRattachement(client, {
			eventId: id,
			orgId,
			motif: "sources sans rapport",
			regle: "certification-siren",
			journal: { kind: "event.rattachement", actor: "test", summary: "décliage" },
		}),
	);
	assert.deepEqual(resultat.apres, { regional: true, motif: "nouvelle-aquitaine" });
	const event = await query<{ regional: boolean; regional_motif: string }>(
		"SELECT regional, regional_motif FROM event WHERE id = $1",
		[id],
	);
	assert.equal(event.rows[0]?.regional, true);
	assert.equal(event.rows[0]?.regional_motif, "nouvelle-aquitaine");
});
