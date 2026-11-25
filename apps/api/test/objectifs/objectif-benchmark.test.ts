/**
 * Objectif déclaré du benchmark : un comportement par test.
 *
 * Aucune date n'est inventée, le rapport doit porter la ligne exacte et le
 * générateur doit la faire survivre aux régénérations.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { BilanBenchmark } from "../../src/analyse/benchmark-premier-regard.js";
import {
	OBJECTIF_BENCHMARK,
	compterIncidentsDates,
	ligneObjectif,
	verifierDeclarationObjectif,
	verifierObjectifBenchmark,
} from "../../src/analyse/objectif-benchmark.js";
import { genererTableauIncidents } from "../../src/analyse/rapport-benchmark.js";

const incidents = (total: number, dates: object = { radar: "2026-11-21" }) =>
	Array.from({ length: total }, (_, index) => ({ id: `na-${index}`, dates }));

test("seules les dates calendaires valides comptent comme incidents datés", () => {
	const valeur = compterIncidentsDates([
		{ dates: { radar: "2026-11-21" } },
		{ dates: { radar: "2026-02-31", presseLocale: "2026-11-20" } },
		{ dates: { radar: null, presseLocale: "21/11/2026" } },
		{ dates: { radar: undefined } },
	]);
	assert.equal(valeur, 2);
});

test("la mesure publiée déclare l'objectif atteint à 100 incidents datés", () => {
	const objectif = verifierObjectifBenchmark({ incidents: incidents(OBJECTIF_BENCHMARK.incidents) });
	assert.equal(objectif.value, 100);
	assert.equal(objectif.target, 100);
	assert.equal(objectif.reached, true);
	assert.equal(objectif.line, "OBJECTIF : atteint — 100 / 100 incidents de Nouvelle-Aquitaine datés");
});

test("un incident sans date rend l'objectif partiel", () => {
	const objectif = verifierObjectifBenchmark({
		incidents: [...incidents(99), { dates: { radar: "—" } }],
	});
	assert.equal(objectif.reached, false);
	assert.equal(objectif.line, "OBJECTIF : partiel — 99 / 100 incidents de Nouvelle-Aquitaine datés");
});

test("la déclaration publiée doit être la ligne attendue, pas une autre", () => {
	const ligne = ligneObjectif(100);
	assert.equal(verifierDeclarationObjectif(`intro\n${ligne}\n| ID |`, ligne), true);
	assert.equal(verifierDeclarationObjectif("intro\n| ID |", ligne), false);
	assert.equal(verifierDeclarationObjectif("OBJECTIF : atteint — 99 / 100", ligne), false);
});

test("le générateur émet la ligne OBJECTIF dans le tableau nominatif", () => {
	const bilan = {
		total: 1,
		lignes: [{
			id: "na-1",
			entite: "Commune de Nouvelle-Aquitaine",
			codeDepartement: "33",
			dates: { radar: "2026-11-21" },
			premier: ["radar"],
			dernier: ["radar"],
			datePremierMedia: null,
			delaiHeures: null,
		}],
	} as unknown as BilanBenchmark;
	const tableau = genererTableauIncidents(bilan, "2026-11-21");
	assert.match(tableau, /^OBJECTIF : partiel — 1 \/ 100 incidents de Nouvelle-Aquitaine datés$/m);
});
