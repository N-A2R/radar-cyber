/**
 * Détecteur de séries : distribution calibrée, explication portée par l'alerte,
 * garde-fous sur l'histoire courte et les écarts dérisoires, rejeu borné.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	detecterAnomaliesSeries,
	FENETRE_REFERENCE_JOURS,
	OBSERVATIONS_MIN,
	type AxeAnomalie,
	type PointSerie,
} from "../src/analyse/anomalies-series.js";

const JOUR_MS = 86_400_000;
const DEBUT = Date.parse("2026-09-01T12:00:00Z");

function jour(i: number): string {
	return new Date(DEBUT + i * JOUR_MS).toISOString();
}

function serie(
	valeurs: readonly number[],
	axe: AxeAnomalie = "source",
	groupe = "flux-a",
): PointSerie[] {
	return valeurs.flatMap((valeur, i) => {
		if (valeur === 0) return [];
		return [{
			axe,
			groupe,
			date: jour(i),
			valeur,
			faits: [`${groupe}-${i}`],
		}];
	});
}

test("série stable : aucune alerte, diagnostics complets", () => {
	const r = detecterAnomaliesSeries(serie(Array.from({ length: 40 }, (_, i) => (i % 3 === 0 ? 1 : 2))));
	assert.deepEqual(r.alertes, []);
	const s = r.diagnostics.find((d) => d.axe === "source");
	assert.equal(s?.groupes, 1);
	assert.equal(s?.groupesEligibles, 1);
	assert.equal(s?.maxJoursObserves, 40);
	assert.equal(s?.points, 40);
});

test("pic franc : l'alerte porte valeur, distribution, écart, z et fait", () => {
	const valeurs = Array.from({ length: 40 }, () => 2);
	valeurs[39] = 12;
	const r = detecterAnomaliesSeries(serie(valeurs));
	assert.equal(r.alertes.length, 1);
	const a = r.alertes[0];
	assert.equal(a?.valeur, 12);
	assert.equal(a?.date, jour(39).slice(0, 10));
	assert.equal(a?.distribution.mediane, 2);
	assert.equal(a?.distribution.jours, FENETRE_REFERENCE_JOURS);
	assert.equal(a?.ecart, 10);
	assert.ok((a?.z ?? 0) > 3);
	assert.ok(a?.fdr.rejette);
	assert.ok(a.fdr.p <= a.fdr.seuil);
	assert.deepEqual(a?.faits, ["flux-a-39"]);
	assert.match(a?.explication ?? "", /12 faits/);
	assert.match(a?.explication ?? "", /médiane 2/);
	assert.match(a?.explication ?? "", /écart \+10/);
});

test("histoire trop courte : pas de distribution inventée", () => {
	const court = detecterAnomaliesSeries(
		serie([...Array.from({ length: OBSERVATIONS_MIN - 1 }, () => 2), 20]),
	);
	assert.deepEqual(court.alertes, []);
	const debutTard = detecterAnomaliesSeries(
		serie([...Array.from({ length: OBSERVATIONS_MIN }, () => 2), 20]),
	);
	assert.deepEqual(debutTard.alertes, [], "10 jours actifs ne font pas une fenêtre de 28 j");
});

test("source rendormie : un rattrapage après 30 j de silence n'est pas une anomalie", () => {
	const valeurs = Array.from({ length: 50 }, () => 0);
	for (let i = 0; i < OBSERVATIONS_MIN; i++) valeurs[i] = 2;
	valeurs[49] = 40;
	const r = detecterAnomaliesSeries(serie(valeurs));
	assert.deepEqual(r.alertes, []);
	assert.equal(r.diagnostics.find((d) => d.axe === "source")?.groupesEligibles, 0);
});

test("écart sous le plancher : pas d'alerte même avec un z élevé", () => {
	const valeurs = Array.from({ length: 40 }, () => 1);
	valeurs[39] = 11;
	const libre = detecterAnomaliesSeries(serie(valeurs), { ecartMin: 1 });
	assert.equal(libre.alertes.length, 1, "sans plancher, le z suffit");
	const r = detecterAnomaliesSeries(serie(valeurs), { ecartMin: 20 });
	assert.deepEqual(r.alertes, []);
});

test("un valeur extrême dans la fenêtre ne gonfle pas la médiane", () => {
	const valeurs = Array.from({ length: 40 }, () => 2);
	valeurs[30] = 50;
	valeurs[39] = 12;
	const r = detecterAnomaliesSeries(serie(valeurs));
	const dernier = r.alertes.find((a) => a.date === jour(39).slice(0, 10));
	assert.ok(dernier, "le pic final reste détecté");
	assert.equal(dernier.distribution.mediane, 2);
	assert.equal(dernier.distribution.max, 50);
	assert.ok(dernier.z > 3);
	assert.ok(dernier.fdr.rejette);
});

test("maintenant borne le rejeu : le futur n'entre ni dans la fenêtre ni dans les alertes", () => {
	const valeurs = Array.from({ length: 40 }, () => 2);
	valeurs[35] = 15;
	valeurs[39] = 200;
	const r = detecterAnomaliesSeries(serie(valeurs), { maintenant: Date.parse(jour(37)) });
	assert.deepEqual(r.alertes.map((a) => a.date), [jour(35).slice(0, 10)]);
});

test("points du même jour agrégés, baisses ignorées", () => {
	const stables = serie(Array.from({ length: 40 }, () => 2));
	const r = detecterAnomaliesSeries([...stables, {
		axe: "source",
		groupe: "flux-a",
		date: jour(39),
		valeur: 10,
		faits: ["extra-39"],
	}]);
	assert.equal(r.alertes.length, 1);
	assert.equal(r.alertes[0]?.valeur, 12);
	assert.deepEqual(r.alertes[0]?.faits, ["flux-a-39", "extra-39"]);
	const baisse = detecterAnomaliesSeries(serie([...Array.from({ length: 39 }, () => 2), 0]));
	assert.deepEqual(baisse.alertes, []);
});

test("les trois axes suivent la même règle", () => {
	const valeurs = Array.from({ length: 40 }, () => 2);
	valeurs[39] = 20;
	const r = detecterAnomaliesSeries([
		...serie(valeurs, "organisation", "org-1"),
		...serie(valeurs, "secteur", "sante"),
		...serie(valeurs, "source", "flux-a"),
	]);
	assert.deepEqual(r.alertes.map((a) => a.axe), ["organisation", "secteur", "source"]);
	assert.equal(r.diagnostics.length, 3);
	const parRang = [...r.alertes].sort((a, b) => a.fdr.rang - b.fdr.rang);
	for (let i = 1; i < parRang.length; i++) {
		assert.ok(parRang[i]!.fdr.seuil < parRang[i - 1]!.fdr.seuil, "le seuil se resserre à chaque test");
	}
});

test("le FDR remplace le seuil fixe : un z > 3 tardif ne suffit plus", () => {
	const valeurs = Array.from({ length: 40 }, () => 2);
	valeurs[39] = 10; // z ≈ 3,1 : l'ancien seuil z ≥ 3 alertait
	const r = detecterAnomaliesSeries(serie(valeurs));
	assert.deepEqual(r.alertes, [], "après 12 tests, le seuil FDR est plus strict que z ≥ 3");
});

test("options invalides refusées avant tout calcul", () => {
	const base = serie(Array.from({ length: 40 }, () => 2));
	assert.throws(() => detecterAnomaliesSeries(base, { fenetreJours: 6 }), RangeError);
	assert.throws(() => detecterAnomaliesSeries(base, { observationsMin: 1 }), RangeError);
	assert.throws(() => detecterAnomaliesSeries(base, { fdrCible: 0 }), RangeError);
	assert.throws(() => detecterAnomaliesSeries(base, { fdrCible: 1 }), RangeError);
	assert.throws(() => detecterAnomaliesSeries(base, { ecartMin: -1 }), RangeError);
	assert.throws(() => detecterAnomaliesSeries(base, { maintenant: Number.NaN }), RangeError);
});
