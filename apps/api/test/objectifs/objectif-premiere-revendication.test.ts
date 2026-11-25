import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	OBJECTIF_PREMIERE_REVENDICATION,
	ligneObjectifPremiereRevendication,
	verifierDeclarationObjectif,
	verifierObjectifPremiereRevendication,
} from "../../src/analyse/objectif-premiere-revendication.js";

/** Un comportement par test : la déclaration doit suivre la mesure publiée. */

const mesure = JSON.parse(
	readFileSync(new URL("../../../../bench/results/premiere-revendication.json", import.meta.url), "utf8"),
) as { objective: { measuredHours: number; achieved: boolean } };

const rapport = readFileSync(
	new URL("../../../../docs/rapport-premiere-revendication.md", import.meta.url),
	"utf8",
);

test("the published p50 under one hour is declared reached", () => {
	const objectif = verifierObjectifPremiereRevendication({
		measuredHours: mesure.objective.measuredHours,
	});
	assert.equal(objectif.value, 0.43);
	assert.equal(objectif.target, OBJECTIF_PREMIERE_REVENDICATION.targetHours);
	assert.equal(objectif.reached, true);
	assert.equal(mesure.objective.achieved, true);
	assert.equal(
		objectif.line,
		"OBJECTIF : atteint — 0,43 / 1 h (p50 de première revendication en collecte directe)",
	);
});

test("a median at the one-hour boundary stays partial", () => {
	const objectif = verifierObjectifPremiereRevendication({ measuredHours: 1 });
	assert.equal(objectif.reached, false);
	assert.match(objectif.line, /^OBJECTIF : partiel — 1 \/ 1 h/);
});

test("an unusable measurement is never declared reached", () => {
	const objectif = verifierObjectifPremiereRevendication({ measuredHours: Number.NaN });
	assert.equal(objectif.reached, false);
});

test("the published report carries the exact objective line", () => {
	const ligne = ligneObjectifPremiereRevendication(mesure.objective.measuredHours);
	assert.equal(verifierDeclarationObjectif(rapport, ligne), true);
});

test("a stale or approximate declaration is rejected", () => {
	const ligne = ligneObjectifPremiereRevendication(0.43);
	assert.equal(verifierDeclarationObjectif("OBJECTIF : atteint — 19,07 / 1 h", ligne), false);
	assert.equal(verifierDeclarationObjectif("Objectif : atteint — 0,43 / 1 h", ligne), false);
	assert.equal(verifierDeclarationObjectif(`${ligne} (historique)`, ligne), false);
});
