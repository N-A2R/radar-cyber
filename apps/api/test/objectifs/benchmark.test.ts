/**
 * Benchmark : chaque mesure publiée doit être rejouable et honnête.
 *
 * Un canal sans date n'est jamais classé ; une métrique GitHub privée n'est
 * jamais inventée ; le rapport tient sous 150 mots.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
	calculerBenchmark,
	classerSourcePresse,
	codeDepartement,
	construireIncidents,
	type IncidentDepartemental,
	type IncidentReference,
} from "../../src/analyse/benchmark-premier-regard.js";
import {
	CRITERES,
	ErreurBenchmarkOutils,
	positionRadar,
	verifierJeuOutils,
	type JeuOutils,
} from "../../src/analyse/benchmark-outils.js";
import {
	genererRapport,
	genererTableauIncidents,
	LIMITE_MOTS_RAPPORT,
} from "../../src/analyse/rapport-benchmark.js";

function lireJeu(): JeuOutils {
	return JSON.parse(
		readFileSync(new URL("../../../../bench/results/benchmark-outils.json", import.meta.url), "utf8"),
	) as JeuOutils;
}

test("les éditeurs sont classés par presse locale ou nationale, sans confondre un communiqué", () => {
	assert.equal(classerSourcePresse("Sud Ouest"), "presseLocale");
	assert.equal(classerSourcePresse("France 3 Nouvelle-Aquitaine"), "presseLocale");
	assert.equal(classerSourcePresse("la dépêche du Midi"), "presseLocale");
	assert.equal(classerSourcePresse("Le Figaro"), "presseNationale");
	assert.equal(classerSourcePresse("ZATAZ"), "presseNationale");
	assert.equal(classerSourcePresse("Ville de Limoges (communiqué officiel)"), null);
	assert.equal(classerSourcePresse("CERT-FR"), null);
});

test("les départements sont normalisés en code à deux chiffres", () => {
	assert.equal(codeDepartement("33"), "33");
	assert.equal(codeDepartement("Deux-Sèvres"), "79");
	assert.equal(codeDepartement("Pyrénées-Atlantiques"), "64");
	assert.equal(codeDepartement("inconnu"), "inconnu");
});

test("sans média daté, radar est seul au classement et aucun délai n'est mesuré", () => {
	const bilan = calculerBenchmark([
		{ id: "a", entite: "A", codeDepartement: "33", dates: { radar: "2026-01-10" } },
	]);
	assert.deepEqual(bilan.lignes[0]?.premier, ["radar"]);
	assert.equal(bilan.radarPremierFaceMedia, 0);
	assert.deepEqual(bilan.lignes[0]?.dernier, ["radar"]);
	assert.equal(bilan.radarDernier, 1);
	assert.equal(bilan.delaiHeures.mediane, null);
	assert.equal(bilan.sansMediaDate, 1);
});

test("le délai se calcule entre le premier média daté et la trace radar", () => {
	const bilan = calculerBenchmark([
		{
			id: "a",
			entite: "A",
			codeDepartement: "33",
			dates: { radar: "2026-01-10", presseLocale: "2025-12-31", presseNationale: "2026-01-05" },
		},
	]);
	assert.equal(bilan.lignes[0]?.premierMedia, "presseLocale");
	assert.equal(bilan.lignes[0]?.datePremierMedia, "2025-12-31");
	assert.equal(bilan.lignes[0]?.delaiHeures, 240);
	assert.equal(bilan.radarDernier, 1);
	assert.equal(bilan.delaiHeures.mediane, 240);
});

test("radar peut être premier face à un média daté, avec un délai négatif", () => {
	const bilan = calculerBenchmark([
		{
			id: "a",
			entite: "A",
			codeDepartement: "33",
			dates: { radar: "2025-12-01", presseNationale: "2025-12-10" },
		},
	]);
	assert.equal(bilan.radarPremierFaceMedia, 1);
	assert.equal(bilan.radarDernier, 0);
	assert.equal(bilan.lignes[0]?.delaiHeures, -216);
});

test("la sélection élimine les doublons avant d'appliquer la limite", () => {
	const reference: { incidents: IncidentReference[] } = {
		incidents: [
			{
				id: "r1",
				entite: "Hôpital de Bordeaux",
				departement: "33",
				dateIncident: "2026-01-01",
				datePublique: "2026-01-02",
				preuve: { editeur: "Sud Ouest", consulteLe: "2026-11-12" },
			},
		],
	};
	const departementaux: IncidentDepartemental[] = [
		{
			id: "d1",
			organisation: "hopital de bordeaux",
			departement: "Gironde",
			date_incident: "2026-01-01",
			date_publication: "2026-01-03",
			source: "Sud Ouest",
			verifie_le: "2026-11-21",
		},
		{
			id: "d2",
			organisation: "Mairie de Poitiers",
			departement: "86",
			date_publication: "2026-02-01",
			source: "Communiqué officiel",
			verifie_le: "2026-11-21",
		},
	];
	const incidents = construireIncidents(reference, departementaux, 2);
	assert.deepEqual(incidents.map((incident) => incident.id), ["r1", "d2"]);
	assert.deepEqual(incidents[0]?.dates, { radar: "2026-11-12", presseLocale: "2026-01-02" });
});

test("le corpus réel donne 100 incidents, radar toujours dernier et jamais premier face à un média", () => {
	const reference = JSON.parse(
		readFileSync(new URL("../../../../bench/fixtures/corpus-reference-na.json", import.meta.url), "utf8"),
	) as Parameters<typeof construireIncidents>[0];
	const noms = readdirSync(new URL("../../../../bench/corpus/", import.meta.url))
		.filter((nom) => /^incidents-.*\.jsonl$/.test(nom))
		.sort();
	const departementaux = noms.flatMap((nom) =>
		readFileSync(new URL(`../../../../bench/corpus/${nom}`, import.meta.url), "utf8")
			.split("\n")
			.filter((ligne) => ligne.trim())
			.map((ligne) => JSON.parse(ligne) as IncidentDepartemental),
	);
	const bilan = calculerBenchmark(construireIncidents(reference, departementaux, 100));
	assert.equal(bilan.total, 100);
	assert.equal(bilan.radarDernier, 100);
	assert.equal(bilan.radarPremier, 23);
	assert.equal(bilan.radarPremierFaceMedia, 0);
	assert.equal(bilan.delaiHeures.mediane, 8520);
	assert.equal(bilan.delaiHeures.n, 77);
});

test("le jeu d'outils refuse moins de huit outils et accepte la mesure versionnée", () => {
	const jeu = lireJeu();
	assert.equal(jeu.outils.length, 8);
	assert.equal(CRITERES.length, 5);
	verifierJeuOutils(jeu);
	assert.throws(
		() => verifierJeuOutils({ ...jeu, outils: jeu.outils.slice(0, 7) }),
		ErreurBenchmarkOutils,
	);
});

test("Radar Cyber est premier des huit sur l'incidents NA, non classé sur les quatre métriques privées", () => {
	const position = positionRadar(lireJeu());
	assert.equal(position.outils, 8);
	assert.equal(position.criteres, 5);
	assert.equal(position.rangs.mentionsNA, 1);
	assert.equal(position.mentionsNA, 100);
	assert.equal(position.maxAutres, 0);
	assert.equal(Object.values(position.rangs).filter((rang) => rang === null).length, 4);
});

test("le rapport tient sous 150 mots et publie les chiffres attendus", () => {
	const jeu = lireJeu();
	const bilan = calculerBenchmark([
		{
			id: "a",
			entite: "A",
			codeDepartement: "33",
			dates: { radar: "2026-01-10", presseLocale: "2025-12-31" },
		},
	]);
	const rapport = genererRapport(bilan, jeu);
	assert.ok(rapport.mots < LIMITE_MOTS_RAPPORT, `${rapport.mots} mots`);
	assert.match(rapport.markdown, /OpenCTI.*RansomLook/s);
	assert.match(rapport.markdown, /100 vs 0/);
	assert.match(rapport.markdown, /1\/8 sur la trace NA/);
	assert.match(rapport.markdown, /docs\/benchmark-incidents\.md/);
});

test("le tableau nominatif porte 100 lignes et n'invente pas de date CERT-FR", () => {
	const jeu = lireJeu();
	const reference = JSON.parse(
		readFileSync(new URL("../../../../bench/fixtures/corpus-reference-na.json", import.meta.url), "utf8"),
	) as Parameters<typeof construireIncidents>[0];
	const noms = readdirSync(new URL("../../../../bench/corpus/", import.meta.url))
		.filter((nom) => /^incidents-.*\.jsonl$/.test(nom))
		.sort();
	const departementaux = noms.flatMap((nom) =>
		readFileSync(new URL(`../../../../bench/corpus/${nom}`, import.meta.url), "utf8")
			.split("\n")
			.filter((ligne) => ligne.trim())
			.map((ligne) => JSON.parse(ligne) as IncidentDepartemental),
	);
	const bilan = calculerBenchmark(construireIncidents(reference, departementaux, 100));
	const tableau = genererTableauIncidents(bilan, jeu.dateMesure);
	assert.equal(tableau.split("\n").filter((ligne) => ligne.startsWith("| `")).length, 100);
	assert.match(tableau, /CERT-FR n'a aucune date/);
	assert.match(tableau, /\| `na-2026-001` \|/);
});
