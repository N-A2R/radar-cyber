/** Les vues Map de l'index compact doivent rester interchangeables avec l'ancien stockage. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGazetteer, normaliser, type GazetteerRow } from "../src/match/gazetteer.js";

function ligne(org_id: number, alias: string, name: string): GazetteerRow {
	return {
		org_id,
		name,
		kind: "entreprise",
		dept: "40",
		city: "Tarnos",
		sector: "commerce",
		alias,
		source: "annuaire-entreprises",
	};
}

test("l'index compact garde les vues Map publiques et déduplique les ids", () => {
	const gaz = buildGazetteer([
		ligne(1, "Ville de Tarnos", "Ville de Tarnos"),
		ligne(1, "Ville de Tarnos", "Ville de Tarnos"),
		ligne(2, "Tarnos Distribution", "Tarnos Distribution"),
	]);

	assert.equal(gaz.byAliasKey.size, 2);
	assert.deepEqual(gaz.byAliasKey.get("ville de tarnos")?.map((o) => o.id), [1]);
	assert.deepEqual([...gaz.byAliasKey.keys()], ["tarnos distribution", "ville de tarnos"]);
	assert.equal(gaz.byAliasKey.get("cle absente"), undefined);
	assert.deepEqual(gaz.aliasKeysByFirstToken.get("ville"), ["ville de tarnos"]);
	assert.equal(gaz.aliasKeysByFirstToken.has("absente"), false);
	assert.deepEqual([...gaz.orgsByToken.get("tarnos") ?? []].sort(), [1, 2]);
	assert.deepEqual([...gaz.curatedOrgsByAliasKey.get("ville de tarnos") ?? []], [1]);
	assert.equal(gaz.orgsById.size, 2);
	assert.equal(gaz.orgsById.get(1)?.city, "Tarnos");
});

test("l'ordre d'insertion des ids est conservé à clé égale", () => {
	const gaz = buildGazetteer([
		ligne(3, "Etablissement Test", "Trois"),
		ligne(1, "Etablissement Test", "Un"),
		ligne(3, "Etablissement Test", "Trois"),
	]);
	assert.deepEqual(gaz.byAliasKey.get("etablissement test")?.map((o) => o.id), [3, 1]);
});

test("la normalisation rapide garde les jetons de la référence Unicode", () => {
	const reference = (texte: string): string[] => {
		const propre = texte
			.replace(/œ/g, "oe")
			.replace(/Œ/g, "OE")
			.replace(/æ/g, "ae")
			.replace(/Æ/g, "AE")
			.normalize("NFD")
			.replace(/\p{Diacritic}/gu, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, " ")
			.trim();
		return propre === "" ? [] : propre.split(" ");
	};
	for (const texte of [
		"Œuvre d'Édon", "Commune de Édon", "CA de Tarnos", "ÀÉÎÕÜÿ",
		"Æther", "SDIS des Landes", "A  CE   JOUR", "—", "", "XY123",
	]) {
		assert.deepEqual(normaliser(texte), reference(texte), texte);
	}
});

test("la passe unique garde les règles d'ambiguïté et de territoire", () => {
	const gaz = buildGazetteer([
		{ ...ligne(1, "Weda", "Weda"), source: "usage" },
		ligne(2, "Orange", "Orange"),
		ligne(3, "Orange", "Orange"),
		{ ...ligne(4, "Ville de Tarnos", "Ville de Tarnos"), sector: "commune" },
		{ ...ligne(5, "Tarnos Agglo", "Tarnos Agglo"), sector: "commune" },
	]);
	assert.deepEqual(gaz.byAliasKey.get("weda")?.map((o) => o.id), [1]);
	assert.equal(gaz.byAliasKey.has("orange"), false);
	assert.equal(gaz.roleKeys.has("ville de tarnos"), true);
	assert.equal(gaz.lieuKeys.has("tarnos agglo"), true);
	assert.equal(gaz.byAliasKey.has("tarnos agglo"), false);
});
