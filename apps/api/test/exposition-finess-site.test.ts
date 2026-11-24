/**
 * Public FINESS website qualification: one behaviour per test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { finessSiteCandidate } from "../src/exposition/finess-site.js";

test("keeps a nine-digit FINESS and its declared own website", () => {
	assert.deepEqual(finessSiteCandidate("160000337", "https://www.ch-ruffec.fr/"), {
		id: "160000337",
		website: "https://www.ch-ruffec.fr",
		domain: "ch-ruffec.fr",
	});
});

test("rejects a public directory page about an establishment", () => {
	assert.equal(
		finessSiteCandidate("160002093", "https://www.pour-les-personnes-agees.gouv.fr/annuaire/ehpad/160002093"),
		null,
	);
});

test("rejects an identifier that is not nine digits", () => {
	assert.equal(finessSiteCandidate("16000033700027", "https://ch-ruffec.fr"), null);
});

test("rejects a website hosted by a third party", () => {
	assert.equal(finessSiteCandidate("160000337", "https://facebook.com/etablissement"), null);
});
