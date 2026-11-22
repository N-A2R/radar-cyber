/**
 * Wikidata public-identifier qualification: one behaviour per test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	wikidataIdentifierCandidate,
} from "../src/exposition/wikidata-identifier-site.js";

test("joins a SIRET by its public SIREN prefix", () => {
	assert.deepEqual(wikidataIdentifierCandidate("siret", "30247640300027", "https://www.exemple.fr/accueil"), {
		kind: "siret",
		id: "302476403",
		website: "https://www.exemple.fr/accueil",
		domain: "exemple.fr",
	});
});

test("keeps a school UAI as its own public identifier", () => {
	assert.equal(wikidataIdentifierCandidate("uai", "0751721N", "exemple.fr")?.id, "0751721N");
});

test("rejects an identifier that is neither a SIRET nor a UAI", () => {
	assert.equal(wikidataIdentifierCandidate("uai", "30247640300027", "https://exemple.fr"), null);
});

test("rejects a website hosted by a third party", () => {
	assert.equal(wikidataIdentifierCandidate("siret", "30247640300027", "https://facebook.com/groupe"), null);
});
