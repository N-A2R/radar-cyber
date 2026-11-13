/**
 * Anticipation : publier un taux, et dire quand il ne prouve rien.
 *
 * Le risque n'est pas de trouver peu d'anticipation — c'est de publier « 67 % »
 * sur trois faits et de laisser croire à une capacité qui n'existe pas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classerSignal, resumerAnticipation, SEUIL_INDICATIF } from "../src/analyse/anticipation.js";

test("la nature d'un signal suit ce qu'il prouve", () => {
	assert.equal(classerSignal({ assertionType: "technical_indicator" }), "indicateur");
	assert.equal(classerSignal({ assertionType: "third_party_claim" }), "revendication");
	assert.equal(classerSignal({ assertionType: "ambient_signal" }), "ambiance");
	assert.equal(classerSignal({ assertionType: "confirmed_incident" }), "ambiance");
	assert.equal(classerSignal({ assertionType: "technical_indicator", kind: "alerte" }), "alerte");
	assert.equal(classerSignal({ assertionType: null }), "ambiance");
});

test("un fait n'est compté qu'une fois par nature", () => {
	const r = resumerAnticipation([
		{
			signaux: [
				{ nature: "alerte", family: "vuln", sourceId: "a", avanceJours: 10, resume: "a" },
				{ nature: "alerte", family: "vuln", sourceId: "b", avanceJours: 8, resume: "b" },
				{ nature: "indicateur", family: "vuln", sourceId: "c", avanceJours: 5, resume: "c" },
			],
		},
	]);
	assert.equal(r.parNature.alerte, 1, "trois alertes ne font pas trois faits annoncés");
	assert.equal(r.parNature.indicateur, 1);
	assert.equal(r.avecSignal, 1);
	assert.equal(r.faits, 1);
});

test("la médiane d'avance se calcule sur les signaux, pas sur les faits", () => {
	const r = resumerAnticipation([
		{
			signaux: [
				{ nature: "indicateur", family: "vuln", sourceId: "a", avanceJours: 20, resume: "" },
				{ nature: "indicateur", family: "vuln", sourceId: "a", avanceJours: 2, resume: "" },
				{ nature: "ambiance", family: "vuln", sourceId: "a", avanceJours: 10, resume: "" },
			],
		},
		{ signaux: [] },
	]);
	assert.equal(r.avanceMedianeJours, 10);
	assert.equal(r.avecSignal, 1);
	assert.equal(r.faits, 2);
	assert.equal(r.partPct, 50);
});

test("aucun signal : la mesure le dit, sans division par zéro", () => {
	const r = resumerAnticipation([{ signaux: [] }, { signaux: [] }]);
	assert.equal(r.avecSignal, 0);
	assert.equal(r.avanceMedianeJours, null);
	assert.equal(r.partPct, 0);
});

test("un corpus vide n'est pas « 0 % d'anticipation », c'est une mesure vide", () => {
	const r = resumerAnticipation([]);
	assert.equal(r.faits, 0);
	assert.equal(r.partPct, 0);
	assert.equal(r.indicative, true);
});

test("sous le seuil, la mesure se déclare indicative", () => {
	const fait = {
		signaux: [{ nature: "indicateur" as const, family: "vuln", sourceId: "a", avanceJours: 3, resume: "" }],
	};
	const petits = Array.from({ length: SEUIL_INDICATIF - 1 }, () => fait);
	const assez = Array.from({ length: SEUIL_INDICATIF }, () => fait);
	assert.equal(resumerAnticipation(petits).indicative, true);
	assert.equal(resumerAnticipation(assez).indicative, false);
});
