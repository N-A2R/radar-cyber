/**
 * Régression des preuves exigées avant d'écrire un domaine : extraction depuis
 * un texte, distinction du domaine et vérification du contenu réellement servi.
 * Aucun appel réseau ni écriture base : les fonctions testées sont pures.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { domainesDansTexte, normaliser, racineDistinctive, verifierPage } from "../../../scripts/domaines-reels.mts";

const org = {
	id: 42,
	name: "Commune d'Angoulême",
	city: "Angoulême",
	dept: "16",
	domain: null,
	website: null,
};

describe("domaines-reels", () => {
	it("extrait les racines de domaines cités et ignore les hôtes tiers", () => {
		const trouves = domainesDansTexte(
			"Voir https://www.angouleme.fr/actualite et https://www.sante.fr/dossier, " +
			"puis contact@ville-cognac.fr. Déjà vu angouleme.fr.",
		);
		assert.deepEqual([...trouves].sort(), ["angouleme.fr", "ville-cognac.fr"]);
	});

	it("n'accepte un domaine que si son nom le distingue de l'organisation", () => {
		assert.equal(racineDistinctive("mairie-angouleme.fr", org, []), true);
		assert.equal(racineDistinctive("ville-cognac.fr", org, []), false);
		assert.equal(racineDistinctive("commune.fr", org, ["Angoulême"]), false);
		assert.equal(normaliser("Montembœuf"), "montemboeuf");
	});

	it("vérifie HTTP 200 + jeton distinctif dans la page servie", () => {
		const page = `<html><head><title>Commune d'Angoulême</title></head>
			<body><p>Bienvenue sur le site officiel de la commune d'Angoulême.</p>
			<p>${"Services municipaux, démarches et actualités de la commune. ".repeat(6)}</p></body></html>`;
		const accepte = verifierPage(page, 200, "https://www.angouleme.fr/accueil", org, ["Angoulême"]);
		assert.equal(accepte.ok, true);
		assert.equal(accepte.statut, 200);
		assert.equal(accepte.token, "angouleme");
		assert.ok(accepte.confiance >= 0.85);

		const sansJeton = verifierPage(page, 200, "https://www.angouleme.fr/", { ...org, name: "Ville de Cognac" }, []);
		assert.equal(sansJeton.ok, false);
		assert.equal(sansJeton.motif, "contenu-sans-jeton-distinctif");
		assert.equal(verifierPage(page, 404, "https://www.angouleme.fr/", org, []).ok, false);
		assert.equal(
			verifierPage("<title>Domaine à vendre</title><p>" + "x".repeat(300) + "</p>", 200, "https://www.angouleme.fr/", org, []).ok,
			false,
		);
	});
});
