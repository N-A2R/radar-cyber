/**
 * Objectif du rapport court : un comportement par test, sans base ni réseau.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculerBenchmark } from "../../src/analyse/benchmark-premier-regard.js";
import type { JeuOutils } from "../../src/analyse/benchmark-outils.js";
import {
	genererRapport,
	LIMITE_MOTS_RAPPORT,
	mesurerObjectifRapport,
	verifierDeclarationObjectifRapport,
	type IncidentDate,
} from "../../src/analyse/rapport-benchmark.js";

const LIGNE_ATTEINTE = "OBJECTIF : atteint — 100 / 100 incidents de Nouvelle-Aquitaine datés";

function incidentsDatés(nombre: number): IncidentDate[] {
	return Array.from({ length: nombre }, () => ({ dates: { radar: "2026-11-12" } }));
}

test("une date radar impossible, absente ou nulle n'est pas comptée comme datée", () => {
	const objectif = mesurerObjectifRapport([
		{ dates: { radar: "2026-11-12" } },
		{ dates: { radar: "2026-13-45" } },
		{ dates: {} },
		{ dates: { radar: null } },
	]);
	assert.equal(objectif.valeur, 1);
});

test("la mesure publiée porte 100 incidents datés sur 100", () => {
	const mesure = JSON.parse(
		readFileSync(new URL("../../../../bench/results/benchmark-premier-regard.json", import.meta.url), "utf8"),
	) as { incidents: IncidentDate[] };
	const objectif = mesurerObjectifRapport(mesure.incidents);
	assert.equal(objectif.cible, 100);
	assert.equal(objectif.valeur, 100);
	assert.equal(objectif.atteint, true);
	assert.equal(objectif.ligne, LIGNE_ATTEINTE);
});

test("un incident non daté rend l'objectif partiel et chiffre le reste", () => {
	const objectif = mesurerObjectifRapport(incidentsDatés(99));
	assert.equal(objectif.atteint, false);
	assert.equal(
		objectif.ligne,
		"OBJECTIF : partiel — 99 / 100 incidents de Nouvelle-Aquitaine datés, manque 1",
	);
});

test("la déclaration exacte et unique est reconnue", () => {
	assert.equal(
		verifierDeclarationObjectifRapport(`# Titre\n\n${LIGNE_ATTEINTE}\n\nDétail.\n`, LIGNE_ATTEINTE),
		true,
	);
});

test("une déclaration absente, périmée ou dupliquée est refusée", () => {
	assert.equal(verifierDeclarationObjectifRapport("# Titre\n", LIGNE_ATTEINTE), false);
	assert.equal(
		verifierDeclarationObjectifRapport(
			`${LIGNE_ATTEINTE}\n${LIGNE_ATTEINTE}\n`,
			LIGNE_ATTEINTE,
		),
		false,
	);
	assert.equal(
		verifierDeclarationObjectifRapport(
			"OBJECTIF : atteint — 99 / 100 incidents de Nouvelle-Aquitaine datés\n",
			LIGNE_ATTEINTE,
		),
		false,
	);
});

test("le générateur émet la ligne OBJECTIF dans le rapport court sous 150 mots", () => {
	const jeu = JSON.parse(
		readFileSync(new URL("../../../../bench/results/benchmark-outils.json", import.meta.url), "utf8"),
	) as JeuOutils;
	const bilan = calculerBenchmark([
		{ id: "a", entite: "A", codeDepartement: "33", dates: { radar: "2026-11-12" } },
	]);
	const rapport = genererRapport(bilan, jeu);
	assert.match(
		rapport.markdown,
		/^OBJECTIF : partiel — 1 \/ 100 incidents de Nouvelle-Aquitaine datés, manque 99$/m,
	);
	assert.ok(rapport.mots < LIMITE_MOTS_RAPPORT, `${rapport.mots} mots`);
});

test("le rapport publié porte la déclaration de la mesure publiée", () => {
	const mesure = JSON.parse(
		readFileSync(new URL("../../../../bench/results/benchmark-premier-regard.json", import.meta.url), "utf8"),
	) as { incidents: IncidentDate[] };
	const rapport = readFileSync(new URL("../../../../docs/benchmark.md", import.meta.url), "utf8");
	assert.equal(
		verifierDeclarationObjectifRapport(rapport, mesurerObjectifRapport(mesure.incidents).ligne),
		true,
	);
});
