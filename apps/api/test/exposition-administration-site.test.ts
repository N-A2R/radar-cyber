/**
 * National administration directory qualification: one behaviour per test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	administrationCandidate,
	type AdministrationRow,
} from "../src/exposition/administration-site.js";

const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

const row: AdministrationRow = {
	siren: "123456789",
	code_insee_commune: "33016",
	site_internet: '[{"libelle":"","valeur":"www.exemple.fr/accueil"}]',
};

test("keeps public identifiers and the declared website", () => {
	assert.deepEqual(administrationCandidate(row, DEPARTMENTS), {
		siren: "123456789",
		insee: "33016",
		website: "https://www.exemple.fr/accueil",
		domain: "exemple.fr",
		dept: "33",
	});
});

test("skips a third-party entry before the own website", () => {
	const site_internet = JSON.stringify([
		{ valeur: "https://facebook.com/groupe" },
		{ valeur: "https://exemple.fr" },
	]);
	assert.equal(administrationCandidate({ ...row, site_internet }, DEPARTMENTS)?.domain, "exemple.fr");
});

test("rejects an establishment outside Nouvelle-Aquitaine", () => {
	assert.equal(administrationCandidate({ ...row, code_insee_commune: "75056" }, DEPARTMENTS), null);
});

test("rejects an entry without a valid SIREN", () => {
	assert.equal(administrationCandidate({ ...row, siren: "SIREN" }, DEPARTMENTS), null);
});

test("rejects an entry without an INSEE commune code", () => {
	assert.equal(administrationCandidate({ ...row, code_insee_commune: null }, DEPARTMENTS), null);
});
