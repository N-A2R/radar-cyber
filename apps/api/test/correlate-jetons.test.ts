import { test } from "node:test";
import assert from "node:assert/strict";
import { significantTokens, buildOrgIndex, resolveOrg } from "../src/collectors/correlate.js";

/**
 * Le cas réel : 1 781 événements KEV rattachés à 39 organisations, dont 589
 * CVE Microsoft/Adobe/Apple rattachés à « CODE 202 (CODE 202) ».
 *
 * Deux fautes se combinaient : la répétition du nom entre parenthèses donnait
 * deux fois le même jeton — ce qui satisfaisait le garde-fou « au moins deux
 * jetons » alors qu'un seul mot composait le nom — et « code » apparaît dans
 * presque tous les CVE.
 */

test("la répétition d'un nom ne fabrique pas un second jeton", () => {
	assert.deepEqual(significantTokens("code 202 code 202"), []);
	// La déduplication laisse un seul jeton : le garde-fou « au moins deux
	// jetons distincts » fait alors son travail.
	assert.deepEqual(significantTokens("tarnos tarnos"), ["tarnos"]);
});

test("les termes techniques ne désignent personne", () => {
	// « network » est exclu, « sas » est un suffixe juridique, « gsi » est trop
	// court : il ne reste rien, et c'est le résultat attendu.
	assert.deepEqual(significantTokens("gsi network sas"), []);
	assert.deepEqual(significantTokens("at hom s software"), []);
	assert.deepEqual(significantTokens("code 202"), []);
});

test("un vrai nom garde ses jetons distinctifs", () => {
	assert.deepEqual(significantTokens("safran helicopter engines"), ["safran", "helicopter", "engines"]);
});

test("un nom réduit à un seul mot ne peut pas fonder un rattachement", () => {
	const index = buildOrgIndex(
		[
			{ id: 1, name: "CODE 202 (CODE 202)", slug: "code-202", domain: null, city: null, lat: null, lon: null },
			{ id: 2, name: "GSI NETWORK SAS", slug: "gsi", domain: null, city: null, lat: null, lon: null },
		],
		[],
	);
	const cve = {
		id: "1",
		title: "CVE-2026-114713 — UnrealIRCd Improper Neutralization of Delimiters Vulnerability",
		summary: "contains a code execution vulnerability that allows any user on a network",
		source_url: "https://nvd.nist.gov/vuln/detail/CVE-2026-114713",
	};
	assert.equal(resolveOrg(cve, index), null);
});
