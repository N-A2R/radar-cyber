/**
 * Historique d'une organisation : nouveau, en hausse, ancien — et pas de
 * fausse précision.
 *
 * Le risque : qu'un seul incident bien couvert par la presse ressemble à une
 * année d'attaques. D'où le comptage sur les faits, jamais sur les lignes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { construireHistorique, FENETRE_TENDANCE_JOURS } from "../src/analyse/historique.js";
import { regrouper, type EvenementCorroborable } from "../src/analyse/corroboration.js";

const MAINTENANT = Date.parse("2026-11-13T12:00:00Z");
const JOUR = 86_400_000;
const ilYA = (jours: number) => new Date(MAINTENANT - jours * JOUR).toISOString();

function evt(id: string, jours: number, extra: Partial<EvenementCorroborable> = {}): EvenementCorroborable {
	return {
		id,
		family: "ransomware",
		severity: 4,
		assertionType: "confirmed_incident",
		sourceId: "presse",
		orgId: 7,
		title: "t",
		date: ilYA(jours),
		...extra,
	};
}

test("une organisation jamais vue n'invente pas d'historique", () => {
	const h = construireHistorique([], MAINTENANT);
	assert.equal(h.faits, 0);
	assert.equal(h.premier, null);
	assert.equal(h.parMois.length, 12);
	assert.ok(h.parMois.every((m) => m.faits === 0), "douze mois à zéro, pas une liste vide");
});

test("un fait relayé par cinq sources reste un fait dans l'histogramme", () => {
	const groupes = regrouper([
		evt("a", 3, { sourceId: "s1" }),
		evt("b", 3, { sourceId: "s2" }),
		evt("c", 3, { sourceId: "s3" }),
		evt("d", 3, { sourceId: "s4" }),
		evt("e", 3, { sourceId: "s5" }),
	]);
	const h = construireHistorique(groupes, MAINTENANT);
	assert.equal(h.faits, 1, "cinq lignes, un fait");
	assert.equal(h.parMois.reduce((n, m) => n + m.faits, 0), 1);
	assert.equal(h.sources.length, 5);
});

test("une organisation qui apparaît maintenant est « nouveau »", () => {
	const h = construireHistorique(regrouper([evt("a", 5)]), MAINTENANT);
	assert.equal(h.tendance, "nouveau");
	assert.equal(h.parMois[11]?.faits, 1, "le mois courant porte le fait");
});

test("une organisation qu'on n'a pas vue depuis six mois est « ancien »", () => {
	const h = construireHistorique(regrouper([evt("a", 200), evt("b", 260, { family: "phishing" })]), MAINTENANT);
	assert.equal(h.tendance, "ancien");
});

test("l'activité qui double est « en hausse », pas « stable »", () => {
	const evts = [
		evt("a", 10),
		evt("b", 20, { family: "phishing" }),
		evt("c", 30, { family: "intrusion" }),
		evt("d", 120, { family: "fraude" }),
	];
	const h = construireHistorique(regrouper(evts), MAINTENANT);
	assert.equal(h.tendance, "en hausse");
});

test("quatre faits ne justifient pas de pourcentage : la tendance reste grossière", () => {
	// La tentation serait d'annoncer « +37 % ». Sur ces volumes, c'est du bruit.
	const h = construireHistorique(regrouper([evt("a", 30), evt("b", 100, { family: "phishing" })]), MAINTENANT);
	assert.equal(h.tendance, "stable");
});

test("un fait daté dans le futur ne crée pas de barre à venir", () => {
	const futur = new Date(MAINTENANT + 40 * JOUR).toISOString();
	const groupes = regrouper([evt("a", 2), { ...evt("b", 0), date: futur, id: "b" }]);
	const h = construireHistorique(groupes, MAINTENANT);
	assert.equal(h.parMois.reduce((n, m) => n + m.faits, 0), 1, "seul le fait passé compte");
	assert.equal(h.parMois.length, 12, "toujours douze mois, jamais treize");
});

test("l'histogramme va du plus ancien au plus récent", () => {
	const h = construireHistorique(regrouper([evt("a", 1)]), MAINTENANT);
	const mois = h.parMois.map((m) => m.mois);
	assert.deepEqual(mois, [...mois].sort());
	assert.equal(mois[11], "2026-11");
	assert.equal(mois[0], "2025-12");
});

test("les familles récurrentes sortent en tête", () => {
	const evts = [
		evt("a", 5),
		evt("b", 60, { family: "phishing" }),
		evt("c", 150, { family: "phishing" }),
		evt("d", 210, { family: "phishing" }),
	];
	const h = construireHistorique(regrouper(evts), MAINTENANT);
	assert.equal(h.familles[0]?.family, "phishing");
	assert.equal(h.familles[0]?.faits, 3);
});

test("la fenêtre de tendance est bien de deux fois 90 jours", () => {
	const h = construireHistorique(
		regrouper([evt("a", FENETRE_TENDANCE_JOURS - 5), evt("b", FENETRE_TENDANCE_JOURS + 5)]),
		MAINTENANT,
	);
	assert.equal(h.tendance, "stable", "un fait de chaque côté");
	assert.equal(h.faits, 2);
});
