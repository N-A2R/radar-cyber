/**
 * Précurseur de campagne : déterminisme du détecteur, non-régression du
 * dénominateur du critère et requête SQL brute sur la base de test.
 *
 * Aucune donnée de production n'est lue ici : la série et les campagnes sont
 * synthétiques, et les lignes SQL créées sont retirées dans `after`.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closePools, query, withTransaction } from "../src/db.js";
import {
	buildCampaignPrecursorReport,
	detectClaimRateSignals,
	MIN_LEAD_DAYS,
	MODEL,
	evaluatePrecursors,
	summarisePrecursors,
	type ClaimDay,
} from "../src/detection/campaign-precursor.js";
import { persistCampaignPrecursor } from "../src/detection/campaign-precursor-store.js";

const TAG = `precurseur-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const MODEL_TEST = `${MODEL}-${TAG}`;
const SOURCE_TEST = `${TAG}-source`;

function day(iso: string, claims: number, sources = 12): ClaimDay {
	return { day: iso, claims, sources };
}

function baselineSeries(): ClaimDay[] {
	const days: ClaimDay[] = [];
	for (let index = 0; index < 28; index += 1) {
		const date = new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10);
		days.push(day(date, 50));
	}
	return days;
}

test("un pic au-dessus de deux écarts-types émet un signal avec délai réfractaire", () => {
	const days = baselineSeries();
	days.push(day("2026-09-29", 140));
	days.push(day("2026-09-30", 140)); // même épisode : refractaire de 14 jours
	days.push(day("2026-10-20", 50));
	const signals = detectClaimRateSignals(days);
	assert.deepEqual(
		signals.map((signal) => signal.startedAt),
		["2026-09-29"],
	);
	assert.equal(signals[0]?.claims, 140);
	assert.equal(signals[0]?.sources, 12);
});

test("un volume faible ou trop peu de sites ne déclenche pas de signal", () => {
	const days = baselineSeries();
	days.push(day("2026-09-29", 39, 12));
	days.push(day("2026-09-30", 140, 7));
	const signals = detectClaimRateSignals(days);
	assert.equal(signals.length, 0);
});

test("l'avance est entière, plafonnée à la fenêtre, et une campagne non détectée reste au dénominateur", () => {
	const days = [...baselineSeries(), day("2026-09-29", 140)];
	const signals = detectClaimRateSignals(days);
	const rows = evaluatePrecursors(
		[
			{ campaignKey: "a", label: "a", firstAlertAt: "2026-10-19T12:00:00.000Z" },
			{ campaignKey: "b", label: "b", firstAlertAt: "2026-11-30T12:00:00.000Z" },
		],
		signals,
		days,
	);
	assert.equal(rows[0]?.leadDays, 20);
	assert.equal(rows[0]?.precursorAt, "2026-09-29T00:00:00.000Z");
	assert.equal(rows[1]?.leadDays, null);
	assert.equal(rows[1]?.precursorAt, null);
	const metric = summarisePrecursors(signals, rows);
	assert.equal(metric.evaluatedCampaigns, 2);
	assert.equal(metric.earlyCampaigns, 1);
	assert.equal(metric.detectionRate, 0.5);
	assert.equal(metric.falsePositives, 0);
});

test("le pipeline écarte les signaux hors de la fenêtre d'évaluation", () => {
	const days = [
		...Array.from({ length: 28 }, (_, index) =>
			day(new Date(Date.UTC(2026, 7, 1 + index)).toISOString().slice(0, 10), 50)),
		day("2026-08-29", 140), // hors de la fenêtre : l'alerte est le 3 novembre
		...Array.from({ length: 60 }, (_, index) =>
			day(new Date(Date.UTC(2026, 8, 1 + index)).toISOString().slice(0, 10), 50)),
	];
	const report = buildCampaignPrecursorReport(days, [
		{ campaignKey: "a", label: "a", firstAlertAt: "2026-11-03T12:00:00.000Z" },
	]);
	assert.equal(report.signals.length, 0);
	assert.equal(report.evaluations[0]?.leadDays, null);
});

test("la mesure en base porte le critère SQL et au plus 2 faux précurseurs par mois", async () => {
	const days = [...baselineSeries(), day("2026-09-29", 140)];
	const signals = detectClaimRateSignals(days);
	const evaluations = evaluatePrecursors(
		[
			{ campaignKey: `${TAG}-1`, label: "un", firstAlertAt: "2026-10-19T12:00:00.000Z" },
			{ campaignKey: `${TAG}-2`, label: "deux", firstAlertAt: "2026-10-20T12:00:00.000Z" },
		],
		signals,
		days,
	);
	const report = {
		signals,
		evaluations,
		metric: summarisePrecursors(signals, evaluations),
	};
	await withTransaction((client) =>
		persistCampaignPrecursor(client, { ...report, model: MODEL_TEST, source: SOURCE_TEST }),
	);

	const { rows } = await query<{ ratio: number }>(
		"SELECT count(*) FILTER (WHERE lead_days >= 14)::float/count(*) AS ratio FROM campaign_precursor_eval",
	);
	assert.equal(Number(rows[0]?.ratio), 1);
	assert.equal(report.metric.detectionRate, 1);
	assert.ok(report.metric.falsePositivesPerMonth <= 2, "trop de faux précurseurs par mois");
	assert.equal(MIN_LEAD_DAYS, 14);
});

test("la persistance est idempotente pour un même modèle", async () => {
	const days = [...baselineSeries(), day("2026-09-29", 140)];
	const signals = detectClaimRateSignals(days);
	const evaluations = evaluatePrecursors(
		[{ campaignKey: `${TAG}-1`, label: "un", firstAlertAt: "2026-10-19T12:00:00.000Z" }],
		signals,
		days,
	);
	const report = { signals, evaluations, metric: summarisePrecursors(signals, evaluations) };
	for (let pass = 0; pass < 2; pass += 1) {
		await withTransaction((client) =>
			persistCampaignPrecursor(client, { ...report, model: MODEL_TEST, source: SOURCE_TEST }),
		);
	}
	const { rows } = await query<{ n: string }>(
		"SELECT count(*)::text AS n FROM campaign_precursor_eval WHERE model = $1",
		[MODEL_TEST],
	);
	assert.equal(Number(rows[0]?.n), 1);
});

after(async () => {
	await query("DELETE FROM campaign_precursor_eval WHERE model = $1", [MODEL_TEST]);
	await query("DELETE FROM campaign_precursor_signal WHERE model = $1", [MODEL_TEST]);
	await query("DELETE FROM campaign_precursor_metric WHERE model = $1", [MODEL_TEST]);
	await closePools();
});
