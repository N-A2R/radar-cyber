/**
 * Agent source muette : quatre sources synthétiques, une seule alerte.
 *
 * Les trois autres servent de garde-fous : une cadence quotidienne encore
 * active, une source trop irrégulière pour qu'on parle de cadence, et une
 * source sans historique. Une alerte sur l'une d'elles serait un faux positif.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	detecterSourcesMuettes,
	SEUIL_SILENCE_JOURS,
} from "../src/analyse/agent-source-muette.js";

const NOW = Date.parse("2026-11-21T12:00:00Z");
const JOUR = 86_400_000;

function joursAvant(...jours: number[]): { date: string }[] {
	return jours.map((j) => ({ date: new Date(NOW - j * JOUR).toISOString() }));
}

test("quatre sources synthétiques : seule la source quotidienne silencieuse alerte", () => {
	const alertes = detecterSourcesMuettes(
		[
			// Cadence quotidienne intacte jusqu'à 4 jours, puis silence : alerte.
			{ id: "quotidienne-muette", evenements: joursAvant(4, 5, 6, 7, 8, 9, 10) },
			// Même cadence, dernier événement il y a 2 jours : pas encore muette.
			{ id: "quotidienne-active", evenements: joursAvant(2, 3, 4, 5, 6, 7, 8, 9, 10, 11) },
			// Un événement par semaine : elle n'a jamais eu de cadence quotidienne.
			{ id: "hebdomadaire", evenements: joursAvant(12, 19, 26) },
			// Jamais rendu : pas d'historique, donc pas de comparaison possible.
			{ id: "sans-historique", evenements: [] },
		],
		NOW,
	);

	assert.equal(alertes.length, 1, "une seule source doit déclencher une alerte");
	assert.equal(alertes[0]?.sourceId, "quotidienne-muette");
	assert.equal(alertes[0]?.agent, "source-muette");
	assert.equal(alertes[0]?.silenceJours, SEUIL_SILENCE_JOURS + 1);
	assert.equal(alertes[0]?.evenementsCadence, 7);
	assert.deepEqual(
		alertes.map((a) => a.sourceId),
		["quotidienne-muette"],
	);
});