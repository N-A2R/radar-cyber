/**
 * DILA local-directory candidate qualification: one behaviour per test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { dilaCandidate } from "../src/exposition/dila-local.js";

const NA = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

test("accepts a declared website on a SIRET in Nouvelle-Aquitaine", () => {
	assert.deepEqual(dilaCandidate({
		siret: "21160003600019",
		site_internet: [{ valeur: "https://www.agris.fr/" }],
		adresse: [{ code_postal: "16000" }],
	}, NA), {
		siren: "211600036",
		website: "https://www.agris.fr/",
		domain: "agris.fr",
		dept: "16",
	});
});

test("rejects an address outside Nouvelle-Aquitaine", () => {
	assert.equal(dilaCandidate({
		siret: "21160003600019",
		site_internet: [{ valeur: "https://www.agris.fr/" }],
		adresse: [{ code_postal: "75001" }],
	}, NA), null);
});
