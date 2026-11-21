/**
 * Règles de vérité de l'enrichissement du référentiel : aucun réseau, aucune
 * base. Ces tests verrouillent les refus (page de parking, homonyme de nom,
 * code postal ambigu) qui empêchent le script d'écrire une valeur inventée.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	candidatsDomaine,
	evaluerCoherence,
	evaluerCorrespondanceSiren,
	parserCommunes,
	parserResultatsRecherche,
	type HitSiren,
	type OrgEnrichissable,
} from "../src/referentiel/enrichissement.js";

const ORG: OrgEnrichissable = {
	id: 1,
	name: "Commune de Ruffec",
	city: "Ruffec",
	dept: "16",
	kind: "collectivite",
};

function page(contenu: string): string {
	return `<html><head><title>Mairie de Ruffec</title></head><body>${contenu}</body></html>`;
}

describe("domaine depuis le nom", () => {
	it("ne propose que les deux formes ville-/mairie- pour une commune", () => {
		assert.deepEqual(candidatsDomaine(ORG).map((c) => c.host), [
			"ville-ruffec.fr",
			"mairie-ruffec.fr",
		]);
		assert.deepEqual(candidatsDomaine({ ...ORG, kind: "entreprise", name: "Ruffec" }), []);
	});

	it("accepte une page institutionnelle qui cite la commune", () => {
		const verdict = evaluerCoherence(
			page("<h1>Mairie de Ruffec</h1><p>La commune de Ruffec accueille les services municipaux et le centre communal d'action sociale. Ouvert du lundi au vendredi.</p>"),
			ORG,
		);
		assert.equal(verdict.ok, true);
		assert.ok(verdict.confiance >= 0.85);
	});

	it("refuse une page de parking, même avec un statut HTTP 200", () => {
		const verdict = evaluerCoherence(
			"<html><head><title>Achat de domaine</title></head><body>Ce domaine est à vendre. Parking de domaines.</body></html>",
			ORG,
		);
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "contenu-trop-court");
	});

	it("refuse un contenu riche qui ne parle pas de la commune", () => {
		const verdict = evaluerCoherence(
			"<html><head><title>Accueil</title></head><body><p>Un autre site, sans rapport, avec suffisamment de texte pour passer le seuil de longueur et évoquer la mairie en général. Il parle de services, d'horizons lointains, de provinces éloignées, de programmes variés et d'actualités sans jamais mentionner le nom de la commune visitée.</p></body></html>",
			ORG,
		);
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "contenu-sans-nom");
	});
});

describe("SIREN via recherche-entreprises", () => {
	const hit = (nom: string, commune: string, dept: string, etablissements: HitSiren["etablissements"] = []): HitSiren => ({
		siren: "123456789",
		nom,
		codePostal: "16000",
		commune,
		dept,
		latitude: null,
		longitude: null,
		etat: "A",
		etablissements,
	});

	it("reconnaît un établissement dont le siège est dans une autre commune", () => {
		const org = { ...ORG, name: "ALSTOR (SAINT-GEOURS-DE-MAREMNE)", city: "SAINT-GEOURS-DE-MAREMNE", dept: "40" };
		const avecEtabLocal = hit("ALSTOR", "SAINT-PIERRE-DU-MONT", "40", [
			{ codePostal: "40230", commune: "SAINT-GEOURS-DE-MAREMNE" },
		]);
		assert.equal(evaluerCorrespondanceSiren(org, avecEtabLocal).ok, true);
		assert.equal(
			evaluerCorrespondanceSiren(org, hit("ALSTOR", "SAINT-PIERRE-DU-MONT", "40")).motif,
			"nom-exact-dept",
		);
		assert.equal(
			evaluerCorrespondanceSiren(org, hit("ALSTOR", "LYON", "69")).motif,
			"etablissement-local-introuvable",
		);
	});

	it("refuse un nom court identique dont aucun établissement n'est local", () => {
		const org = { ...ORG, name: "RANGER (BRUGES)", city: "BRUGES", dept: "33" };
		const verdict = evaluerCorrespondanceSiren(org, hit("RANGER", "PARIS", "75"));
		assert.equal(verdict.ok, false);
	});

	it("refuse un homonyme partiel (ville vs association)", () => {
		const org = { ...ORG, name: "Ville de Bordeaux", city: "Bordeaux", dept: "33" };
		const verdict = evaluerCorrespondanceSiren(org, hit("BORDEAUX VILLE SANS SIDA", "BORDEAUX", "33"));
		assert.equal(verdict.ok, false);
	});

	it("ignore une réponse API sans SIREN exploitable", () => {
		assert.deepEqual(parserResultatsRecherche({ results: [{ siren: "court", nom_complet: "X" }] }), []);
	});
});

describe("géo depuis le code postal", () => {
	const commune = {
		code: "16015",
		nom: "Angoulême",
		centre: { type: "Point", coordinates: [0.145, 45.6458] },
		codesPostaux: ["16000"],
	};

	it("préfère la commune dont le nom concorde avec la ville", () => {
		const org = { ...ORG, name: "Commune d'Angoulême", city: "Angoulême" };
		const verdict = parserCommunes([commune], "16000", org);
		assert.equal(verdict.ok, true);
		assert.equal(verdict.coord?.confiance, 0.95);
		assert.equal(verdict.coord?.lat, 45.6458);
	});

	it("refuse un code postal ambigu sans indice de ville", () => {
		const autre = { ...commune, code: "16016", nom: "Autre ville" };
		const verdict = parserCommunes([commune, autre], "16000", { ...ORG, city: null });
		assert.equal(verdict.ok, false);
		assert.equal(verdict.motif, "code-postal-ambiguenom");
	});
});
