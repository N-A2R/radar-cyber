/** One behaviour per test: what counts as a cyber public contract in NA. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCyberObject, isNaDepartments } from "../src/procurement/cyber-contracts.js";

test("cyber object detection ignores accents and apostrophes", () => {
	assert.equal(isCyberObject("Audit de la cybersécurité des réseaux Radio et SCADA"), true);
	assert.equal(isCyberObject("MAINTENANCE D'UNE SOLUTION ANTIVIRUS MUTUALISÉE"), true);
	assert.equal(isCyberObject("Matériels concourant à la Sécurité des Systèmes d'Information"), true);
});

test("fire-safety SSI object is not a cyber market", () => {
	assert.equal(isCyberObject("Maintenance des systèmes de sécurité incendie (SSI)"), false);
	assert.equal(isCyberObject("Mise aux normes du Système de Sécurité Incendie"), false);
});

test("generic information-system object is not a cyber market", () => {
	assert.equal(isCyberObject("Infogérance du système d'information de la Ville"), false);
});

test("regional filter accepts a notice executed in one NA department", () => {
	assert.equal(isNaDepartments(["86"]), true);
	assert.equal(isNaDepartments(["16", "33"]), true);
});

test("regional filter rejects another region and cross-region notices", () => {
	assert.equal(isNaDepartments(["65"]), false);
	assert.equal(isNaDepartments(["13", "31", "33", "69"]), false);
	assert.equal(isNaDepartments([]), false);
});
