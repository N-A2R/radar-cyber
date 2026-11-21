/**
 * Corpus « presse communale » — un test par comportement vérifiable.
 *
 * Aucun appel réseau : les fonctions testées sont pures et le corpus généré
 * est vérifié tel qu'il sera versionné.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	DEPARTEMENTS_NA,
	candidatsUrl,
	classifieSource,
	contenuValide,
	estCible,
	extraitPreuve,
	htmlEnTexte,
	jetonsCommune,
	ligneCorpus,
	liensInternes,
	normalise,
	type CommuneCible,
} from "../../../scripts/presse-communale-lib.mjs";

const ANGOULEME: CommuneCible = {
	code_insee: "16015",
	nom: "Angoulême",
	departement: "16",
	population: 41_908,
};

test("cible : Nouvelle-Aquitaine et strictement plus de 2 000 habitants", () => {
	assert.equal(estCible("75", 2001), true);
	assert.equal(estCible("75", 2000), false);
	assert.equal(estCible("75", Number.NaN), false);
	assert.equal(estCible("84", 50_000), false);
	assert.equal(Object.keys(DEPARTEMENTS_NA).length, 12);
});

test("candidats : sources confirmées puis Wikidata puis domaines déduits, sans doublon", () => {
	const urls = candidatsUrl(
		ANGOULEME,
		["https://www.angouleme.fr"],
		["http://www.angouleme.fr/actualites"],
	);
	assert.equal(urls[0], "http://www.angouleme.fr/actualites");
	assert.equal(urls[1], "https://www.angouleme.fr");
	assert.ok(urls.includes("https://mairie-angouleme.fr"));
	assert.ok(urls.includes("https://ville-angouleme.fr"));
	assert.equal(new Set(urls).size, urls.length);
	const accentue = candidatsUrl({ ...ANGOULEME, nom: "Saint-Junien" }, [], []);
	assert.ok(accentue.some((u) => u.includes("saint-junien")));
});

test("preuve : HTTP 200 ne suffit pas, le contenu doit nommer la commune", () => {
	const page = normalise(htmlEnTexte(
		"<title>Mairie d'Angoulême</title><p>Actualités de la ville d'Angoulême, conseil municipal : "
		+ "horaires d'ouverture, état civil, services en ligne et informations locales pour les habitants pendant toute l'année.</p>",
	));
	assert.equal(contenuValide("Angoulême", page), true);
	assert.equal(contenuValide("Bordeaux", page), false);
	assert.equal(contenuValide("Angoulême", "mairie actualite angouleme"), false);
	assert.equal(contenuValide("Angoulême", ""), false);
});

test("classification : journal, actualités, site officiel", () => {
	assert.equal(classifieSource("https://mairie.fr/journal-municipal", "bulletin municipal"), "journal municipal");
	assert.equal(classifieSource("https://mairie.fr/", "les actualités de la commune"), "page actualité mairie");
	assert.equal(classifieSource("https://mairie.fr/", "Bienvenue sur le site de la ville"), "site officiel mairie");
});

test("extraction : jetons distinctifs, texte lisible et liens internes filtrés", () => {
	assert.deepEqual(jetonsCommune("Saint-Junien"), ["junien"]);
	assert.match(htmlEnTexte("<script>bruit()</script><p>Bonjour &amp; bienvenue</p>"), /Bonjour bienvenue/);
	assert.equal(extraitPreuve("a   b\n c"), "a b c");
	const html = '<a href="/actualites/article-1">Actualités</a>'
		+ '<a href="https://ailleurs.fr/actualites">Actualités ailleurs</a>'
		+ '<a href="mailto:x@mairie.fr">Contact</a>';
	assert.deepEqual(
		liensInternes(html, "https://mairie.fr/accueil", /actualit/),
		["https://mairie.fr/actualites/article-1"],
	);
});

test("ligne corpus : les clés demandées sont présentes, même sans source", () => {
	const ligne = ligneCorpus({
		commune: ANGOULEME,
		url: null,
		type: null,
		statut: "sans_source",
		http: 404,
		raison: "HTTP 404",
		preuve: null,
		candidat: null,
		tentatives: [],
		verifie_le: "2026-11-21",
	});
	assert.equal(ligne.commune, "Angoulême");
	assert.equal(ligne.code_insee, "16015");
	assert.equal(ligne.departement, "16");
	assert.equal(ligne.nom_source, null);
	assert.equal(ligne.statut, "sans_source");
	for (const cle of ["commune", "code_insee", "departement", "nom_source", "url", "type", "statut"]) {
		assert.ok(cle in ligne, `clé manquante : ${cle}`);
	}
});
test("corpus généré : chaque commune cible a une ligne, les sources vérifiées ont une preuve", () => {
	const chemin = fileURLToPath(new URL("../../../bench/corpus/presse-communale.jsonl", import.meta.url));
	const lignes = readFileSync(chemin, "utf8").trim().split("\n").map((l) => JSON.parse(l));
	assert.ok(lignes.length >= 500, `${lignes.length} communes collectées`);
	assert.equal(new Set(lignes.map((l: { code_insee: string }) => l.code_insee)).size, lignes.length);
	for (const l of lignes) {
		assert.match(l.code_insee, /^\d{5}$/);
		assert.ok(l.population > 2000);
		assert.ok(l.departement in DEPARTEMENTS_NA);
		if (l.statut === "verifie") {
			assert.equal(l.statut_http, 200);
			assert.match(l.url, /^https?:\/\//);
			assert.ok(l.nom_source && l.type);
			assert.ok(l.preuve && l.preuve.length >= 20);
		} else {
			assert.ok(l.raison, "une commune sans source doit avoir une raison");
		}
	}
});
