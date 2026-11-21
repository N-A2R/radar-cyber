/**
 * Agent de bascule sectorielle : z-score binomial sur deux distributions —
 * une stable, une qui rompt — puis les garde-fous et les états vides.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	detecterRuptureSecteur,
	repartirEnFenetres,
	SEUIL_Z,
	OBSERVES_MIN_SECTEUR,
} from "../src/analyse/agent-rupture-secteur.js";

/** 600 événements sur 90 j, répartis entre quatre secteurs éditoriaux. */
const REFERENCE = { sante: 180, enseignement: 100, entreprise: 300, collectivite: 20 };

test("distribution stable : le z reste sous le seuil, pas d'alerte", () => {
	const r = detecterRuptureSecteur({
		recente: { sante: 21, enseignement: 12, entreprise: 36, collectivite: 2 },
		reference: REFERENCE,
	});
	assert.equal(r.fiable, true);
	assert.deepEqual(r.effectifs, { recent: 71, reference: 600 });
	assert.ok(r.zCritique !== null && Math.abs(r.zCritique) < SEUIL_Z, `z inattendu : ${r.zCritique}`);
	assert.equal(r.alerte, false);
});

test("rupture synthétique : la santé explose, l'alerte identifie le secteur et le sens", () => {
	const r = detecterRuptureSecteur({
		recente: { sante: 50, enseignement: 5, entreprise: 10, collectivite: 6 },
		reference: REFERENCE,
	});
	assert.ok(r.zCritique !== null && r.zCritique > SEUIL_Z, `z inattendu : ${r.zCritique}`);
	assert.equal(r.alerte, true);
	assert.equal(r.secteurCritique, "sante");
	assert.equal(r.parSecteur[0]?.secteur, "sante", "le secteur qui contribue le plus est la santé");
	assert.ok((r.parSecteur[0]?.z ?? 0) > 0, "la santé est en hausse, pas en baisse");
});

test("une disparition est aussi une bascule : z négatif sur le secteur manquant", () => {
	const r = detecterRuptureSecteur({
		recente: { sante: 1, enseignement: 1, entreprise: 69, collectivite: 0 },
		reference: REFERENCE,
	});
	assert.equal(r.alerte, true);
	assert.equal(r.secteurCritique, "entreprise");
	assert.ok((r.parSecteur[0]?.z ?? 0) > 0, "c'est la hausse d'entreprise qui porte l'alerte");
	const sante = r.parSecteur.find((p) => p.secteur === "sante");
	assert.ok(sante && sante.z < 0, "la santé manquante a un z négatif");
});

test("le seuil est configurable sur la même distribution", () => {
	const recente = { sante: 50, enseignement: 5, entreprise: 10, collectivite: 6 };
	const base = detecterRuptureSecteur({ recente, reference: REFERENCE });
	assert.ok(base.zCritique !== null);
	const strict = detecterRuptureSecteur({ recente, reference: REFERENCE, seuil: Math.abs(base.zCritique) + 1 });
	const souple = detecterRuptureSecteur({ recente, reference: REFERENCE, seuil: Math.abs(base.zCritique) - 1 });
	assert.equal(strict.alerte, false);
	assert.equal(souple.alerte, true);
	assert.equal(strict.seuil, Math.abs(base.zCritique) + 1);
});

test("effectif trop faible : score calculé mais alerte réservée", () => {
	const r = detecterRuptureSecteur({ recente: { sante: 9 }, reference: { sante: 1 } });
	assert.equal(r.fiable, false);
	assert.equal(r.alerte, false);
	assert.ok(r.zCritique !== null && Number.isFinite(r.zCritique));
});

test("référence vide : aucun z inventé", () => {
	const r = detecterRuptureSecteur({ recente: { sante: 20 }, reference: {} });
	assert.equal(r.zCritique, null);
	assert.equal(r.secteurCritique, null);
	assert.equal(r.fiable, false);
	assert.equal(r.alerte, false);
});

test("deux fenêtres vides : même état vide, sans division par zéro", () => {
	const r = detecterRuptureSecteur({ recente: {}, reference: {} });
	assert.deepEqual(r.effectifs, { recent: 0, reference: 0 });
	assert.deepEqual(r.parSecteur, []);
	assert.equal(r.alerte, false);
});

test("secteur absent de la référence : probabilité lissée positive, pas de NaN", () => {
	const r = detecterRuptureSecteur({
		recente: { sante: 20, nouveau: 20 },
		reference: { sante: 200 },
	});
	assert.ok(r.zCritique !== null && Number.isFinite(r.zCritique));
	const nouveau = r.parSecteur.find((p) => p.secteur === "nouveau");
	assert.ok(nouveau && nouveau.attendu > 0 && nouveau.proportionReference > 0);
	assert.equal(r.alerte, true);
	assert.equal(r.secteurCritique, "nouveau");

	// Un z énorme sur deux faits isolés ne doit pas faire alerter : le
	// secteur porteur d'une bascule doit avoir au moins OBSERVES_MIN_SECTEUR.
	const isole = detecterRuptureSecteur({
		recente: { sante: 100, nouveau: OBSERVES_MIN_SECTEUR - 1 },
		reference: { sante: 200 },
	});
	assert.equal(isole.alerte, false);
});

test("comptages invalides écartés sans polluer les effectifs", () => {
	const r = detecterRuptureSecteur({
		recente: { sante: 12, "": 5, autre: Number.NaN, nul: -4 },
		reference: { sante: 200, vide: 0 },
	});
	assert.equal(r.effectifs.recent, 12);
	assert.equal(r.effectifs.reference, 200);
	assert.equal(r.parSecteur.some((p) => p.secteur === "autre"), false);
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
