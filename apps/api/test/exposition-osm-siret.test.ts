/**
 * OSM SIREN/SIRET candidate qualification: one behaviour per test, no network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { osmSiretCandidate, type OsmSiretFeature } from "../src/exposition/osm-siret.js";

function feature(properties: OsmSiretFeature["properties"]): OsmSiretFeature {
	return { properties };
}

test("accepts a SIRET-derived SIREN and a contact website", () => {
	const candidate = osmSiretCandidate(feature({
		"@osmId": "node/1",
		"ref:FR:SIRET": "12345678900011",
		"contact:website": "https://www.exemple-na.fr/contact",
	}));
	assert.deepEqual(candidate, {
		osmId: "node/1",
		siren: "123456789",
		website: "https://www.exemple-na.fr/contact",
		domain: "exemple-na.fr",
	});
});

test("rejects a third-party profile as a service domain", () => {
	assert.equal(
		osmSiretCandidate(feature({
			"ref:FR:SIREN": "123456789",
			website: "https://www.facebook.com/exemple-na/",
		})),
		null,
	);
});

test("rejects a feature without a SIREN or SIRET reference", () => {
	assert.equal(
		osmSiretCandidate(feature({ website: "https://exemple-na.fr/" })),
		null,
	);
});
