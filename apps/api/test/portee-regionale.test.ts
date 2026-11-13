import { test } from "node:test";
import assert from "node:assert/strict";
import { porteeRegionale, verifierTerritorial } from "../src/match/territorial.js";

/**
 * Le fil affichait 18 981 événements dont 87 % de bulletins de vulnérabilités,
 * et **un seul** citait un département de la région. La notion de « régional »
 * valait `org_id IS NOT NULL`, donc faux partout.
 */

test("un rattachement est une preuve, pas un indice", () => {
	const v = porteeRegionale("CVE-2026-114713 — UnrealIRCd", 42);
	assert.equal(v.regional, true);
	assert.equal(v.motif, "rattachement");
});

test("un département nommé suffit à classer régional", () => {
	const v = porteeRegionale("« La moitié des sirènes ne fonctionnent pas » : en Gironde et Charente-Maritime", null);
	assert.equal(v.regional, true);
	assert.equal(v.motif, "departement");
});

test("un CVE n'est pas un fait régional", () => {
	for (const titre of [
		"CVE-2026-96107: Null pointer dereference in Windows Phone",
		"CVE-2026-110680: APIPark through 1.2.0",
		"CVE-2026-99288: In the Linux kernel, the following vulnerability",
	]) {
		const v = porteeRegionale(titre, null);
		assert.equal(v.regional, false, titre);
		assert.equal(v.motif, "aucun");
	}
});

test("un département dans une URL ne compte pas", () => {
	// Le texte d'un article peut citer une URL ; l'heuristique ne doit pas
	// se laisser piéger par un lien qui contient un nom de département.
	assert.equal(verifierTerritorial("voir https://exemple.fr/gironde/article").regional, false);
});

test("les formes composées restent reconnues", () => {
	assert.equal(verifierTerritorial("incident à Lot-et-Garonne").regional, true);
	assert.equal(verifierTerritorial("incident en Pyrénées-Atlantiques").regional, true);
});
