/**
 * Seconde victime de campagne : critère brut, antériorité de la prédiction,
 * et exclusion des paires hors fenêtre ou sans IOC partagé.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	CRITERE_SECONDE_VICTIME,
	OBJECTIF_PAIRES,
	OBJECTIF_TAUX,
	lireCritereSecondesVictimes,
	lirePairesSecondesVictimes,
	lirePredictionsSecondesVictimes,
	rafraichirSecondesVictimes,
} from "../src/analyse/second-victim.js";
import { query } from "../src/db.js";

test("le benchmark atteint le critère de sortie exécuté tel quel", async () => {
	await rafraichirSecondesVictimes();
	const brut = await query<{ paires: string; predites_avant: string; pourcentage: string }>(
		CRITERE_SECONDE_VICTIME,
	);
	const lu = await lireCritereSecondesVictimes();
	assert.equal(lu.paires, Number(brut.rows[0]?.paires ?? 0));
	assert.equal(lu.predites_avant, Number(brut.rows[0]?.predites_avant ?? 0));
	assert.ok(
		lu.paires >= OBJECTIF_PAIRES,
		`${CRITERE_SECONDE_VICTIME} → ${lu.paires}/${OBJECTIF_PAIRES} paires`,
	);
	assert.ok(
		lu.predites_avant / lu.paires >= OBJECTIF_TAUX,
		`${lu.predites_avant}/${lu.paires} prédites avant l'événement, cible ${OBJECTIF_TAUX}`,
	);
	assert.equal(lu.paires, 32);
	assert.equal(lu.predites_avant, 24);
	assert.equal(lu.pourcentage, 75);

	const paires = await lirePairesSecondesVictimes();
	assert.equal(paires.length, 32);
	assert.ok(paires.every((p) => p.predicted_before === (p.prediction_key !== null)));
	assert.ok(paires.every((p) => p.lead_days === null || Number(p.lead_days) > 0));
	// Les huit échecs du benchmark sont explicites : aucune exposition connue.
	assert.equal(paires.filter((p) => !p.predicted_before).length, 8);
});

test("une exposition apprise après le premier événement ne prédit pas la seconde victime", async () => {
	const prefix = "sv-test-tardif";
	try {
		await query(
			`INSERT INTO second_victim_event
			   (event_key, campaign_key, org_key, family, at, ioc, origin)
			 VALUES ($1, $2, $3, 'benchmark-campagne', timestamptz '2026-04-01 00:00:00+00', ARRAY[$4], $5),
			        ($6, $2, $7, 'benchmark-campagne', timestamptz '2026-04-06 00:00:00+00', ARRAY[$4], $5)`,
			[
				`${prefix}-first`, `${prefix}-camp`, `${prefix}-org-a`,
				"ioc-sv-test-tardif.invalid", "test-second-victim@1",
				`${prefix}-second`, `${prefix}-org-b`,
			],
		);
		await query(
			`INSERT INTO second_victim_exposure (ioc, org_key, known_at, basis, origin)
			 VALUES ($1, $2, timestamptz '2026-04-02 00:00:00+00', 'test-pdns', $3)
			ON CONFLICT (ioc, org_key) DO NOTHING`,
			["ioc-sv-test-tardif.invalid", `${prefix}-org-b`, "test-second-victim@1"],
		);

		await rafraichirSecondesVictimes();
		const paires = await lirePairesSecondesVictimes();
		const paire = paires.find((p) => p.campaign_key === `${prefix}-camp`);
		assert.ok(paire, "la paire partageant l'IOC existe bien");
		assert.equal(paire!.predicted_before, false);
		assert.equal(paire!.prediction_key, null);

		const predictions = await lirePredictionsSecondesVictimes();
		assert.ok(!predictions.some((p) => p.ioc === "ioc-sv-test-tardif.invalid"));
	} finally {
		await query("DELETE FROM second_victim_event WHERE campaign_key = $1", [`${prefix}-camp`]);
		await query("DELETE FROM second_victim_exposure WHERE ioc = $1", ["ioc-sv-test-tardif.invalid"]);
		await rafraichirSecondesVictimes();
	}
});

test("les leurres hors fenêtre et sans IOC partagé ne forment pas de paire", async () => {
	await rafraichirSecondesVictimes();
	const paires = await lirePairesSecondesVictimes();
	const leurres = paires.filter((p) => /^sv-camp-(3[3-6])$/.test(p.campaign_key));
	assert.deepEqual(leurres, []);
	assert.ok(paires.every((p) => Number(p.gap_days) <= 30 && Number(p.gap_days) > 0));
	assert.ok(paires.every((p) => p.campaign_key.length > 0 && p.ioc.length > 0));
});
