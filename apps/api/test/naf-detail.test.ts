import { test } from "node:test";
import assert from "node:assert/strict";
import {
	NAF_REV2_CODES,
	classifyDetailedNaf,
	formatNafCode,
	measureNafCoverage,
	normalizeNafCode,
} from "../src/analyse/naf-detail.js";

test("the nomenclature contains all 732 official APE codes", () => {
	assert.equal(NAF_REV2_CODES.size, 732);
	for (const code of ["0111Z", "5610A", "6201Z", "8411Z", "9900Z"]) {
		assert.ok(NAF_REV2_CODES.has(code), code);
	}
});

test("an exact five-character code is classified with its own source", () => {
	assert.deepEqual(classifyDetailedNaf({ naf: "6201Z" }), {
		code: "62.01Z",
		source: "naf_exact",
		confidence: 0.99,
	});
});

test("punctuation, spaces and lowercase do not change the code", () => {
	for (const raw of ["62.01Z", "6201z", " 62.01Z ", "62-01-Z"]) {
		assert.equal(normalizeNafCode(raw), "6201Z");
		assert.equal(classifyDetailedNaf({ naf: raw })?.code, "62.01Z");
	}
	assert.equal(formatNafCode("6201Z"), "62.01Z");
});

test("an unknown five-character code is not classified", () => {
	assert.equal(normalizeNafCode("99.99Z"), null);
	assert.equal(classifyDetailedNaf({ naf: "99.99Z" }), null);
});

test("a four-digit class with one APE child resolves to that child", () => {
	// 01.11 has a single child in the official nomenclature: 0111Z.
	assert.deepEqual(classifyDetailedNaf({ naf: "01.11" }), {
		code: "01.11Z",
		source: "naf_unique_subclass",
		confidence: 0.9,
	});
});

test("a four-digit class with several APE children stays unclassified", () => {
	// 62.01 carries 6201Z only; 47.11 carries six children (A to F).
	assert.equal(classifyDetailedNaf({ naf: "47.11" }), null);
});

test("a four-digit class absent from the nomenclature stays unclassified", () => {
	assert.equal(classifyDetailedNaf({ naf: "00.97" }), null);
});

test("a legacy three-digit code is never converted by guessing", () => {
	for (const raw of ["55.3A", "74.1J", "01.1"]) {
		assert.equal(normalizeNafCode(raw), null);
		assert.equal(classifyDetailedNaf({ naf: raw, sector: "commerce" }), null);
	}
});

test("an unambiguous sector supplies a reference code when NAF is missing", () => {
	assert.deepEqual(classifyDetailedNaf({ sector: "commune" }), {
		code: "84.11Z",
		source: "sector_reference",
		confidence: 0.8,
	});
	assert.deepEqual(classifyDetailedNaf({ sector: "hopital", naf: null }), {
		code: "86.10Z",
		source: "sector_reference",
		confidence: 0.8,
	});
	assert.deepEqual(classifyDetailedNaf({ sector: "pharmacie" }), {
		code: "47.73Z",
		source: "sector_reference",
		confidence: 0.8,
	});
});

test("an ambiguous sector supplies no code", () => {
	// "ecole" spans pre-primary, primary and secondary levels.
	assert.equal(classifyDetailedNaf({ sector: "ecole" }), null);
	assert.equal(classifyDetailedNaf({}), null);
});

test("coverage is a ratio with an explicit empty-denominator behaviour", () => {
	assert.deepEqual(measureNafCoverage(750, 1000), { total: 1000, classified: 750, rate: 0.75 });
	assert.deepEqual(measureNafCoverage(0, 0), { total: 0, classified: 0, rate: 0 });
});
