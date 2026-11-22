/** TLS change monitoring: one test per observable behavior, no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	baselineFromInventory,
	detectCertificateChanges,
	falsePositiveRate,
	hostnameMatches,
	issuerOrganization,
	type BaselineCertificate,
	type CurrentCertificate,
} from "../src/tlsMonitor/detection.js";

const baseline: BaselineCertificate[] = [
	{
		host: "cdn.ville.fr",
		domain: "ville.fr",
		organization: "Ville",
		certificateId: "2",
		issuer: "O=Gandi, CN=Gandi CA",
		firstSeen: "2025-01-01T00:00:00Z",
	},
	{
		host: "www.ville.fr",
		domain: "ville.fr",
		organization: "Ville",
		certificateId: "1",
		issuer: "C=US, O=Let's Encrypt, CN=R3",
		firstSeen: "2025-01-01T00:00:00Z",
	},
];

const observation = (host: string, extra: Partial<CurrentCertificate> = {}): CurrentCertificate => ({
	host,
	observedAt: "2026-11-22T00:00:00Z",
	ok: true,
	issuerOrganization: "Let's Encrypt",
	subjectAltName: `DNS:${host}`,
	authorized: true,
	selfSigned: false,
	hostnameMatch: true,
	...extra,
});

test("issuer organization is extracted from a DN or a plain name and canonicalised", () => {
	assert.equal(issuerOrganization("C=US, O=Let's Encrypt, CN=R3"), "letsencrypt");
	assert.equal(issuerOrganization("Let's Encrypt"), "letsencrypt");
	assert.equal(issuerOrganization('O="Thawte, Inc.", CN=Thawte DV'), "thawte");
	assert.equal(issuerOrganization("GANDI SAS"), "gandi");
	assert.equal(issuerOrganization("CN=Only Common Name"), null);
	assert.equal(issuerOrganization(null), null);
});

test("hostname check prefers SAN, honours wildcards and falls back to CN", () => {
	assert.equal(hostnameMatches("WWW.Ville.FR.", "DNS:www.ville.fr", "other.fr"), true);
	assert.equal(hostnameMatches("www.ville.fr", "DNS:*.ville.fr", null), true);
	assert.equal(hostnameMatches("a.b.ville.fr", "DNS:*.ville.fr", null), false);
	assert.equal(hostnameMatches("www.ville.fr", "DNS:other.fr", "www.ville.fr"), false);
	assert.equal(hostnameMatches("www.ville.fr", null, "www.ville.fr"), true);
});

test("CT inventory rows are mapped, lowercased and sorted by host", () => {
	const rows = [
		{
			sous_domaine: "WWW.Ville.FR",
			domaine: "Ville.FR",
			organisation: "Ville",
			certificat_id: "1",
			emetteur: "O=Let's Encrypt",
			premiere_vue: "2025-01-01T00:00:00Z",
		},
		{
			sous_domaine: "",
			domaine: "ville.fr",
			organisation: "Ville",
			certificat_id: null,
			emetteur: null,
			premiere_vue: "2025-01-01T00:00:00Z",
		},
	];
	assert.deepEqual(baselineFromInventory(rows).map((row) => row.host), ["www.ville.fr"]);
	assert.equal(baselineFromInventory(rows)[0]?.domain, "ville.fr");
});

test("a renewal by the same CA does not alert", () => {
	const alerts = detectCertificateChanges(baseline, [observation("www.ville.fr", {
		fingerprint: "new-fingerprint",
		serialNumber: "new-serial",
		validFrom: "2026-10-01T00:00:00Z",
	})]);
	assert.deepEqual(alerts, []);
});

test("a CA already used elsewhere in the domain alerts only for issuer change", () => {
	const [alert] = detectCertificateChanges(baseline, [observation("www.ville.fr", {
		issuerOrganization: "Gandi SAS",
	})]);
	assert.equal(alert?.key, "www.ville.fr");
	assert.deepEqual(alert?.rules, ["issuer_change"]);
	assert.equal(alert?.severity, 3);
});

test("a CA never seen in the domain also alerts as a new authority", () => {
	const [alert] = detectCertificateChanges(baseline, [observation("www.ville.fr", {
		issuerOrganization: "GlobalSign nv-sa",
	})]);
	assert.deepEqual(alert?.rules, ["issuer_change", "new_ca_for_domain"]);
	assert.equal(alert?.severity, 4);
});

test("a SAN mismatch alerts even when the CA is unchanged", () => {
	const [alert] = detectCertificateChanges(baseline, [observation("www.ville.fr", {
		hostnameMatch: false,
		authorized: false,
		subjectAltName: "DNS:other.fr",
	})]);
	assert.deepEqual(alert?.rules, ["identity_mismatch"]);
});

test("an expired certificate alerts", () => {
	const [alert] = detectCertificateChanges(baseline, [observation("www.ville.fr", {
		validTo: "2026-01-01T00:00:00Z",
	})]);
	assert.deepEqual(alert?.rules, ["identity_mismatch"]);
});

test("a self-signed or untrusted chain alerts", () => {
	for (const extra of [{ selfSigned: true }, { authorized: false }]) {
		const [alert] = detectCertificateChanges(baseline, [observation("www.ville.fr", extra)]);
		assert.deepEqual(alert?.rules, ["identity_mismatch"]);
	}
});

test("failed probes and unknown hosts are not turned into alerts", () => {
	const alerts = detectCertificateChanges(baseline, [
		observation("www.ville.fr", { ok: false, error: "timeout", hostnameMatch: false }),
		observation("hors-domaine.fr", { issuerOrganization: "GlobalSign" }),
	]);
	assert.deepEqual(alerts, []);
});

test("one alert per host combines rules and sorts by severity then host", () => {
	const alerts = detectCertificateChanges(baseline, [
		observation("www.ville.fr", { issuerOrganization: "GlobalSign", hostnameMatch: false }),
		observation("cdn.ville.fr", { issuerOrganization: "Let's Encrypt" }),
	]);
	assert.deepEqual(alerts.map((alert) => alert.key), ["www.ville.fr", "cdn.ville.fr"]);
	assert.deepEqual(alerts[0]?.rules, ["issuer_change", "new_ca_for_domain", "identity_mismatch"]);
});

test("false positive rate ignores unclassified alerts and never divides by zero", () => {
	assert.equal(falsePositiveRate([]), null);
	assert.equal(falsePositiveRate(["unclassified", "unclassified"]), null);
	assert.equal(falsePositiveRate(["true", "false", "false", "unclassified"]), 66.7);
});
