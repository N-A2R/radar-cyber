/**
 * Public-registry website qualification: one behaviour per test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	publicSiteCandidate,
	publicWebsite,
	sirenFromIdentifier,
} from "../src/exposition/public-site.js";

const NA = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

test("completes a protocol-relative declared website", () => {
	assert.deepEqual(publicWebsite("//www.amadea.org"), {
		website: "https://www.amadea.org",
		domain: "amadea.org",
	});
});

test("rejects a third-party social host", () => {
	assert.equal(publicWebsite("https://www.facebook.com/association"), null);
});

test("derives the same SIREN from a SIRET and from a SIREN", () => {
	assert.equal(sirenFromIdentifier("78121327700028"), "781213277");
	assert.equal(sirenFromIdentifier("781213277"), "781213277");
});

test("rejects an identifier that is neither SIREN nor SIRET", () => {
	assert.equal(sirenFromIdentifier("78A1213277"), null);
});

test("requires a Nouvelle-Aquitaine postal code", () => {
	assert.equal(publicSiteCandidate("78121327700028", "https://association.fr", "75001", NA), null);
});
