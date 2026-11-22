/**
 * Education directory qualification: one behaviour per test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { educationCandidate, type EducationRow } from "../src/exposition/education-site.js";

const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

const row: EducationRow = {
	Identifiant_de_l_etablissement: "0331234X",
	SIREN_SIRET: "12345678900012",
	Code_departement: "033",
	Web: "www.exemple.fr/accueil",
};

test("keeps the public UAI, SIREN and declared website", () => {
	assert.deepEqual(educationCandidate(row, DEPARTMENTS), {
		uai: "0331234X",
		siren: "123456789",
		website: "https://www.exemple.fr/accueil",
		domain: "exemple.fr",
		dept: "33",
	});
});

test("rejects an establishment outside Nouvelle-Aquitaine", () => {
	assert.equal(educationCandidate({ ...row, Code_departement: "075" }, DEPARTMENTS), null);
});

test("rejects a third-party social website", () => {
	assert.equal(educationCandidate({ ...row, Web: "https://facebook.com/ecole" }, DEPARTMENTS), null);
});

test("rejects a row without a valid UAI", () => {
	assert.equal(educationCandidate({ ...row, Identifiant_de_l_etablissement: "" }, DEPARTMENTS), null);
});
