/**
 * Étage 0 — la détection est-elle vraiment branchée sur la collecte ?
 *
 * Ces tests verrouillent les deux chaînons qui manquaient :
 *  1. un événement collecté produit une alerte sans passer par la quarantaine ;
 *  2. cette alerte est sélectionnable par le canal temps réel.
 *
 * Isolation comme dans detect.test.ts : enregistrements jetables préfixés,
 * supprimés dans un `finally`, règles de test retirées et cache rechargé.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { loadRules } from "../src/detect/engine.js";
import { resetDetectionCursors, runDetectionPass } from "../src/detect/incremental.js";
import { latestAlertId, selectNewAlerts } from "../src/notify/alert-feed.js";

const TAG = `e0${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
let seq = 0;
const next = () => `${TAG}-${++seq}`;

const created = { events: [] as number[], orgs: [] as number[], rules: [] as string[], alerts: [] as number[] };

async function sourceId(): Promise<string> {
	const r = await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1");
	return r.rows[0].id;
}

async function makeOrg(): Promise<number> {
	const slug = next();
	const r = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, dept, status)
		 VALUES ($1, $2, 'entreprise', 'Bordeaux', '33', 'confirme') RETURNING id`,
		[`Org ${slug}`, slug],
	);
	const id = Number(r.rows[0].id);
	created.orgs.push(id);
	return id;
}

async function makeEvent(opts: { orgId?: number | null; family?: string; title?: string } = {}): Promise<number> {
	const r = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, severity, confidence, source_id, geo_type, org_id)
		 VALUES ($1, $2, 'confirmed_incident', $3, 4, 'A1', $4, 'entity_location', $5) RETURNING id`,
		[next(), opts.family ?? "ransomware", opts.title ?? `Incident ${TAG}`, await sourceId(), opts.orgId ?? null],
	);
	// event.id est un bigint : le driver le rend en chaîne, on normalise.
	const id = Number(r.rows[0].id);
	created.events.push(id);
	return id;
}

async function makeRule(match: Record<string, unknown>): Promise<string> {
	const id = next();
	await query(
		`INSERT INTO detection_rule (id, name, description, severity, enabled, match, action)
		 VALUES ($1, $2, 'règle de test étage 0', 4, true, $3::jsonb, 'alert')`,
		[id, `Règle ${id}`, JSON.stringify(match)],
	).catch(async () => {
		// colonne description nullable selon les migrations : on réessaie au minimal
		await query(
			`INSERT INTO detection_rule (id, name, severity, enabled, match, action)
			 VALUES ($1, $2, 4, true, $3::jsonb, 'alert')`,
			[id, `Règle ${id}`, JSON.stringify(match)],
		);
	});
	created.rules.push(id);
	await loadRules(true);
	return id;
}

after(async () => {
	if (created.events.length) {
		await query("DELETE FROM alert WHERE event_id = ANY($1::int[])", [created.events]);
		await query("DELETE FROM event WHERE id = ANY($1::int[])", [created.events]);
	}
	if (created.rules.length) await query("DELETE FROM detection_rule WHERE id = ANY($1::text[])", [created.rules]);
	if (created.orgs.length) await query("DELETE FROM org WHERE id = ANY($1::int[])", [created.orgs]);
	await loadRules(true);
	resetDetectionCursors();
	await closePools();
});

test("un événement collecté produit une alerte sans passer par la quarantaine", async () => {
	const orgId = await makeOrg();
	const family = `ransomware`;
	const ruleId = await makeRule({ family, org_kind: "entreprise", keywords: { any: [TAG] } });
	const eventId = await makeEvent({ orgId, family, title: `Rançongiciel ${TAG} chez une organisation` });

	resetDetectionCursors();
	const pass = await runDetectionPass({ catchUp: 50, lateLimit: 0 });

	const r = await query<{ id: number }>(
		"SELECT id FROM alert WHERE event_id = $1 AND rule_id = $2",
		[eventId, ruleId],
	);
	assert.equal(r.rows.length, 1, "l'événement collecté doit avoir produit son alerte");
	assert.ok(pass.alerts >= 1, `le passage doit compter au moins une alerte (${pass.alerts})`);
});

test("le rejeu du même lot ne crée pas de doublon", async () => {
	const before = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM alert WHERE event_id = ANY($1::int[])",
		[created.events],
	);
	resetDetectionCursors();
	await runDetectionPass({ catchUp: 50, lateLimit: 0 });
	const after = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM alert WHERE event_id = ANY($1::int[])",
		[created.events],
	);
	assert.equal(after.rows[0].n, before.rows[0].n, "insertion idempotente attendue");
});

test("rattachement tardif : l'événement évalué sans org finit par alerter", async () => {
	const ruleId = await makeRule({ family: "ransomware", org_kind: "entreprise", keywords: { any: [TAG] } });
	// Collecté sans organisation : la règle exige une org, donc pas d'alerte.
	const eventId = await makeEvent({ orgId: null, title: `Fuite ${TAG} non rattachée` });
	resetDetectionCursors();
	await runDetectionPass({ catchUp: 50, lateLimit: 0 });
	let r = await query<{ id: number }>("SELECT id FROM alert WHERE event_id = $1 AND rule_id = $2", [eventId, ruleId]);
	assert.equal(r.rows.length, 0, "sans organisation, la règle ne doit pas déclencher");

	// L'analyste (ou match-orgs) rattache après coup.
	const orgId = await makeOrg();
	await query("UPDATE event SET org_id = $1 WHERE id = $2", [orgId, eventId]);
	await runDetectionPass({ catchUp: 0, lateLimit: 200 });

	r = await query<{ id: number }>("SELECT id FROM alert WHERE event_id = $1 AND rule_id = $2", [eventId, ruleId]);
	assert.equal(r.rows.length, 1, "le rattrapage des rattachements tardifs doit créer l'alerte");
});

test("le canal temps réel sélectionne les nouvelles alertes, sans les TLP:RED", async () => {
	const floor = await latestAlertId();
	const orgId = await makeOrg();
	await makeRule({ family: "ransomware", org_kind: "entreprise", keywords: { any: [TAG] } });
	const eventId = await makeEvent({ orgId, title: `Alerte temps réel ${TAG}` });
	resetDetectionCursors();
	await runDetectionPass({ catchUp: 50, lateLimit: 0 });

	const alerts = await selectNewAlerts(floor);
	assert.ok(
		alerts.some((a) => a.event_id === eventId),
		"l'alerte créée doit être visible par le canal SSE",
	);
	for (const alert of alerts) {
		assert.equal(typeof alert.id, "number");
		assert.equal(typeof alert.severity, "number");
		assert.ok(alert.created_at.endsWith("Z"), "date ISO attendue");
	}

	// Un événement TLP:RED ne doit jamais pousser son alerte.
	await query("UPDATE event SET tlp = 'RED' WHERE id = $1", [eventId]);
	const filtered = await selectNewAlerts(floor);
	assert.ok(!filtered.some((a) => a.event_id === eventId), "une alerte TLP:RED ne doit pas être poussée");
	await query("UPDATE event SET tlp = 'AMBER' WHERE id = $1", [eventId]);
});
