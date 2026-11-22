/**
 * Une collectivité victime reçoit le réflexe à suivre et le guichet national
 * 17Cyber, vérifié et daté. Le test couvre les 20 alertes créées par la
 * migration 200, le déclencheur d'écriture, le message diffusé et le contrôle
 * HTTP hebdomadaire (avec un `fetch` factice : aucun réseau en test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { query } from "../src/db.js";
import {
	ACTIONS_ORIENTATION_COLLECTIVITE,
	ORIENTATION_VERIFIEE_LE,
	URL_ORIENTATION_COLLECTIVITE,
} from "../src/orientation/collectivite.js";
import {
	orientationVerificationDue,
	verifierOrientationCollectivites,
	type DbRequete,
} from "../src/orientation/verification.js";
import { buildDeliveryMessage, type DeliveryAlert } from "../src/notify/alert-delivery.js";

type AlerteOrientation = {
	id: number;
	url_orientation: string | null;
	actions: string[] | null;
	lien_verifie_le: Date | string | null;
};

const selection = `
  SELECT a.id, a.url_orientation, a.actions, a.lien_verifie_le
    FROM alert a JOIN org o ON o.id = a.org_id
   WHERE o.kind = 'collectivite'
   ORDER BY a.id
   LIMIT 20`;

test("20 alertes de collectivité portent le guichet, 5 actions et une date vérifiée", async () => {
	const r = await query<AlerteOrientation>(selection);
	assert.equal(r.rows.length, 20, "la migration doit fournir 20 alertes de collectivité");
	for (const alerte of r.rows) {
		assert.equal(alerte.url_orientation, URL_ORIENTATION_COLLECTIVITE);
		assert.ok(Array.isArray(alerte.actions), `actions de l'alerte #${alerte.id} absentes`);
		assert.equal(alerte.actions!.length, 5, `5 actions attendues sur l'alerte #${alerte.id}`);
		assert.deepEqual(alerte.actions, [...ACTIONS_ORIENTATION_COLLECTIVITE]);
		assert.ok(alerte.actions!.some((a) => a.includes("17Cyber")), "le réflexe cite 17Cyber");
		assert.ok(
			alerte.actions!.some((a) => a.includes("national")),
			"17Cyber est présenté comme dispositif national, jamais comme source locale",
		);
		assert.ok(alerte.lien_verifie_le, `lien_verifie_le absent sur l'alerte #${alerte.id}`);
		const date = new Date(alerte.lien_verifie_le!);
		assert.ok(!Number.isNaN(date.getTime()), `lien_verifie_le illisible sur l'alerte #${alerte.id}`);
		assert.ok(date.getTime() <= Date.now() + 60_000, "lien_verifie_le ne peut pas être dans le futur");
	}
});

test("le déclencheur oriente toute nouvelle alerte de collectivité, quelle que soit la voie d'écriture", async () => {
	const slug = `orientation-trigger-${process.pid}-${Date.now()}`;
	const org = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind) VALUES ($1,$2,'collectivite') RETURNING id",
		["Collectivité de test du déclencheur", slug],
	);
	const orgId = org.rows[0]!.id;
	try {
		const inserted = await query<AlerteOrientation>(
			`INSERT INTO alert (rule_id, title, severity, org_id, url_orientation, actions)
			 VALUES ($1,$2,3,$3,'https://exemple.invalid', '["action unique"]'::jsonb)
			 RETURNING id, url_orientation, actions, lien_verifie_le`,
			[`orientation-trigger-${slug}`, "Alerte de test du déclencheur", orgId],
		);
		const alerte = inserted.rows[0]!;
		assert.equal(alerte.url_orientation, URL_ORIENTATION_COLLECTIVITE, "l'URL fournie est remplacée");
		assert.deepEqual(alerte.actions, [...ACTIONS_ORIENTATION_COLLECTIVITE], "les 5 actions sont forcées");
		assert.ok(alerte.lien_verifie_le);
	} finally {
		await query("DELETE FROM alert WHERE org_id = $1", [orgId]);
		await query("DELETE FROM org WHERE id = $1", [orgId]);
	}
});

test("une alerte d'une autre organisation ne reçoit ni guichet ni actions", async () => {
	const slug = `orientation-hors-collectivite-${process.pid}-${Date.now()}`;
	const org = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind) VALUES ($1,$2,'entreprise') RETURNING id",
		["Entreprise de test hors orientation", slug],
	);
	const orgId = org.rows[0]!.id;
	try {
		const inserted = await query<AlerteOrientation>(
			`INSERT INTO alert (rule_id, title, severity, org_id)
			 VALUES ($1,$2,2,$3)
			 RETURNING id, url_orientation, actions, lien_verifie_le`,
			[`orientation-hors-${slug}`, "Alerte d'entreprise", orgId],
		);
		const alerte = inserted.rows[0]!;
		assert.equal(alerte.url_orientation, null);
		assert.deepEqual(alerte.actions, []);
		assert.equal(alerte.lien_verifie_le, null);
	} finally {
		await query("DELETE FROM alert WHERE org_id = $1", [orgId]);
		await query("DELETE FROM org WHERE id = $1", [orgId]);
	}
});

function messageCollectivite(): DeliveryAlert {
	return {
		id: 42,
		title: "Alerte collectivité",
		severity: 3,
		status: "open",
		created_at: "2026-11-22T10:00:00.000Z",
		attempts: 0,
		webhook_delivered_at: null,
		telegram_delivered_at: null,
		org_name: "Collectivité de démonstration 01",
		org_kind: "collectivite",
		source_name: "source locale",
		event_title: null,
		source_url: null,
		url_orientation: URL_ORIENTATION_COLLECTIVITE,
		actions: [...ACTIONS_ORIENTATION_COLLECTIVITE],
		lien_verifie_le: ORIENTATION_VERIFIEE_LE,
	};
}

test("le message diffusé à la collectivité contient le réflexe, le lien et sa date", () => {
	const msg = buildDeliveryMessage(messageCollectivite(), { webBaseUrl: "https://radar.local" });
	assert.match(msg.text, /Réflexe collectivité/);
	assert.match(msg.text, /17Cyber/);
	assert.ok(msg.text.includes(URL_ORIENTATION_COLLECTIVITE));
	assert.ok(
		msg.text.includes(ORIENTATION_VERIFIEE_LE.slice(0, -1)),
		"la date du contrôle apparaît dans le message",
	);
	for (const [i, action] of ACTIONS_ORIENTATION_COLLECTIVITE.entries()) {
		assert.ok(msg.text.includes(`${i + 1}) ${action}`));
	}
	const orientation = (msg.payload.alert as Record<string, unknown>).orientation as {
		url: string;
		actions: string[];
		verifie_le: string;
		dispositif: string;
	};
	assert.equal(orientation.url, URL_ORIENTATION_COLLECTIVITE);
	assert.equal(orientation.actions.length, 5);
	assert.equal(orientation.verifie_le, new Date(ORIENTATION_VERIFIEE_LE).toISOString());
	assert.match(orientation.dispositif, /national/);
});

test("une alerte qui ne concerne pas une collectivité ne reçoit pas le bloc d'orientation", () => {
	const msg = buildDeliveryMessage({ ...messageCollectivite(), org_kind: "entreprise" }, {});
	assert.doesNotMatch(msg.text, /Réflexe collectivité/);
	assert.equal((msg.payload.alert as Record<string, unknown>).orientation, null);
});

type Ecriture = { sql: string; params?: unknown[] };

/** Base factice : ne renvoie que ce que le vérificateur interroge. */
function baseFactice(alertes: Array<{ id: number; url_orientation: string | null }>, ecritures: Ecriture[], dernier: string | null = null): DbRequete {
	return async <T>(sql: string, params?: unknown[]) => {
		if (sql.includes("min(a.lien_verifie_le)")) {
			return { rows: [{ dernier }] as T[], rowCount: 1 };
		}
		if (sql.includes("SELECT a.id")) {
			return { rows: alertes as T[], rowCount: alertes.length };
		}
		ecritures.push({ sql, params });
		return { rows: [] as T[], rowCount: alertes.length };
	};
}

const vingtLiens = Array.from({ length: 20 }, (_, i) => ({
	id: i + 1,
	url_orientation: URL_ORIENTATION_COLLECTIVITE,
}));

test("le contrôle hebdomadaire date les 20 alertes quand les 20 liens répondent 200", async () => {
	const ecritures: Ecriture[] = [];
	const r = await verifierOrientationCollectivites(baseFactice(vingtLiens, ecritures), {
		fetchImpl: (async () => new Response(null, { status: 200 })) as typeof fetch,
		now: () => new Date("2026-11-23T07:00:00.000Z"),
	});
	assert.equal(r.alertes, 20);
	assert.equal(r.ok, 20);
	assert.equal(r.conforme, true);
	assert.equal(r.mises_a_jour, 20);
	assert.equal(r.verifie_le, "2026-11-23T07:00:00.000Z");
	assert.equal(ecritures.length, 1, "une seule écriture groupe le lot");
	assert.equal(ecritures[0]!.params?.[0], URL_ORIENTATION_COLLECTIVITE);
	assert.equal(ecritures[0]!.params?.[2], "2026-11-23T07:00:00.000Z");
});

test("un seul lien non-200 rend le contrôle non conforme et ne touche pas la date", async () => {
	const ecritures: Ecriture[] = [];
	let appels = 0;
	const r = await verifierOrientationCollectivites(baseFactice(vingtLiens, ecritures), {
		fetchImpl: (async () => {
			appels += 1;
			return new Response(null, { status: appels === 7 ? 503 : 200 });
		}) as typeof fetch,
		now: () => new Date("2026-11-23T07:00:00.000Z"),
	});
	assert.equal(r.alertes, 20);
	assert.equal(r.ok, 19);
	assert.equal(r.conforme, false);
	assert.equal(r.mises_a_jour, 0);
	assert.equal(ecritures.length, 0, "aucune date n'est écrite sur un contrôle en échec");
});

test("le contrôle est dû seulement si la dernière date a plus de 7 jours", async () => {
	const maintenant = () => new Date("2026-11-23T07:00:00.000Z");
	const recent = baseFactice([], [], "2026-11-20T07:00:00.000Z");
	const ancien = baseFactice([], [], "2026-11-10T07:00:00.000Z");
	const jamais = baseFactice([], [], null);
	assert.equal(await orientationVerificationDue(recent, { now: maintenant }), false);
	assert.equal(await orientationVerificationDue(ancien, { now: maintenant }), true);
	assert.equal(await orientationVerificationDue(jamais, { now: maintenant }), true);
});
