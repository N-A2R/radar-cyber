import { test } from "node:test";
import assert from "node:assert/strict";
import { mesurerSecteurs, intervalleWilson, SEUIL_RESERVE, type Secteur } from "../src/analyse/secteur.js";

const fait = (secteur: Secteur, vu: boolean, correct = false) => ({ secteur, vu, correct });

test("sous le seuil, le taux n'est pas publié : c'est une réserve", () => {
	const r = mesurerSecteurs(Array.from({ length: SEUIL_RESERVE - 1 }, () => fait("entreprise", true, true)));
	const e = r.find((x) => x.secteur === "entreprise");
	assert.ok(e);
	assert.equal(e.faits, SEUIL_RESERVE - 1);
	// Le taux est calculé ; c'est la réserve qui dit qu'il ne faut pas s'y fier,
	// et l'intervalle qui dit à quel point.
	assert.equal(e.rappel, 1);
	assert.equal(e.reserve, true);
	assert.ok(e.intervalle && e.intervalle[0] < 1);
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
	assert.ok(e?.intervalle && e.intervalle[1] < 0.35, "sur 10 faits à 0 %, la borne haute reste basse");
});

test("les quatre secteurs sont présents, même à zéro fait", () => {
	const r = mesurerSecteurs([]);
	assert.equal(r.length, 4);
	for (const e of r) assert.equal(e.reserve, true);
});

test("l'intervalle de Wilson ne sort jamais de [0, 1]", () => {
	const [bas, haut] = intervalleWilson(0, 3) as [number, number];
	assert.ok(bas >= 0 && haut <= 1);
	assert.ok(bas === 0);
	const [b2, h2] = intervalleWilson(3, 3) as [number, number];
	assert.ok(b2 >= 0 && h2 <= 1);
	assert.equal(h2, 1);
});
