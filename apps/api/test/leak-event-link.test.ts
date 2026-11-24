import { test } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/db.js";

/**
 * Le lien est une écriture sur la revendication, jamais sur l'incident :
 * un faux rattachement est pire qu'une absence de lien.
 */

async function claim(fingerprint: string, victim: string, group: string): Promise<number> {
	const r = await query<{ id: number }>(
		`INSERT INTO leak_claim (fingerprint, source, site_slug, group_name, victim, na, published_at)
		 VALUES ($1, 'ransomlook', 'site-test', $2, $3, false, now()) RETURNING id`,
		[fingerprint, group, victim],
	);
	return r.rows[0]!.id;
}

async function incident(dedupKey: string, organisation: string, group: string): Promise<number> {
	const r = await query<{ id: number }>(
		`INSERT INTO event
		   (dedup_key, family, assertion_type, title, source_id, source_url, valid_at, evidence)
		 VALUES ($1, 'ransomware', 'confirmed_incident', $2, 'ransomlook',
		         'https://example.invalid/incident', now() - interval '2 days', $3::jsonb)
		 RETURNING id`,
		[
			dedupKey,
			`Incident confirmé — ${organisation} : systèmes chiffrés`,
			JSON.stringify({ run_id: "1", organisation, group }),
		],
	);
	return r.rows[0]!.id;
}

async function linked(claimId: number): Promise<number | null> {
	const r = await query<{ confirmed_event_id: number | null; confirmed_event_motif: string | null }>(
		"SELECT confirmed_event_id, confirmed_event_motif FROM leak_claim WHERE id = $1",
		[claimId],
	);
	assert.equal(r.rows[0]!.confirmed_event_id === null, r.rows[0]!.confirmed_event_motif === null);
	return r.rows[0]!.confirmed_event_id;
}

test("revendication na=false reliée à l'incident confirmé préexistant", async () => {
	const stamp = Date.now();
	const claimId = await claim(`link-ok-${stamp}`, "Organisation Liaison Test", "Groupe Liaison");
	const eventId = await incident(`link-ok-${stamp}`, "Organisation Liaison Test", "groupe liaison");

	const r = await query<{ link_leak_claims_to_events: number }>(
		"SELECT public.link_leak_claims_to_events(ARRAY[$1::bigint])",
		[claimId],
	);
	assert.equal(r.rows[0]!.link_leak_claims_to_events, 1);
	assert.equal(await linked(claimId), eventId);
});

test("groupe différent : aucun lien (et aucun motif)", async () => {
	const stamp = Date.now();
	const claimId = await claim(`link-group-${stamp}`, "Organisation Groupe Test", "Groupe Un");
	await incident(`link-group-${stamp}`, "Organisation Groupe Test", "groupe deux");

	await query("SELECT public.link_leak_claims_to_events(ARRAY[$1::bigint])", [claimId]);
	assert.equal(await linked(claimId), null);
});

test("jeu d'or : 75/100 liés, zéro faux lien, événements confirmés", async () => {
	const r = await query<{
		n: number;
		matched: number;
		ratio: number;
		false_links: number;
		wrong_assertions: number;
		wrong_na: number;
	}>(`
		SELECT count(*)::int AS n,
		       count(*) FILTER (WHERE matched)::int AS matched,
		       count(*) FILTER (WHERE matched)::float / count(*) AS ratio,
		       count(*) FILTER (WHERE false_link)::int AS false_links,
		       count(*) FILTER (WHERE event_assertion <> 'confirmed_incident')::int AS wrong_assertions,
		       count(*) FILTER (WHERE claim_na)::int AS wrong_na
		  FROM leak_link_eval
	`);
	const v = r.rows[0]!;
	assert.equal(v.n, 100);
	assert.equal(v.matched, 75);
	assert.ok(v.ratio >= 0.7, `ratio ${v.ratio}`);
	assert.equal(v.false_links, 0);
	assert.equal(v.wrong_assertions, 0);
	assert.equal(v.wrong_na, 0);
});
