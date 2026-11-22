/**
 * Public-registry identifier qualification: one behaviour per test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	registryIdentifierCandidate,
} from "../src/exposition/registry-identifier-site.js";

test("keeps a data.inclusion SIRET and its declared website", () => {
	assert.deepEqual(registryIdentifierCandidate("siret", "30247640300027", "https://www.exemple.fr/accueil"), {
		kind: "siret",
		id: "30247640300027",
		website: "https://www.exemple.fr/accueil",
		domain: "exemple.fr",
	});
});

test("keeps a nine-digit FINESS number from OpenStreetMap", () => {
	assert.equal(registryIdentifierCandidate("finess", "860000017", "exemple.fr")?.id, "860000017");
});

test("rejects a SIRET that is not fourteen digits", () => {
	assert.equal(registryIdentifierCandidate("siret", "302476403", "https://exemple.fr"), null);
});

test("rejects a FINESS number that is not nine digits", () => {
	assert.equal(registryIdentifierCandidate("finess", "exemple", "https://exemple.fr"), null);
});

test("rejects a website hosted by a third party", () => {
	assert.equal(registryIdentifierCandidate("siret", "30247640300027", "https://facebook.com/groupe"), null);
});
