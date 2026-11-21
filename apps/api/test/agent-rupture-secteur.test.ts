/**
 * Agent de rupture sectorielle : deux distributions synthétiques — une qui
 * ressemble à la référence, une qui rompt — puis les garde-fous du détecteur.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	detecterRuptureSecteur,
	repartirEnFenetres,
	SEUIL_CHI2,
} from "../src/analyse/agent-rupture-secteur.js";
/** 600 événements sur 90 j, répartis entre les quatre secteurs éditoriaux. */
const REFERENCE = { sante: 180, enseignement: 100, entreprise: 300, collectivite: 20 };

test("distribution stable : le χ² reste sous le seuil, pas d'alerte", () => {
	// Mêmes proportions que la référence, ramenées à 71 événements sur 7 j.
	const r = detecterRuptureSecteur({
		recente: { sante: 21, enseignement: 12, entreprise: 36, collectivite: 2 },
		reference: REFERENCE,
	});
	assert.equal(r.fiable, true);
	assert.deepEqual(r.effectifs, { recent: 71, reference: 600 });
	assert.ok(r.chi2 !== null && r.chi2 < SEUIL_CHI2, `χ² inattendu : ${r.chi2}`);
	assert.equal(r.alerte, false);
});

test("rupture synthétique : la santé explose, l'alerte identifie le secteur", () => {
	const r = detecterRuptureSecteur({
		recente: { sante: 50, enseignement: 5, entreprise: 10, collectivite: 6 },
		reference: REFERENCE,
	});
	assert.ok(r.chi2 !== null && r.chi2 > SEUIL_CHI2, `χ² inattendu : ${r.chi2}`);
	assert.equal(r.alerte, true);
	assert.equal(r.parSecteur[0]?.secteur, "sante", "le secteur qui contribue le plus est la santé");
	assert.ok((r.parSecteur[0]?.residu ?? 0) > 0, "la santé est en hausse, pas en baisse");
});

test("le seuil est configurable sur la même distribution", () => {
	const recente = { sante: 50, enseignement: 5, entreprise: 10, collectivite: 6 };
	const base = detecterRuptureSecteur({ recente, reference: REFERENCE });
	const chi2 = base.chi2;
	assert.ok(chi2 !== null);
	const strict = detecterRuptureSecteur({ recente, reference: REFERENCE, seuil: chi2 + 1 });
	const souple = detecterRuptureSecteur({ recente, reference: REFERENCE, seuil: chi2 - 1 });
	assert.equal(strict.alerte, false);
	assert.equal(souple.alerte, true);
	assert.equal(strict.seuil, chi2 + 1);
});

test("effectif trop faible : score calculé mais alerte réservée", () => {
	const r = detecterRuptureSecteur({ recente: { sante: 9 }, reference: { sante: 1 } });
	assert.equal(r.fiable, false);
	assert.equal(r.alerte, false);
	assert.ok(r.chi2 !== null && Number.isFinite(r.chi2));
});

test("référence vide : aucun χ² inventé", () => {
	const r = detecterRuptureSecteur({ recente: { sante: 20 }, reference: {} });
	assert.equal(r.chi2, null);
	assert.equal(r.fiable, false);
	assert.equal(r.alerte, false);
});

test("secteur absent de la référence : attendu positif, pas de NaN", () => {
	const r = detecterRuptureSecteur({
		recente: { sante: 20, nouveau: 20 },
		reference: { sante: 200 },
	});
	assert.ok(r.chi2 !== null && Number.isFinite(r.chi2));
	const nouveau = r.parSecteur.find((p) => p.secteur === "nouveau");
	assert.ok(nouveau && nouveau.attendu > 0);
});

test("les fenêtres sont 7 j et les 90 j précédents", () => {
	const maintenant = Date.parse("2026-11-21T12:00:00Z");
	const ilYA = (jours: number) => new Date(maintenant - jours * 86_400_000).toISOString();
	const f = repartirEnFenetres(
		[
			{ secteur: "sante", date: ilYA(1) },
			{ secteur: "sante", date: ilYA(6) },
			{ secteur: "sante", date: ilYA(7) },
			{ secteur: "entreprise", date: ilYA(8) },
			{ secteur: "entreprise", date: ilYA(96) },
			{ secteur: "entreprise", date: ilYA(97) },
			{ secteur: "entreprise", date: ilYA(98) },
			{ secteur: "sante", date: ilYA(-1) },
			{ secteur: "sante", date: "pas-une-date" },
		],
		maintenant,
	);
	assert.deepEqual({ ...f.recente }, { sante: 3 });
	assert.deepEqual({ ...f.reference }, { entreprise: 3 });
});
