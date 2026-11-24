/**
 * Régressions déterministes des constats D1, D4–D12 du domaine détection.
 *
 * Aucun appel réseau réel : le transport du modèle est injecté, les canaux de
 * diffusion utilisent un `fetch` faux. Toutes les lignes sont créées dans la
 * base de test jetable puis retirées en fin de test.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closePools, query } from "../src/db.js";
import { ALERT_SCOPES_REVUE, SILENT_SOURCE_SCOPE } from "../src/alert-scope.js";
import {
	askDecision,
	configureDecisionClient,
	decisionApiKey,
	resetDecisionClient,
} from "../src/detect/decision.js";
import { HOUR_MS, SILENT_SOURCE_RULE } from "../src/detect/silent-source.js";
import { resetSilentSourceCheckState, runSilentSourceCheck } from "../src/detect/silent-source-monitor.js";
import { REPLAY_THRESHOLD_HOURS, replaySilentSourceEpisodes } from "../src/detect/silent-source-replay.js";
import { evaluateEvent, loadRuleThresholds, loadRules, type RuleMatch } from "../src/detect/engine.js";
import {
	fetchPendingAlerts,
	deliverPendingAlerts,
	isDeliveryConfigured,
	type DeliveryConfig,
} from "../src/notify/alert-delivery.js";
import { fetchNotificationAlerts } from "../src/notify/notification-alerts.js";

const TAG = `repair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let seq = 0;
const next = (): string => `${TAG}-${++seq}`;

type Ids = {
	events: number[];
	orgs: number[];
	rules: string[];
	alerts: number[];
	sources: string[];
	calibration: string[];
};

function newIds(): Ids {
	return { events: [], orgs: [], rules: [], alerts: [], sources: [], calibration: [] };
}

async function cleanup(ids: Ids): Promise<void> {
	if (ids.alerts.length > 0) await query("DELETE FROM alert WHERE id = ANY($1::int[])", [ids.alerts]);
	if (ids.events.length > 0) {
		await query("DELETE FROM alert WHERE event_id = ANY($1::bigint[])", [ids.events]);
		await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [ids.events]);
	}
	if (ids.orgs.length > 0) await query("DELETE FROM org WHERE id = ANY($1::int[])", [ids.orgs]);
	if (ids.rules.length > 0) await query("DELETE FROM detection_rule WHERE id = ANY($1::text[])", [ids.rules]);
	if (ids.calibration.length > 0) await query("DELETE FROM rule_calibration WHERE rule_id = ANY($1::text[])", [ids.calibration]);
	if (ids.sources.length > 0) await query("DELETE FROM source WHERE id = ANY($1::text[])", [ids.sources]);
	await loadRules(true);
	await loadRuleThresholds(true);
	resetDecisionClient();
}

async function insertOrg(dept = "33"): Promise<number> {
	const r = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, dept)
		 VALUES ($1,$2,'collectivite','Bordeaux',$3) RETURNING id`,
		[`Org ${next()}`, next(), dept],
	);
	return Number(r.rows[0]!.id);
}

async function insertSource(): Promise<string> {
	const id = `src-${next()}`;
	await query("INSERT INTO source (id, name, family, url) VALUES ($1,$2,'cti','https://example.invalid/source')", [id, `Source ${id}`]);
	return id;
}

type NewEvent = {
	family: string;
	title: string;
	assertionType?: string;
	confidence?: string;
	orgId?: number | null;
	regional?: boolean;
	sourceId?: string;
	observedAt?: string;
};

async function insertEvent(e: NewEvent): Promise<number> {
	const r = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, summary, severity, confidence,
		                    source_id, org_id, regional, observed_at, evidence, source_url)
		 VALUES ($1,$2,$3,$4,$5,4,$6,$7,$8,$9,COALESCE($10, now()),'{"run_id":"1"}'::jsonb,
		         'https://example.invalid/event') RETURNING id`,
		[
			next(),
			e.family,
			e.assertionType ?? "ambient_signal",
			e.title,
			"Résumé de test sans donnée personnelle",
			e.confidence ?? "A1",
			e.sourceId ?? "ransomlook",
			e.orgId ?? null,
			e.regional ?? false,
			e.observedAt ?? null,
		],
	);
	return Number(r.rows[0]!.id);
}

async function insertRule(id: string, match: RuleMatch): Promise<void> {
	await query(
		`INSERT INTO detection_rule (id, name, description, severity, enabled, match, action)
		 VALUES ($1,$2,NULL,4,true,$3,'alert')`,
		[id, id, JSON.stringify(match)],
	);
	await loadRules(true);
}

async function insertCalibration(ruleId: string, threshold: number): Promise<void> {
	await query(
		`INSERT INTO rule_calibration
		   (rule_id, threshold, precision, recall, alerts, positives, negatives, window_days, source)
		 VALUES ($1,$2,0.9,0.6,10,9,1,30,'test:repair')`,
		[ruleId, threshold],
	);
	await loadRuleThresholds(true);
}

async function insertAlert(opts: {
	ruleId: string;
	eventId?: number | null;
	orgId?: number | null;
	status?: string;
	scope?: string;
	createdAt?: Date;
}): Promise<number> {
	const r = await query<{ id: number }>(
		`INSERT INTO alert (rule_id, title, severity, status, org_id, event_id, scope, created_at)
		 VALUES ($1,$2,4,$3,$4,$5,$6,COALESCE($7, now())) RETURNING id`,
		[
			opts.ruleId,
			`Alerte ${opts.ruleId}`,
			opts.status ?? "open",
			opts.orgId ?? null,
			opts.eventId ?? null,
			opts.scope ?? "organization_incident",
			opts.createdAt ?? null,
		],
	);
	return Number(r.rows[0]!.id);
}

type DecisionRow = {
	stage: string;
	reason: string;
	verdict: string;
	ruleId: string | null;
	score: string | null;
	threshold: string | null;
	model: string | null;
	scope: string | null;
};

async function decisionsFor(eventId: number): Promise<DecisionRow[]> {
	const r = await query<DecisionRow>(
		`SELECT payload->>'stage' AS stage, payload->>'reason' AS reason,
		        payload->>'verdict' AS verdict, payload->>'ruleId' AS "ruleId",
		        payload->>'score' AS score, payload->>'threshold' AS threshold,
		        payload->>'model' AS model, payload->>'scope' AS scope
		   FROM journal
		  WHERE kind = 'detection.decision' AND payload->>'eventId' = $1
		  ORDER BY id`,
		[String(eventId)],
	);
	return r.rows;
}

function fakeResponse(payload: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => payload,
		text: async () => "",
	} as unknown as Response;
}

function scopeAnswer(choice: string, confidence: number): unknown {
	return {
		answers: {
			scope: {
				choice,
				confidence,
				probabilities: { REGIONAL: 0.1, NATIONAL: 0.1, MONDE: 0.1, [choice]: confidence },
			},
		},
	};
}

after(async () => {
	await closePools();
});

// D1 — le scope de supervision muette est dans la liste unique et n'est diffusé nulle part.
test("D1 : les alertes de supervision muette sont exclues de la diffusion et du flux public", async () => {
	const ids = newIds();
	try {
		assert.ok(ALERT_SCOPES_REVUE.includes(SILENT_SOURCE_SCOPE));
		const org = await insertOrg();
		const event = await insertEvent({ family: "repair-silent", title: "Rançongiciel ransomware", orgId: org });
		ids.events.push(event);
		ids.orgs.push(org);
		const alert = await insertAlert({ ruleId: SILENT_SOURCE_RULE, eventId: event, orgId: org, scope: SILENT_SOURCE_SCOPE });
		ids.alerts.push(alert);

		const pending = await fetchPendingAlerts(100_000);
		assert.ok(!pending.some((a) => a.id === alert), "la file de diffusion exclut le scope revue");
		const feed = await fetchNotificationAlerts({ pendingOnly: false, limit: 100_000 });
		assert.ok(!feed.some((a) => a.id === alert), "le flux RSS exclut le scope revue");
	} finally {
		await cleanup(ids);
	}
});

// D4 — une seule échelle : porte globale sur la note calibrée, seuil calibré sur la note de base.
test("D4 : la porte globale s'applique au score calibré", async () => {
	const ids = newIds();
	try {
		configureDecisionClient({ keys: [] });
		const ruleId = `repair-global-${TAG}`;
		ids.rules.push(ruleId);
		await insertRule(ruleId, { family: "repair-global" });
		const org = await insertOrg();
		ids.orgs.push(org);
		// A2 + signal ambiant + org géolocalisée = 55 ; +30 d'ancrage = 85 >= 65.
		const event = await insertEvent({ family: "repair-global", title: "Rançongiciel ransomware régional", confidence: "A2", orgId: org });
		ids.events.push(event);

		assert.equal(await evaluateEvent(event), 1, "la note calibrée franchit la porte globale");
		const r = await query<{ id: number }>("SELECT id FROM alert WHERE rule_id=$1 AND event_id=$2", [ruleId, event]);
		assert.equal(r.rows.length, 1);
	} finally {
		await cleanup(ids);
	}
});

test("D4 : le seuil calibré s'applique au score non majoré et son refus est tracé", async () => {
	const ids = newIds();
	try {
		configureDecisionClient({ keys: [] });
		const ruleId = `repair-rule-${TAG}`;
		ids.rules.push(ruleId);
		ids.calibration.push(ruleId);
		await insertRule(ruleId, { family: "repair-rule" });
		await insertCalibration(ruleId, 80);
		const org = await insertOrg();
		ids.orgs.push(org);
		// A1 + revendication + org géolocalisée + 1 source = 77 ; +30 = 107.
		// Le seuil calibré lit 77, pas 107 : l'événement est refusé.
		const event = await insertEvent({
			family: "repair-rule", assertionType: "third_party_claim",
			title: "Rançongiciel ransomware revendiqué", confidence: "A1", orgId: org,
		});
		ids.events.push(event);

		assert.equal(await evaluateEvent(event), 0);
		const decisions = await decisionsFor(event);
		const ruleDecision = decisions.find((d) => d.stage === "rule_threshold");
		assert.ok(ruleDecision, "le refus par seuil calibré est consigné");
		assert.equal(ruleDecision.ruleId, ruleId);
		assert.equal(Number(ruleDecision.score), 77);
		assert.equal(Number(ruleDecision.threshold), 80);
	} finally {
		await cleanup(ids);
	}
});

// D5 — le compteur pending_delivery mesure la file réellement diffusible.
test("D5 : pending_delivery exclut les alertes acquittées et résolues", async () => {
	const ids = newIds();
	try {
		const org = await insertOrg();
		const event = await insertEvent({ family: "repair-pending", title: "Rançongiciel ransomware", orgId: org });
		ids.orgs.push(org);
		ids.events.push(event);
		const open = await insertAlert({ ruleId: `repair-pending-${TAG}`, eventId: event, orgId: org });
		const acked = await insertAlert({ ruleId: `repair-pending-${TAG}`, eventId: event, orgId: org, status: "ack" });
		const resolved = await insertAlert({ ruleId: `repair-pending-${TAG}`, eventId: event, orgId: org, status: "resolved" });
		ids.alerts.push(open, acked, resolved);

		const pending = await fetchNotificationAlerts({ pendingOnly: true, limit: 100_000 });
		const idsPending = new Set(pending.map((a) => a.id));
		assert.ok(idsPending.has(open));
		assert.ok(!idsPending.has(acked));
		assert.ok(!idsPending.has(resolved));

		const feed = await fetchNotificationAlerts({ pendingOnly: false, limit: 100_000 });
		const idsFeed = new Set(feed.map((a) => a.id));
		for (const id of [open, acked, resolved]) assert.ok(idsFeed.has(id), "le flux historique garde les trois statuts");
	} finally {
		await cleanup(ids);
	}
});

// D6 — aucun refus du détecteur ne reste silencieux.
test("D6 : le refus par porte globale est consigné", async () => {
	const ids = newIds();
	try {
		configureDecisionClient({ keys: [] });
		const ruleId = `repair-low-${TAG}`;
		ids.rules.push(ruleId);
		await insertRule(ruleId, { family: "repair-low" });
		const event = await insertEvent({ family: "repair-low", title: "Rançongiciel ransomware sans ancrage", confidence: "C3" });
		ids.events.push(event);

		assert.equal(await evaluateEvent(event), 0);
		const decisions = await decisionsFor(event);
		const gate = decisions.find((d) => d.stage === "global_threshold");
		assert.ok(gate, "le refus par porte globale est consigné");
		assert.equal(gate.verdict, "refuse");
		assert.equal(Number(gate.threshold), 65);
	} finally {
		await cleanup(ids);
	}
});

test("D6 : les refus de portée (NATIONAL/MONDE et confiance < 0,9) sont consignés", async () => {
	const ids = newIds();
	try {
		const answers = [scopeAnswer("NATIONAL", 0.95), scopeAnswer("REGIONAL", 0.5), scopeAnswer("MONDE", 0.97)];
		configureDecisionClient({
			keys: ["key-scope-abcdef"],
			fetch: async () => fakeResponse(answers.shift() ?? scopeAnswer("MONDE", 0.95)),
		});
		const ruleId = `repair-scope-${TAG}`;
		ids.rules.push(ruleId);
		await insertRule(ruleId, { family: "repair-scope" });
		const national = await insertEvent({
			family: "repair-scope", assertionType: "confirmed_incident",
			title: "Rançongiciel ransomware national sans organisation", regional: true,
		});
		const unsure = await insertEvent({
			family: "repair-scope", assertionType: "confirmed_incident",
			title: "Rançongiciel ransomware régional incertain", regional: true,
		});
		const monde = await insertEvent({
			family: "repair-scope", assertionType: "confirmed_incident",
			title: "Rançongiciel ransomware hors territoire", regional: true,
		});
		ids.events.push(national, unsure, monde);

		assert.equal(await evaluateEvent(national), 0);
		assert.equal(await evaluateEvent(unsure), 0);
		assert.equal(await evaluateEvent(monde), 0);
		const nationalDecision = (await decisionsFor(national)).find((d) => d.stage === "scope_gate");
		const unsureDecision = (await decisionsFor(unsure)).find((d) => d.stage === "scope_gate");
		const mondeDecision = (await decisionsFor(monde)).find((d) => d.stage === "scope_gate");
		assert.ok(nationalDecision);
		assert.equal(nationalDecision.scope, "NATIONAL");
		assert.equal(nationalDecision.model, "mercury-decide");
		assert.ok(mondeDecision);
		assert.equal(mondeDecision.scope, "MONDE");
		assert.ok(unsureDecision);
		assert.match(unsureDecision.reason, /confiance 0\.5 < 0\.9/);
	} finally {
		await cleanup(ids);
	}
});

test("D6 : le filtre faux événement est consigné", async () => {
	const ids = newIds();
	try {
		configureDecisionClient({ keys: [] });
		const ruleId = `repair-false-${TAG}`;
		ids.rules.push(ruleId);
		await insertRule(ruleId, { family: "repair-false" });
		const event = await insertEvent({ family: "repair-false", title: "Agenda culturel municipal", confidence: "C3" });
		ids.events.push(event);

		assert.equal(await evaluateEvent(event), 0);
		const decisions = await decisionsFor(event);
		const falseDecision = decisions.find((d) => d.stage === "false_event");
		assert.ok(falseDecision, "le faux événement est consigné");
		assert.equal(falseDecision.verdict, "refuse");
		const rows = await query<{ event_id: number }>("SELECT event_id FROM false_event WHERE event_id=$1", [event]);
		assert.equal(rows.rows.length, 1);
	} finally {
		await cleanup(ids);
	}
});

// D6 + D7 — la dédup inter-flux est tracée et ne retient pas une alerte résolue.
test("D7 : une alerte résolue ne bloque plus les autres membres du fait", async () => {
	const ids = newIds();
	try {
		configureDecisionClient({ keys: [] });
		const ruleId = `repair-dedup-${TAG}`;
		ids.rules.push(ruleId);
		await insertRule(ruleId, { family: "repair-dedup" });
		const org = await insertOrg();
		const sourceA = await insertSource();
		const sourceB = await insertSource();
		ids.orgs.push(org);
		ids.sources.push(sourceA, sourceB);
		const observedAt = "2026-11-20T12:00:00.000Z";
		const first = await insertEvent({
			family: "repair-dedup", assertionType: "third_party_claim",
			title: "Rançongiciel ransomware CHU Bordeaux", orgId: org, sourceId: sourceA, observedAt,
		});
		const second = await insertEvent({
			family: "repair-dedup", assertionType: "third_party_claim",
			title: "Rançongiciel ransomware CHU Bordeaux", orgId: org, sourceId: sourceB, observedAt,
		});
		ids.events.push(first, second);

		assert.equal(await evaluateEvent(first), 1);
		const opened = await query<{ id: number }>("SELECT id FROM alert WHERE rule_id=$1 AND event_id=$2", [ruleId, first]);
		assert.equal(opened.rows.length, 1);
		const openedId = Number(opened.rows[0]!.id);
		ids.alerts.push(openedId);

		assert.equal(await evaluateEvent(second), 0, "le fait déjà couvert ne rouvre pas d'alerte");
		const dedup = (await decisionsFor(second)).find((d) => d.stage === "cross_flow_dedup");
		assert.ok(dedup, "le refus de dédup est consigné");
		assert.equal(dedup.ruleId, ruleId);

		await query("UPDATE alert SET status='resolved' WHERE id=$1", [openedId]);
		assert.equal(await evaluateEvent(second), 1, "l'alerte résolue ne bloque plus le second membre");
		const reopened = await query<{ id: number }>("SELECT id FROM alert WHERE rule_id=$1 AND event_id=$2", [ruleId, second]);
		assert.equal(reopened.rows.length, 1);
		ids.alerts.push(Number(reopened.rows[0]!.id));
	} finally {
		await cleanup(ids);
	}
});

// D8 — le replay mesure le seuil calibré, pas le seuil historique de 12 h.
test("D8 : le replay utilise par défaut les 14 h calibrées et accepte un seuil explicite", () => {
	const anchor = Date.parse("2026-11-21T12:00:00.000Z");
	const production = [48, 72, 96, 120].map((h) => ({
		source_id: "source-replay",
		produced_at: new Date(anchor - h * HOUR_MS).toISOString(),
	}));
	assert.equal(REPLAY_THRESHOLD_HOURS, 14);
	const calibr14 = replaySilentSourceEpisodes(production, anchor - 30 * 24 * HOUR_MS, anchor);
	const explicit13 = replaySilentSourceEpisodes(production, anchor - 30 * 24 * HOUR_MS, anchor, 13);
	assert.equal(calibr14[0]?.delayHours, 14);
	assert.equal(explicit13[0]?.delayHours, 13);
	assert.equal(SILENT_SOURCE_RULE, "supervision:silent-source-24h");
});

// D9 — un échec de lecture ne consomme pas le créneau horaire suivant.
test("D9 : un check échoué reste réessayable dans l'heure", async () => {
	resetSilentSourceCheckState();
	const base = Date.parse("2026-11-21T12:00:00Z");
	try {
		const first = await runSilentSourceCheck({ now: base, force: true, sourceIds: [] });
		assert.equal(first.ran, true, "un check réussi pose le créneau");
		// Un octet nul dans un paramètre texte est refusé par PostgreSQL avant
		// toute écriture : aucun réseau, une panne de lecture déterministe.
		await assert.rejects(() => runSilentSourceCheck({ now: base + 10 * 60_000, force: true, sourceIds: ["mauvais\u0000id"] }));
		const retried = await runSilentSourceCheck({ now: base + 20 * 60_000, sourceIds: [] });
		assert.equal(retried.ran, true, "le créneau suivant reste disponible après une erreur");
		assert.equal(retried.alerts, 0);
	} finally {
		resetSilentSourceCheckState();
	}
});

// D10 — rotation de clés sans appel réseau réel.
test("D10 : 401 et erreurs réseau déclenchent la rotation, preferred attend une réponse exploitable", async () => {
	try {
		const keys = ["key-one-abcdef", "key-two-abcdef", "key-three-abcdef"];
		const seen: string[] = [];
		configureDecisionClient({
			keys,
			cooldownMs: 0,
			fetch: async (_url, init) => {
				const auth = String((init?.headers as Record<string, string>).Authorization);
				seen.push(auth.replace("Bearer ", ""));
				if (auth.includes(keys[0]!)) return fakeResponse(null, 401);
				if (auth.includes(keys[1]!)) throw new Error("réseau indisponible");
				return fakeResponse({ answers: { ok: { choice: "oui" } } });
			},
		});
		const payload = await askDecision({ message: "test" }, { q: { type: "choice" } });
		assert.deepEqual(payload, { answers: { ok: { choice: "oui" } } });
		assert.deepEqual(seen, keys);
		assert.equal(decisionApiKey(), keys[2], "seule la clé ayant répondu devient preferred");
	} finally {
		resetDecisionClient();
	}
});

test("D10 : une clé en congé n'est pas réessayée à chaque appel", async () => {
	try {
		let clock = 0;
		const seen: string[] = [];
		const keys = ["key-bad-abcdef", "key-down-abcdef"];
		configureDecisionClient({
			keys,
			cooldownMs: 60_000,
			now: () => clock,
			fetch: async (_url, init) => {
				seen.push(String((init?.headers as Record<string, string>).Authorization).replace("Bearer ", ""));
				return fakeResponse(null, 503);
			},
		});
		assert.equal(await askDecision({ message: "test" }, {}), null);
		assert.equal(await askDecision({ message: "test" }, {}), null, "les deux clés sont en congé");
		assert.deepEqual(seen, keys);

		clock = 61_000;
		const resumed: string[] = [];
		configureDecisionClient({
			fetch: async (_url, init) => {
				resumed.push(String((init?.headers as Record<string, string>).Authorization).replace("Bearer ", ""));
				return fakeResponse({ answers: { ok: true } });
			},
		});
		assert.ok(await askDecision({ message: "test" }, {}), "une clé sort du congé");
		assert.deepEqual(resumed, [keys[0]], "aucune clé en congé n'a été rappelée");
	} finally {
		resetDecisionClient();
	}
});

// D11 — un doublon acquitté entre la lecture du lot et l'envoi ne part pas.
test("D11 : une alerte acquittée pendant le lot ne diffuse pas les canaux suivants", async () => {
	const ids = newIds();
	const originalFetch = globalThis.fetch;
	try {
		const org = await insertOrg();
		const event = await insertEvent({ family: "repair-delivery", title: "Rançongiciel ransomware", orgId: org });
		ids.orgs.push(org);
		ids.events.push(event);
		const alert = await insertAlert({
			ruleId: `repair-delivery-${TAG}`, eventId: event, orgId: org,
			createdAt: new Date(Date.now() - 100 * 365 * 24 * 3600 * 1000),
		});
		ids.alerts.push(alert);

		const urls: string[] = [];
		globalThis.fetch = (async (input: string | URL | Request) => {
			const url = String(input);
			urls.push(url);
			if (url.includes("webhook")) {
				await query("UPDATE alert SET status='ack' WHERE id=$1", [alert]);
				return fakeResponse({});
			}
			return fakeResponse({ ok: true });
		}) as typeof fetch;

		const cfg: DeliveryConfig = {
			webhookUrl: "https://example.invalid/hook",
			webhookSecret: "secret-de-test",
			telegramBotToken: "faux-jeton",
			telegramChatId: "faux-chat",
		};
		const result = await deliverPendingAlerts(() => undefined, { cfg, limit: 1 });
		assert.equal(result.delivered, 0);
		assert.equal(urls.length, 1, "seul le webhook a été tenté avant l'acquittement");
		assert.ok(urls[0]!.includes("webhook"));

		const row = await query<{
			status: string;
			delivered_at: string | null;
			webhook_delivered_at: string | null;
			telegram_delivered_at: string | null;
		}>(
			`SELECT status, delivered_at::text, webhook_delivered_at::text, telegram_delivered_at::text
			   FROM alert WHERE id=$1`,
			[alert],
		);
		assert.equal(row.rows[0]!.status, "ack");
		assert.equal(row.rows[0]!.delivered_at, null);
		assert.equal(row.rows[0]!.telegram_delivered_at, null);
	} finally {
		globalThis.fetch = originalFetch;
		await cleanup(ids);
	}
});

// D12 — une URL de webhook sans secret est une erreur de configuration, pas une tentative.
test("D12 : webhook sans secret n'est pas configuré et ne consomme aucune tentative", async () => {
	const ids = newIds();
	try {
		const org = await insertOrg();
		const event = await insertEvent({ family: "repair-config", title: "Rançongiciel ransomware", orgId: org });
		ids.orgs.push(org);
		ids.events.push(event);
		const alert = await insertAlert({ ruleId: `repair-config-${TAG}`, eventId: event, orgId: org });
		ids.alerts.push(alert);

		const cfg: DeliveryConfig = {
			webhookUrl: "https://example.invalid/hook",
			telegramBotToken: "faux-jeton",
			telegramChatId: "faux-chat",
		};
		assert.equal(isDeliveryConfigured(cfg), false);
		const result = await deliverPendingAlerts(() => undefined, { cfg });
		assert.equal(result.skipped, true);
		assert.equal(result.attempted, 0);
		const row = await query<{ attempts: number; last_error: string | null }>(
			"SELECT attempts, last_error FROM alert WHERE id=$1", [alert],
		);
		assert.equal(row.rows[0]!.attempts, 0);
		assert.equal(row.rows[0]!.last_error, null);
	} finally {
		await cleanup(ids);
	}
});
