/**
 * Dossier de reprise — aucune phrase sans source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { construireDossier, dossierEnMarkdown, type EtatSysteme } from "../src/analyse/dossier-reprise.js";

function etatVide(): EtatSysteme {
	return {
		organisations: 0,
		sources: 0,
		sourcesActives: 0,
		sourcesMuettes: 0,
		evenements: 0,
		evenements30j: 0,
		indicateurs: 0,
		alertes: 0,
		journalEvenements: 0,
		archives: 0,
		regles: 0,
		migrations: 0,
		derniereMigration: null,
		domainesConnus: 0,
	};
}

function etatPlein(): EtatSysteme {
	return {
		organisations: 34330,
		sources: 265,
		sourcesActives: 240,
		sourcesMuettes: 12,
		evenements: 0,
		evenements30j: 0,
		indicateurs: 1200,
		alertes: 3,
		journalEvenements: 22,
		archives: 4,
		regles: 7,
		migrations: 29,
		derniereMigration: "migrate-029-journal-motif.sql",
		domainesConnus: 18200,
	};
}

test("le dossier a six sections dans l'ordre attendu", () => {
	const d = construireDossier(etatVide(), "2026-11-13T12:00:00.000Z");
	assert.equal(d.genere, "2026-11-13T12:00:00.000Z");
	assert.deepEqual(
		d.sections.map((s) => s.cle),
		["etat", "verite", "regles", "gestes", "pieges", "ruptures"],
	);
	for (const s of d.sections) {
		assert.ok(s.points.length > 0, `section ${s.cle} vide`);
		assert.ok(s.titre.length > 0);
	}
});

test("aucune section n'est vide même sur une base neuve", () => {
	const d = construireDossier(etatVide());
	for (const s of d.sections) assert.ok(s.points.length >= 3, s.cle);
});

test("les chiffres du système apparaissent dans la section état", () => {
	const d = construireDossier(etatPlein());
	const etatText = d.sections.find((s) => s.cle === "etat")!.points.join(" ");
	assert.match(etatText, /34330/);
	assert.match(etatText, /265/);
	assert.match(etatText, /12.*rien rendu|rien rendu.*12/i);
	assert.match(etatText, /29/);
	assert.match(etatText, /migrate-029/);
});

test("la dernière migration inconnue s'affiche comme telle", () => {
	const d = construireDossier({ ...etatPlein(), derniereMigration: null });
	const txt = d.sections.find((s) => s.cle === "etat")!.points.join(" ");
	assert.match(txt, /inconnue/i);
});

test("les règles non négociables mentionnent zéro euro et non mesuré", () => {
	const d = construireDossier(etatVide());
	const regles = d.sections.find((s) => s.cle === "regles")!.points.join(" ");
	assert.match(regles, /zéro euro/i);
	assert.match(regles, /non mesuré/i);
});

test("les pièges déjà payés citent fetch failed et médiane", () => {
	const d = construireDossier(etatVide());
	const pieges = d.sections.find((s) => s.cle === "pieges")!.points.join(" ");
	assert.match(pieges, /fetch failed/i);
	assert.match(pieges, /médiane|mediane/i);
});

test("le rendu markdown est un document lisible hors ligne", () => {
	const d = construireDossier(etatPlein(), "2026-11-13T12:00:00.000Z");
	const md = dossierEnMarkdown(d);
	assert.match(md, /^# Dossier de reprise/m);
	assert.match(md, /Généré le 2026-11-13/);
	for (const s of d.sections) assert.match(md, new RegExp(s.titre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	assert.ok(md.endsWith("\n"));
});

test("les cinq gestes contiennent verify et les scripts de mesure", () => {
	const d = construireDossier(etatVide());
	const gestes = d.sections.find((s) => s.cle === "gestes")!.points.join(" ");
	assert.match(gestes, /verify/);
	assert.match(gestes, /mesure-couverture/);
	assert.match(gestes, /diagnostic-sources/);
	assert.match(gestes, /replay-journal/);
});
