/** One test per behavior of the regional-language source eligibility rules. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	checkRegionalSourceEligibility,
	containsPersonalData,
	countEligibleRegionalSources,
	isNouvelleAquitaineDepartment,
	isRegionalLanguage,
	normaliseLanguageCode,
	NOUVELLE_AQUITAINE_DEPARTMENTS,
	type RegionalSourceRecord,
} from "../src/regionalLanguages/index.js";

const VALID: RegionalSourceRecord = {
	id: "regional:eu:test-source",
	name: "Test source",
	url: "https://example.org/feed.xml",
	language: "eu",
	department: "64",
};

function record(overrides: Partial<RegionalSourceRecord> = {}): RegionalSourceRecord {
	return { ...VALID, ...overrides };
}

test("Occitan codes and names normalise to oc", () => {
	assert.equal(normaliseLanguageCode("oc"), "oc");
	assert.equal(normaliseLanguageCode("Occitan"), "oc");
	assert.equal(normaliseLanguageCode("  occitan d'Aquitaine "), "oc");
});

test("Basque codes and names normalise to eu", () => {
	assert.equal(normaliseLanguageCode("eu"), "eu");
	assert.equal(normaliseLanguageCode("basque"), "eu");
	assert.equal(normaliseLanguageCode("Euskara"), "eu");
	assert.equal(normaliseLanguageCode("euskera"), "eu");
});

test("languages outside Occitan and Basque are rejected", () => {
	for (const value of ["fr", "en", "es", "ca", "", undefined, null, 42]) {
		assert.equal(isRegionalLanguage(value), false, `value: ${String(value)}`);
	}
});

test("all twelve Nouvelle-Aquitaine departments are accepted", () => {
	assert.equal(Object.keys(NOUVELLE_AQUITAINE_DEPARTMENTS).length, 12);
	for (const code of Object.keys(NOUVELLE_AQUITAINE_DEPARTMENTS)) {
		assert.equal(isNouvelleAquitaineDepartment(code), true, `code: ${code}`);
	}
});

test("departments outside Nouvelle-Aquitaine are rejected", () => {
	for (const value of ["75", "31", "13", "4", "", "640", undefined, null]) {
		assert.equal(isNouvelleAquitaineDepartment(value), false, `value: ${String(value)}`);
	}
});

test("a numeric department code is accepted when zero-padded", () => {
	assert.equal(isNouvelleAquitaineDepartment(40), true);
	assert.equal(isNouvelleAquitaineDepartment(64), true);
	assert.equal(isNouvelleAquitaineDepartment(75), false);
});

test("a complete regional source is eligible", () => {
	assert.deepEqual(checkRegionalSourceEligibility(record()), {
		eligible: true,
		reason: "ok",
	});
});

test("a non-regional language makes the source ineligible", () => {
	assert.deepEqual(checkRegionalSourceEligibility(record({ language: "fr" })), {
		eligible: false,
		reason: "language-out-of-scope",
	});
});

test("a department outside Nouvelle-Aquitaine makes the source ineligible", () => {
	assert.deepEqual(checkRegionalSourceEligibility(record({ department: "75" })), {
		eligible: false,
		reason: "department-outside-na",
	});
});

test("a non-HTTPS or malformed URL makes the source ineligible", () => {
	for (const url of ["http://example.org/feed.xml", "not-a-url", "https://example"]) {
		assert.deepEqual(checkRegionalSourceEligibility(record({ url })), {
			eligible: false,
			reason: "invalid-url",
		});
	}
});

test("a source without id or name is ineligible", () => {
	assert.equal(checkRegionalSourceEligibility(record({ id: "  " })).reason, "missing-identity");
	assert.equal(checkRegionalSourceEligibility(record({ name: "" })).reason, "missing-identity");
});

test("personal data in source metadata is detected and rejected", () => {
	assert.equal(containsPersonalData("contact@example.org"), true);
	assert.equal(containsPersonalData("06 12 34 56 78"), true);
	assert.equal(containsPersonalData("Pays basque actualités"), false);
	assert.equal(
		checkRegionalSourceEligibility(record({ name: "Contact :007@example.org" })).reason,
		"personal-data",
	);
});

test("eligible sources are counted once per id", () => {
	const records = [
		record({ id: "a" }),
		record({ id: "a" }),
		record({ id: "b", language: "oc", department: "40" }),
		record({ id: "c", department: "75" }),
		record({ id: "d", language: "en" }),
	];
	assert.equal(countEligibleRegionalSources(records), 2);
});
