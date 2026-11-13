import { test } from "node:test";
import assert from "node:assert/strict";
import { mesurerSecteurs, SEUIL_RESERVE, type Secteur } from "../src/analyse/secteur.js";

const fait = (secteur: Secteur, vu: boolean, correct = false) => ({ secteur, vu, correct });

test("sous le seuil, le taux n'est pas publié : c'est une réserve", () => {
	const r = mesurerSecteurs(Array.from({ length: SEUIL_RESERVE - 1 }, () => fait("entreprise", true, true)));
	const e = r.find((x) => x.secteur === "entreprise");
	assert.ok(e);
	assert.equal(e.faits, SEUIL_RESERVE - 1);
	assert.equal(e.rappel, null);
	assert.equal(e.reserve, true);
});

test("au seuil, le taux est publié et la réserve tombe", () => {
	const faits = Array.from({ length: SEUIL_RESERVE }, (_, i) => fait("entreprise", i < 3, true));
	const e = mesurerSecteurs(faits).find((x) => x.secteur === "entreprise");
	assert.ok(e);
	assert.equal(e.reserve, false);
	assert.equal(e.rappel, 3 / SEUIL_RESERVE);
	assert.equal(e.precision, 1);
});

test("un secteur à 0 % ne doit pas être noyé par le taux global", () => {
	// 50 collectivités vues sur 50, 10 entreprises vues sur 0 : le global
	// affiche 83 %, la réalité est un trou complet côté entreprises.
	const faits = [
		...Array.from({ length: 50 }, () => fait("collectivite", true, true)),
		...Array.from({ length: 10 }, () => fait("entreprise", false)),
	];
	const vus = faits.filter((f) => f.vu).length;
	assert.ok(vus / faits.length > 0.8);
	const e = mesurerSecteurs(faits).find((x) => x.secteur === "entreprise");
	assert.equal(e?.rappel, 0);
	assert.equal(e?.precision, null, "aucun rattachement produit : la précision n'a pas de sens");
});

test("les quatre secteurs sont présents, même à zéro fait", () => {
	const r = mesurerSecteurs([]);
	assert.equal(r.length, 4);
	for (const e of r) assert.equal(e.reserve, true);
});
