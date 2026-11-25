/**
 * Couverture du rapport de progression : un test par comportement observable.
 * Aucune base requise : les fixtures sont du Markdown, la mesure est pure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEPT_LABELS } from "../../src/collectors/relevance.js";
import {
	LIBELLES_INDICATEURS,
	OBJECTIF_CORPUS_PROGRESSION,
} from "../../src/analyse/rapport-corpus.js";
import { mesurerRapportProgression } from "../../src/analyse/mesure-corpus-progression.js";

const CODES_NA = Object.keys(DEPT_LABELS);
const COLONNES = Object.values(LIBELLES_INDICATEURS);

type Options = {
	date?: string;
	horsNA?: boolean;
	cellule?: (code: string, index: number) => string;
};

function rapportFixture(codes: readonly string[], options: Options = {}): string {
	const lignes = [
		`# Progression du corpus — ${options.date ?? "2026-11-21"}`,
		"",
		"## Par département",
		"",
		`| Département | ${COLONNES.join(" | ")} |`,
		`| --- |${COLONNES.map(() => " ---: |").join("")}`,
	];
	for (const code of codes) {
		const valeurs = COLONNES.map((_, index) =>
			options.cellule ? options.cellule(code, index) : `${index + 1} (0)`,
		);
		lignes.push(`| ${code} — département | ${valeurs.join(" | ")} |`);
	}
	if (options.horsNA) {
		lignes.push(`| Hors Nouvelle-Aquitaine | ${COLONNES.map(() => "9999 (0)").join(" | ")} |`);
	}
	lignes.push("", "## Définitions", "", "**Conclusion** : chiffres.", "");
	return lignes.join("\n");
}

test("le rapport publié couvre les douze départements de Nouvelle-Aquitaine", () => {
	const rapport = readFileSync(new URL("../../../../docs/corpus-progression.md", import.meta.url), "utf8");
	const mesure = mesurerRapportProgression(rapport, CODES_NA);
	assert.deepEqual(mesure.departementsNA, CODES_NA);
	assert.equal(mesure.date, "2026-11-21");
});

test("la ligne Hors Nouvelle-Aquitaine n'entre pas dans le décompte", () => {
	const mesure = mesurerRapportProgression(rapportFixture(CODES_NA, { horsNA: true }), CODES_NA);
	assert.equal(mesure.departementsNA.length, 12);
	assert.equal(mesure.cellules, OBJECTIF_CORPUS_PROGRESSION.cellules);
});

test("un département absent fait échouer la mesure", () => {
	const mesure = mesurerRapportProgression(rapportFixture(CODES_NA.slice(0, -1)), CODES_NA);
	assert.equal(mesure.departementsNA.length, 11);
	assert.equal(mesure.objectifAtteint, false);
});

test("les cinq indicateurs et les soixante cellules sont exigés", () => {
	const mesure = mesurerRapportProgression(rapportFixture(CODES_NA), CODES_NA);
	assert.equal(mesure.indicateurs.length, OBJECTIF_CORPUS_PROGRESSION.indicateurs);
	assert.equal(mesure.cellules, OBJECTIF_CORPUS_PROGRESSION.cellules);
	assert.equal(mesure.objectifAtteint, true);
});

test("une cellule vide n'est pas comptée comme un zéro", () => {
	const mesure = mesurerRapportProgression(
		rapportFixture(CODES_NA, { cellule: (code, index) => (code === "16" && index === 0 ? "" : "1 (0)") }),
		CODES_NA,
	);
	assert.equal(mesure.cellules, OBJECTIF_CORPUS_PROGRESSION.cellules - 1);
	assert.equal(mesure.objectifAtteint, false);
});

test("un écart signé reste une cellule renseignée", () => {
	const mesure = mesurerRapportProgression(
		rapportFixture(CODES_NA, {
			cellule: (code, index) =>
				code === "16" && index === 0 ? "54 (+7)"
				: code === "17" && index === 1 ? "34 (-3)"
				: "1 (0)",
		}),
		CODES_NA,
	);
	assert.equal(mesure.cellules, OBJECTIF_CORPUS_PROGRESSION.cellules);
	assert.equal(mesure.objectifAtteint, true);
});

test("la date du rapport est lue dans le titre", () => {
	const mesure = mesurerRapportProgression(
		rapportFixture(CODES_NA, { date: "2026-11-22" }),
		CODES_NA,
	);
	assert.equal(mesure.date, "2026-11-22");
});
