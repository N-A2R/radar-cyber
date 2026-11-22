/**
 * Comparaison presse / radar : chaque comportement publié dans
 * docs/comparaison-presse.md a son propre test rejouable sans base ni réseau.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	comparerPresseRadar,
	selectionnerIncidentsPresse,
	type CorpusPresse,
} from "../src/analyse/comparaison-presse.js";

function corpusTemoin(): CorpusPresse {
	return JSON.parse(
		readFileSync(new URL("../../../bench/fixtures/corpus-reference-na.json", import.meta.url), "utf8"),
	) as CorpusPresse;
}

const SELECTION_ATTENDUE = [
	"na-2026-001", "na-2026-002", "na-2026-003", "na-2026-004", "na-2026-005",
	"na-2026-006", "na-2026-007", "na-2026-008", "na-2026-012", "na-2026-013",
];

test("la sélection garde les dix premiers articles de presse dans l'ordre du corpus", () => {
	assert.deepEqual(selectionnerIncidentsPresse(corpusTemoin()).map((incident) => incident.id), SELECTION_ATTENDUE);
});

test("un communiqué officiel ou un site de revendication n'est pas une preuve presse", () => {
	const corpus: CorpusPresse = { incidents: [
		{ id: "x-officiel", datePublique: "2026-01-01", preuve: { editeur: "Ville de Bègles (communiqué)", consulteLe: "2026-11-12" } },
		{ id: "x-revendication", datePublique: "2026-01-02", preuve: { editeur: "FrenchBreaches", consulteLe: "2026-11-12" } },
		{ id: "x-presse", datePublique: "2026-01-03", preuve: { editeur: "Sud Ouest", consulteLe: "2026-11-12" } },
	] };
	assert.deepEqual(selectionnerIncidentsPresse(corpus).map((incident) => incident.id), ["x-presse"]);
});

test("la presse est première sur dix incidents, le radar jamais", () => {
	const bilan = comparerPresseRadar(corpusTemoin());
	assert.equal(bilan.total, 10);
	assert.equal(bilan.pressePremier, 10);
	assert.equal(bilan.radarPremier, 0);
});

test("l'écart reproduit la médiane et les bornes du rapport", () => {
	assert.deepEqual(comparerPresseRadar(corpusTemoin()).ecartJours, {
		n: 10, mediane: 134, min: 30, max: 636,
	});
});

test("une trace radar antérieure à la publication fait échouer la vérification", () => {
	const corpus = corpusTemoin();
	corpus.incidents[0]!.preuve.consulteLe = "2026-04-01";
	const bilan = comparerPresseRadar(corpus);
	assert.equal(bilan.radarPremier, 1);
	assert.equal(bilan.objectifAtteint, false);
});

test("une date de publication invalide est exclue de la mesure", () => {
	const corpus: CorpusPresse = { incidents: [
		{ id: "x-invalide", datePublique: "12/01/2026", preuve: { editeur: "Sud Ouest", consulteLe: "2026-11-12" } },
	] };
	assert.equal(comparerPresseRadar(corpus).total, 0);
});
