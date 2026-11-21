/** Les vues Map de l'index compact doivent rester interchangeables avec l'ancien stockage. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGazetteer, type GazetteerRow } from "../src/match/gazetteer.js";

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
