/** Un comportement par test : réparation des preuves HTTP 200 incomplètes. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRepairable, repairProof, type UnprovenRow } from "../../../scripts/expand-domains-preuve.mts";

const html = "<html><head><title>Charmé - Commune de Charmé</title></head><body>"
	+ "Bienvenue sur le site de la commune de Charmé en Charente."
	+ " Retrouvez les services municipaux, les horaires et les actualités toute l'année.</body></html>";

function row(): UnprovenRow {
	return {
		orgId: 73,
		name: "Commune de Charmé",
		domain: "www.mairie-charme.fr",
		valeur: "www.mairie-charme.fr",
		source: "nom:mairie-<slug>.fr",
		preuve: { statut: 200, url: "https://www.mairie-charme.fr/", titre: "Charmé", token: "charme" },
	};
}

describe("incomplete HTTP 200 proof repair", () => {
	it("adds the final URL after re-verifying the stored page", async () => {
		const result = await repairProof(row(), async (url) => ({ html, status: 200, finalUrl: url }));
		assert.equal(result?.verdict.ok, true);
		assert.equal(result?.preuve.urlFinale, "https://www.mairie-charme.fr/");
		assert.equal(result?.preuve.token, "charme");
	});

	it("leaves proofs whose URL was already recorded untouched", () => {
		const complete: UnprovenRow = {
			...row(), preuve: { ...row().preuve, urlFinale: "https://www.mairie-charme.fr/" },
		};
		assert.equal(isRepairable(complete), false);
	});

	it("rejects a live page that does not name the organisation", async () => {
		const unrelated = "<html><body>Bienvenue sur notre portail d'actualités générales"
			+ " de la région Nouvelle-Aquitaine, retrouvez toute l'actualité locale.</body></html>";
		const result = await repairProof(row(), async (url) => ({ html: unrelated, status: 200, finalUrl: url }));
		assert.equal(result, null);
	});

	it("ignores a proof whose recorded value differs from the organisation domain", () => {
		const mismatch: UnprovenRow = { ...row(), valeur: "autre-commune.fr" };
		assert.equal(isRepairable(mismatch), false);
	});
});
