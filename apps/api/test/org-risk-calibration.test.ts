/**
 * Calibration du score d'organisation : métriques pures, sans base ni réseau.
 *
 * Un test vérifie le calcul brut sur un jeu minuscule dont le résultat est
 * écrit à la main ; un autre rejoue la forme de la cohorte publiée (120
 * organisations, 10 strates de 12) pour garder le seuil sous contrôle.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	CALIBRATION_TARGETS,
	assignRiskBins,
	calibrationFailures,
	evaluateRiskCalibration,
	organisationRiskScore,
	type RiskObservation,
} from "../src/analyse/org-risk-calibration.js";

const TINY: RiskObservation[] = [
	{ id: 1, score: 100, label: 1 },
	{ id: 2, score: 90, label: 0 },
	{ id: 3, score: 10, label: 0 },
	{ id: 4, score: 5, label: 0 },
];

test("le score public est une somme bornée d'indicateurs numériques", () => {
	assert.equal(
		organisationRiskScore({
			hasPublicDomain: 1,
			isServices: 1,
			isCommerce: 1,
			isConstruction: 0,
			isSante: 0,
			isIndustrie: 0,
		}),
		10,
	);
	assert.equal(
		organisationRiskScore({
			hasPublicDomain: 0,
			isServices: 0,
			isCommerce: 0,
			isConstruction: 0,
			isSante: 0,
			isIndustrie: 0,
		}),
		0,
	);
});

test("les strates sont à effectif égal et départagées par identifiant", () => {
	const sample: RiskObservation[] = [
		{ id: 9, score: 2, label: 0 },
		{ id: 3, score: 8, label: 1 },
		{ id: 7, score: 8, label: 0 },
		{ id: 1, score: 9, label: 0 },
	];
	const assignment = assignRiskBins(sample, 2);
	assert.deepEqual([...assignment.entries()].sort((a, b) => a[0] - b[0]), [[1, 0], [3, 0], [7, 1], [9, 1]]);
});

test("Brier et ECE sont calculés à la main sur des prédictions hors étiquette", () => {
	const result = evaluateRiskCalibration(TINY, { binCount: 2, priorWeight: 1 });
	const byId = new Map(result.predictions.map((prediction) => [prediction.id, prediction.probability]));
	// bin haut : 1 incident / 2, a priori 0,25, poids 1.
	assert.ok(Math.abs(byId.get(1)! - 0.125) < 1e-12, "un incident ne s'attribue pas sa propre étiquette");
	assert.ok(Math.abs(byId.get(2)! - 0.625) < 1e-12);
	assert.ok(Math.abs(byId.get(3)! - 0.125) < 1e-12);
	assert.ok(Math.abs(result.bins[0]!.probability - (1.25 / 3)) < 1e-12);
	assert.ok(Math.abs(result.brier - 0.296875) < 1e-12, `Brier ${result.brier}`);
	assert.ok(Math.abs(result.ece - 0.125) < 1e-12, `ECE ${result.ece}`);
	assert.equal(result.minBinCount, 2);
});

test("la cible chiffrée est atteinte sur 120 organisations en 10 strates", () => {
	const hits = [2, 0, 0, 1, 0, 0, 0, 1, 1, 0];
	const sample: RiskObservation[] = hits.flatMap((count, bin) =>
		Array.from({ length: 12 }, (_, position) => ({
			id: bin * 12 + position + 1,
			score: 100 - bin * 5,
			label: (position < count ? 1 : 0) as 0 | 1,
		})),
	);
	const result = evaluateRiskCalibration(sample);
	assert.equal(result.sampleCount, CALIBRATION_TARGETS.sampleCount);
	assert.equal(result.binCount, CALIBRATION_TARGETS.binCount);
	assert.equal(result.minBinCount, 12);
	assert.ok(result.brier <= CALIBRATION_TARGETS.brier, `Brier ${result.brier}`);
	assert.ok(result.ece <= CALIBRATION_TARGETS.ece, `ECE ${result.ece}`);
	assert.deepEqual(calibrationFailures(result), []);
	assert.equal(result.bins.reduce((total, bin) => total + bin.count, 0), 120);
	assert.ok(
		result.bins.every((bin) => Math.abs(bin.eceContribution - (12 / 120) * Math.abs(bin.looMean - bin.observed)) < 1e-12),
	);
});

test("un effectif tombant sous 12 est signalé comme échec", () => {
	const result = evaluateRiskCalibration(TINY, { binCount: 2, priorWeight: 1 });
	const failures = calibrationFailures(result);
	assert.ok(failures.some((failure) => failure.includes("!= 120")));
	assert.ok(failures.some((failure) => failure.includes("!= 10")));
	assert.ok(failures.some((failure) => failure.includes("effectif minimal")));
});
