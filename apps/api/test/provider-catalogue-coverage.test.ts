/**
 * Coverage of the public provider catalogue used by the SPOF measurement.
 *
 * One test per behavior: DNS suffixes attributed to IONOS, newly catalogued
 * mail suffixes attributed to their operator, and unlisted hosts left unknown.
 * The catalogue comes from the migrations applied to the test database; no
 * organization name, domain or victim record is read.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MX_CATEGORIES, NS_CATEGORIES, providerFor } from "../src/dns/historique.js";
import { chargerCatalogue } from "../src/dns/store.js";

const catalogue = await chargerCatalogue();

test("attributes observed IONOS DNS suffixes", () => {
	for (const suffix of ["ui-dns.biz", "ui-dns.com", "ui-dns.de", "ui-dns.org"]) {
		const provider = providerFor(`ns1124.${suffix}`, catalogue, NS_CATEGORIES);
		assert.equal(provider?.name, "IONOS", suffix);
		assert.equal(provider?.category, "dns", suffix);
	}
});

test("attributes observed mail suffixes to their operator", () => {
	for (const [host, name] of [
		["mx-mibc-fr-10.mailinblack.com", "MailinBlack"],
		["001e1201.pphosted.com", "Proofpoint"],
		["eu-smtp-inbound-1.mimecast.com", "Mimecast"],
		["route1.mx.cloudflare.net", "Cloudflare"],
	] as const) {
		assert.equal(providerFor(host, catalogue, MX_CATEGORIES)?.name, name, host);
	}
});

test("keeps hosts outside the catalogue unknown", () => {
	assert.equal(providerFor("ns1.unlisted.example", catalogue, NS_CATEGORIES), null);
	assert.equal(providerFor("mx.unlisted.example", catalogue, MX_CATEGORIES), null);
});
