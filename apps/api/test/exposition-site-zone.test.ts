/**
 * Same-registrable-domain qualification: one behaviour per test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hostFromUrl, isSameSiteHost } from "../src/exposition/site-zone.js";

test("keeps the exact observed host of a final URL", () => {
	assert.equal(hostFromUrl("https://jehan.lyc-duperier.fr/accueil?x=1"), "jehan.lyc-duperier.fr");
});

test("accepts a named subdomain of the declared registrable domain", () => {
	assert.equal(isSameSiteHost("jehan.lyc-duperier.fr", "lyc-duperier.fr"), true);
});

test("accepts the declared host itself", () => {
	assert.equal(isSameSiteHost("rions.fr", "rions.fr"), true);
});

test("rejects a different registrable domain", () => {
	assert.equal(isSameSiteHost("autre-exemple.fr", "exemple.fr"), false);
});

test("rejects a third-party social host", () => {
	assert.equal(isSameSiteHost("facebook.com", "facebook.com"), false);
});
