/**
 * Garde anti-alias ambigu : un fragment de raison sociale ne rend pas ambigu
 * un alias qui nomme réellement une organisation.
 *
 * Les trois jeux de lignes ci-dessous sont volontairement minuscules et sans
 * base : ils fixent le comportement avant/après de la règle mesurée dans
 * `docs/qualite-alias-ambiguite.md`. Le fragment `sirene-nom` et l'alias
 * d'usage portent la même clé normalisée ; seule la source diffère.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGazetteer, resoudre, type GazetteerRow } from "../src/match/gazetteer.js";

function ligne(
	org_id: number,
	alias: string,
	source: string,
	name = `Organisation ${org_id}`,
): GazetteerRow {
	return {
		org_id,
		name,
		kind: "entreprise",
		dept: null,
		city: null,
		sector: "commerce",
		alias,
		source,
	};
}

const TEXTE = "Cyberattaque chez la société Novalis";

describe("gazetteer — ambiguïté des alias normalisés", () => {
	it("un fragment sirene-nom ne masque pas une marque unique posée à la main", () => {
		const gaz = buildGazetteer([
			ligne(1, "Novalis", "usage"),
			ligne(2, "novalis", "sirene-nom"),
		]);
		assert.deepEqual(gaz.brandsByKey.get("novalis")?.map((o) => o.id), [1]);
		assert.deepEqual(gaz.byAliasKey.get("novalis")?.map((o) => o.id), [1]);
		const r = resoudre(gaz, TEXTE);
		assert.equal(r.org?.id, 1);
		assert.equal(r.reason, "alias-distinctif");
	});

	it("deux sources nommantes distinctes gardent la clé ambiguë", () => {
		const gaz = buildGazetteer([
			ligne(1, "Novalis", "usage"),
			ligne(2, "Novalis", "sirene-usuelle"),
			ligne(3, "novalis", "sirene-nom"),
		]);
		assert.equal(gaz.brandsByKey.has("novalis"), false);
		assert.equal(gaz.byAliasKey.has("novalis"), false);
		const r = resoudre(gaz, TEXTE);
		assert.equal(r.org, null);
		assert.equal(r.reason, "aucun");
	});

	it("un fragment seul ne devient jamais une marque, même unique", () => {
		const gaz = buildGazetteer([
			ligne(1, "novalis", "sirene-nom"),
			ligne(2, "NOVALIS", "sirene-nom"),
		]);
		assert.equal(gaz.brandsByKey.has("novalis"), false);
		assert.equal(gaz.byAliasKey.has("novalis"), false);
		assert.equal(resoudre(gaz, TEXTE).org, null);
	});

	it("les variantes d'accent et de casse d'une même organisation ne s'éliminent pas", () => {
		const gaz = buildGazetteer([
			ligne(1, "Növalis", "usage"),
			ligne(1, "NOVALIS", "annuaire-entreprises"),
			ligne(2, "novalis", "sirene-nom"),
		]);
		assert.deepEqual(gaz.byAliasKey.get("novalis")?.map((o) => o.id), [1]);
		assert.equal(resoudre(gaz, TEXTE).org?.id, 1);
	});

	it("une variante accentuée portée par une autre organisation reste ambiguë", () => {
		const gaz = buildGazetteer([
			ligne(1, "Növalis", "usage"),
			ligne(2, "novalis", "usage"),
		]);
		assert.equal(gaz.brandsByKey.has("novalis"), false);
		assert.equal(gaz.byAliasKey.has("novalis"), false);
		assert.equal(resoudre(gaz, TEXTE).org, null);
	});
});
