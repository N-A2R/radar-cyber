/**
 * Mesure : l'échantillon doit être reproductible et le taux ne doit jamais
 * compter comme faux une alerte sans vérité terrain.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	echantillonner,
	tauxFausses,
	type VerdictManuel,
} from "../../../scripts/mesure-anomalies-series.mjs";

test("échantillon déterministe, réparti sur toute la liste", () => {
	const elements = Array.from({ length: 20 }, (_, i) => i);
	assert.deepEqual(echantillonner([1, 2, 3], 5), [1, 2, 3]);
	const tire = echantillonner(elements, 4);
	assert.deepEqual(tire, [0, 5, 10, 15]);
	assert.deepEqual(echantillonner(elements, 4), tire);
});

test("taux sur les classés seulement, jamais 0/0", () => {
	const verdicts: VerdictManuel[] = [
		{ classement: "fausse", raison: "import différé" },
		{ classement: "vraie", raison: "rafale réelle" },
		{ classement: "non_classable", raison: "sans preuve" },
	];
	assert.equal(tauxFausses(verdicts), 50);
	assert.equal(tauxFausses(verdicts.slice(2)), null);
	assert.equal(tauxFausses([]), null);
});
