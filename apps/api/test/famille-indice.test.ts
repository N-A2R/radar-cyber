/**
 * Classifieur de familles d'indices : cas limites de normalisation.
 *
 * Aucune base nécessaire. Les cas sont des unités de classifieur (et non des
 * chiffres), y compris les indices réellement observés dans la file.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifierIndice, type FamilleIndice } from "../src/match/famille-indice.js";

const CAS: ReadonlyArray<readonly [string, FamilleIndice]> = [
	["connectwell.com", "domaine"],
	["dts.edu", "domaine"],
	["WWW.Exemple.FR.", "domaine"],
	["https://www.exemple.com:8443/contact", "domaine"],
	["eivp-paris.fr", "domaine"],
	["contact@pessac.fr", "domaine"],
	["www.exemple.com", "domaine"],
	["eni.it", "domaine"],
	["www.library.uta.edu", "domaine"],
	["https://www.library.uta.edu:8443/a", "domaine"],
	["prinsel.com.mx", "domaine"],
	["societe.dom", "nom"],
	["bastion.internal", "nom"],
	["societe.local", "nom"],
	["societe.test", "nom"],
	["societe.loc", "nom"],
	["societe.invalid", "nom"],
	["https://bastion.internal/admin", "nom"],
	["contact@societe.dom", "nom"],
	["MSN", "sigle"],
	["S.N.C.F", "sigle"],
	["DGSE", "sigle"],
	["A.B", "sigle"],
	["Dupont & Fils", "nom"],
	["Lyon-Waugh Auto Group", "nom"],
	["ORANGE", "nom"],
	["EHPAD", "nom"],
	["SNC", "nom"],
	["sncf", "nom"],
	["SNCF France", "nom"],
	["A", "nom"],
	["ABCDEFG", "nom"],
	["123", "nom"],
	["", "vide"],
	["   ", "vide"],
	["\t\n", "vide"],
];

for (const [indice, attendu] of CAS) {
	test(`${JSON.stringify(indice)} → ${attendu}`, () => {
		assert.equal(classifierIndice(indice), attendu);
	});
}
