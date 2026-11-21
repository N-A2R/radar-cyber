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
	dateDepuisHtml,
	dateFlux,
	itemsFlux,
	motsCyberDetectes,
	sitemapsEnfants,
	urlsCyberSitemap,
} from "../../../scripts/articles-presse-lib.mts";
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

test("articles : la date de publication est lue dans la page, sans invention", () => {
	const jsonLd = '<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-11-20T18:12:00+01:00","headline":"Cyberattaque à Angoulême"}</script>';
	assert.deepEqual(dateDepuisHtml(jsonLd), { date: "2026-11-20", titre: "Cyberattaque à Angoulême" });
	assert.equal(dateDepuisHtml('<meta content="2026-10-05T08:00:00Z" property="article:published_time">').date, "2026-10-05");
	assert.equal(dateDepuisHtml('<time datetime="2026-09-01">Publié le 1 septembre</time>').date, "2026-09-01");
	assert.equal(dateDepuisHtml('<p>2026-02-30</p>').date, null);
	assert.equal(dateDepuisHtml('<p>Aucune date</p>').date, null);
	assert.equal(dateFlux("Fri, 20 Nov 2026 18:30:00 +0100"), "2026-11-20");
	assert.equal(dateFlux("hier"), null);
});

test("flux : seuls les articles internes datés sont retenus", () => {
	const xml = '<rss><channel>'
		+ '<item><title>Cyberattaque à Niort</title><link>https://www.sudouest.fr/cyberattaque-a-niort</link>'
		+ '<pubDate>Fri, 20 Nov 2026 18:30:00 +0100</pubDate><description>Une mairie visée.</description></item>'
		+ '<item><title>Ailleurs</title><link>https://ailleurs.fr/actualite</link><pubDate>Fri, 20 Nov 2026 18:30:00 +0100</pubDate></item>'
		+ '</channel></rss>';
	const items = itemsFlux(xml, "https://www.sudouest.fr/rss.xml");
	assert.equal(items.length, 1);
	assert.equal(items[0]!.url, "https://www.sudouest.fr/cyberattaque-a-niort");
	assert.equal(items[0]!.date, "2026-11-20");
	assert.equal(items[0]!.titre, "Cyberattaque à Niort");
});

test("sitemaps : index mensuels et URL cyber filtrées sans fabrication", () => {
	const index = '<sitemapindex>'
		+ '<sitemap><loc>https://www.sudouest.fr/sitemap/articles-2026-11.xml</loc></sitemap>'
		+ '<sitemap><loc>https://www.sudouest.fr/sitemap/articles-2026-10.xml</loc></sitemap>'
		+ '</sitemapindex>';
	assert.deepEqual(
		sitemapsEnfants(index, "https://www.sudouest.fr/sitemap.xml", 1),
		["https://www.sudouest.fr/sitemap/articles-2026-11.xml"],
	);
	const sitemap = '<urlset>'
		+ '<url><loc>https://www.sudouest.fr/economie/cyberattaque-a-bordeaux</loc></url>'
		+ '<url><loc>https://www.sudouest.fr/sport/rugby/bordeaux-begles</loc></url>'
		+ '</urlset>';
	assert.deepEqual(
		urlsCyberSitemap(sitemap, "https://www.sudouest.fr/sitemap/articles-2026-11.xml"),
		["https://www.sudouest.fr/economie/cyberattaque-a-bordeaux"],
	);
});

test("cyber : un mot-clé hors sujet n'est pas un incident", () => {
	assert.deepEqual(motsCyberDetectes("Passer l’aspirateur : deux exercices pendant le ménage"), []);
	assert.deepEqual(motsCyberDetectes("Coeur de Pirate en concert à Bordeaux"), []);
	assert.ok(motsCyberDetectes("Cyberattaque : un rancongiciel frappe une mairie").includes("rancongiciel"));
	assert.ok(motsCyberDetectes("Fuite de données chez un sous-traitant").includes("fuite de donnees"));
});

test("corpus d'articles : 500 articles datés et vérifiables, comptes cohérents", () => {
	const corpus = fileURLToPath(new URL("../../../bench/corpus/articles-presse-na.jsonl", import.meta.url));
	const rapport = fileURLToPath(new URL("../../../bench/results/articles-presse-na-2026-11-21.json", import.meta.url));
	const lignes = readFileSync(corpus, "utf8").trim().split("\n").map((l) => JSON.parse(l));
	assert.ok(lignes.length >= 500, `${lignes.length} articles collectés`);
	assert.equal(new Set(lignes.map((l: { url: string }) => l.url)).size, lignes.length);
	for (const l of lignes) {
		assert.match(l.date, /^\d{4}-\d{2}-\d{2}$/);
		assert.equal(l.statut_http, 200);
		assert.ok(l.titre.length >= 12);
		assert.match(l.url, /^https?:\/\//);
		const mots = motsCyberDetectes(`${l.titre} ${l.extrait}`);
		assert.equal(l.cyber, mots.length > 0);
		assert.deepEqual(l.mots_cyber, mots);
	}
	const resultat = JSON.parse(readFileSync(rapport, "utf8"));
	assert.equal(resultat.comptes.articles_collectes, lignes.length);
	assert.equal(resultat.comptes.articles_dates, lignes.length);
	assert.equal(resultat.comptes.incidents_cyber_extraits, lignes.filter((l) => l.cyber).length);
});
