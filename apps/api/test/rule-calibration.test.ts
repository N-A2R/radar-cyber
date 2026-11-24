/**
 * Calibration des seuils de règles : mathématiques de la courbe PR, contenu
 * de la table livrée, et effet réel du seuil dans le moteur de détection.
 */
import { readFileSync } from "node:fs";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";
import { evaluateEvent, loadRuleThresholds, loadRules } from "../src/detect/engine.js";
import { DAY_MS, HOUR_MS, SILENT_SOURCE_RULE, detectSilentSource } from "../src/detect/silent-source.js";
import {
	chooseThreshold,
	mesurerObjectifCalibration,
	noObservationPoint,
	precisionRecallCurve,
	calibratedScore,
	verifierDeclarationObjectifCalibration,
} from "../src/detect/calibration.js";

const TAG = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function objectifPublie() {
	const artefact = JSON.parse(
		readFileSync(new URL("../../../bench/results/rule-calibration-30d.json", import.meta.url), "utf8"),
	) as {
		holdout: { alerts: number };
		rules: Parameters<typeof mesurerObjectifCalibration>[0];
	};
	return mesurerObjectifCalibration(artefact.rules, artefact.holdout.alerts);
}

test("la courbe PR choisit le seuil le plus élevé qui qualifie la règle", () => {
	const observations = [
		{ score: 90, positive: true },
		{ score: 80, positive: true },
		{ score: 70, positive: true },
		{ score: 60, positive: false },
		{ score: 50, positive: false },
	];
	const curve = precisionRecallCurve(observations, [50, 60, 70, 80, 90]);
	const picked = chooseThreshold(curve);
	assert.ok(picked);
	// À 80 : 2 vrais positifs, 0 faux → précision 1, rappel 2/3.
	// À 90 : rappel 1/3 < 0,60 ; à 70 : rappel 1 mais 1 faux positif.
	assert.equal(picked.threshold, 80);
	assert.equal(picked.precision, 1);
	assert.equal(Math.round(picked.recall * 100), 67);
	assert.equal(picked.alerts, 2);
	const impossible = chooseThreshold(curve, 1.01, 0.99);
	assert.equal(impossible, null);
});

test("l'ancrage NA est tracé dans le score global sans créer de seuil", () => {
	assert.equal(calibratedScore(69, false), 69);
	assert.equal(calibratedScore(69, true), 99);
	assert.deepEqual(noObservationPoint(), {
		threshold: 65, precision: 1, recall: 1, alerts: 0, tp: 0, fp: 0, fn: 0,
	});
});

test("la table livrée qualifie 8 règles et réduit les 1457 alertes", async () => {
	const r = await query<{
		qualifying: string;
		total: string;
		alerts: string;
		min_recall: string;
	}>(`
		SELECT count(*) FILTER (WHERE precision >= 0.85 AND recall >= 0.6)::text AS qualifying,
		       count(*)::text AS total,
		       coalesce(sum(alerts), 0)::text AS alerts,
		       min(recall)::text AS min_recall
		  FROM rule_calibration
	`);
	const row = r.rows[0]!;
	assert.equal(row.qualifying, "8");
	assert.equal(row.total, "8");
	assert.ok(Number(row.alerts) < 1457, `somme des alertes = ${row.alerts}`);
	assert.ok(Number(row.min_recall) >= 0.6);

	const ids = await query<{ rule_id: string }>("SELECT rule_id FROM rule_calibration ORDER BY rule_id");
	assert.deepEqual(ids.rows.map((x) => x.rule_id), [
		"avis-cert-fr",
		"certificat-observé",
		"fuite-donnees",
		"incident-confirme",
		"operateur-critique-vise",
		"presse-cyber",
		"ransomware-revendication",
		"supervision:silent-source-24h",
	]);
});

test("la règle de supervision applique son seuil calibré en heures", async () => {
	const r = await query<{ threshold: string }>(
		"SELECT threshold FROM rule_calibration WHERE rule_id = $1",
		[SILENT_SOURCE_RULE],
	);
	assert.equal(Number(r.rows[0]?.threshold), 14);

	const now = Date.parse("2026-11-22T12:00:00Z");
	const productionTimes = [now - 13 * HOUR_MS, now - 2 * DAY_MS, now - 3 * DAY_MS, now - 4 * DAY_MS];
	const signal = { sourceId: "calibration-threshold", productionTimes };
	// 13 h de silence : sous le seuil mesuré (14 h), donc aucune alerte.
	assert.equal(detectSilentSource(signal, now, 14), null);
	assert.equal(detectSilentSource(signal, now, 13)?.silenceHours, 13);
});

test("le moteur applique le seuil calibré de la règle", async () => {
	const ruleId = `test-cal-${TAG}`;
	const orgName = `Org calibration ${TAG}`;
	try {
		await query(
			`INSERT INTO rule_calibration
			  (rule_id, threshold, precision, recall, alerts, positives, negatives, window_days, source)
			 VALUES ($1, 100, 1, 1, 0, 0, 0, 30, 'test')`,
			[ruleId],
		);
		await query(
			`INSERT INTO detection_rule (id, name, description, severity, enabled, match, action)
			 VALUES ($1, $2, NULL, 3, true, $3, 'alert')`,
			[ruleId, ruleId, JSON.stringify({ family: "testcalibration" })],
		);
		await loadRules(true);
		const org = await query<{ id: number }>(
			"INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'collectivite','33') RETURNING id",
			[orgName, `${TAG}-org`],
		);
		const orgId = org.rows[0]!.id;
		const source = await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1");
		const insertEvent = async (title: string): Promise<number> => {
			const r = await query<{ id: number }>(
				`INSERT INTO event (dedup_key, family, assertion_type, title, severity, confidence, source_id, org_id, evidence, source_url)
				 VALUES ($1,'testcalibration','ambient_signal',$2,3,'A1',$3,$4,'{}'::jsonb || '{"run_id":"1"}'::jsonb,'https://example.invalid/event') RETURNING id`,
				[`${TAG}-${title}`, title, source.rows[0]!.id, orgId],
			);
			return r.rows[0]!.id;
		};
		const belowId = await insertEvent("below");
		await loadRuleThresholds(true);
		// Note brute 67, trace globale 97 avec l'ancrage : la porte globale
		// passe sur la note brute, le seuil de règle 100 refuse encore.
		assert.equal(await evaluateEvent(belowId), 0, "67 < 100 au seuil de règle");
		await query("UPDATE rule_calibration SET threshold = 65 WHERE rule_id = $1", [ruleId]);
		await loadRuleThresholds(true);
		assert.equal(await evaluateEvent(belowId), 1, "67 >= 65 au seuil de règle");
	} finally {
		await query("DELETE FROM alert WHERE rule_id = $1", [ruleId]);
		await query("DELETE FROM rule_calibration WHERE rule_id = $1", [ruleId]);
		await query("DELETE FROM detection_rule WHERE id = $1", [ruleId]);
		await supprimerEvenementsArchivees("dedup_key LIKE $1", [`${TAG}-%`]);
		await query("DELETE FROM org WHERE slug = $1", [`${TAG}-org`]);
		await loadRuleThresholds(true);
		await loadRules(true);
	}
});

test("l'objectif se mesure depuis l'artefact 30 jours", () => {
	const objectif = objectifPublie();
	assert.equal(objectif.alertes, 1242);
	assert.equal(objectif.qualifiantes, 8);
	assert.equal(objectif.perte, 166);
	assert.equal(objectif.partPerte <= 0.4, true);
	assert.equal(objectif.atteint, true);
	assert.match(objectif.ligne, /^OBJECTIF : atteint — .+ \/ .+$/);
});

test("le rapport déclare une seule fois la ligne OBJECTIF mesurée", () => {
	const rapport = readFileSync(new URL("../../../docs/calibration-regles.md", import.meta.url), "utf8");
	const ligne = objectifPublie().ligne;
	assert.equal(verifierDeclarationObjectifCalibration(rapport, ligne), true);
	assert.equal(verifierDeclarationObjectifCalibration(rapport, "OBJECTIF : atteint — 1 / 1"), false);
});
test("la porte globale reste sur la note non majorée malgré l'ancrage NA", async () => {
	const ruleId = `test-gate-${TAG}`;
	const slug = `${TAG}-gate-org`;
	try {
		await query(
			`INSERT INTO detection_rule (id, name, description, severity, enabled, match, action)
			 VALUES ($1, $2, NULL, 3, true, $3, 'alert')`,
			[ruleId, ruleId, JSON.stringify({ family: "testcalgate" })],
		);
		await loadRules(true);
		const org = await query<{ id: number }>(
			"INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'collectivite','33') RETURNING id",
			[`Org porte ${TAG}`, slug],
		);
		const source = await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1");
		const event = await query<{ id: number }>(
			`INSERT INTO event (dedup_key, family, assertion_type, title, severity, confidence, source_id, org_id, evidence, source_url)
			 VALUES ($1,'testcalgate','ambient_signal',$2,3,'C3',$3,$4,'{}'::jsonb || '{"run_id":"1"}'::jsonb,'https://example.invalid/event') RETURNING id`,
			[`${TAG}-gate`, "Signal faible ancré", source.rows[0]!.id, org.rows[0]!.id],
		);
		const eventId = event.rows[0]!.id;
		// Note brute 44, trace globale 74 avec l'ancrage : la majoration ne doit
		// pas faire passer la porte de revue (REVIEW_THRESHOLD = 65).
		assert.equal(await evaluateEvent(eventId), 0);
		const alerts = await query("SELECT 1 FROM alert WHERE event_id = $1", [eventId]);
		assert.equal(alerts.rowCount, 0);
	} finally {
		await query("DELETE FROM alert WHERE event_id IN (SELECT id FROM event WHERE dedup_key LIKE $1)", [`${TAG}-gate%`]);
		await supprimerEvenementsArchivees("dedup_key LIKE $1", [`${TAG}-gate%`]);
		await query("DELETE FROM org WHERE slug = $1", [slug]);
		await query("DELETE FROM detection_rule WHERE id = $1", [ruleId]);
		await loadRules(true);
	}
});
after(async () => {
	await closePools();
});
