import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildGazetteer,
	designateUneOrganisation,
	normaliser,
	resoudre,
	type GazetteerRow,
} from "../src/match/gazetteer.js";
import { isRelevant, loadRelevanceOrgIndex, matchOrgForTextFromList } from "../src/collectors/relevance.js";

function row(org_id: number, name: string, alias: string, kind = "collectivite", dept: string | null = null, city: string | null = null): GazetteerRow {
	return { org_id, name, kind, dept, city, alias };
}

/**
 * Un référentiel de test qui reproduit les proportions réelles : quelques
 * collectivités, et le genre de noms qui se répètent — 710 écoles s'appellent
 * « Ecole primaire » dans le jeu livré, 21 pharmacies « Pharmacie du Centre ».
 */
const rows: GazetteerRow[] = [
	row(1, "Commune de Tarnos", "Ville de Tarnos", "collectivite", "40", "Tarnos"),
	row(1, "Commune de Tarnos", "Commune de Tarnos", "collectivite", "40", "Tarnos"),
	row(1, "Commune de Tarnos", "Tarnos", "collectivite", "40", "Tarnos"),
	row(2, "Commune de Gradignan", "Ville de Gradignan", "collectivite", "33", "Gradignan"),
	row(2, "Commune de Gradignan", "Mairie de Gradignan", "collectivite", "33", "Gradignan"),
	row(3, "Département de la Gironde", "Gironde", "collectivite", "33", null),
	row(4, "Commune de Bordeaux", "Bordeaux", "collectivite", "33", "Bordeaux"),
	row(5, "Ecole primaire d'Agris", "Ecole primaire d'Agris", "enseignement", "16", "Agris"),
	row(6, "Ecole primaire", "Ecole primaire", "enseignement", "24", "Périgueux"),
	row(7, "Ecole maternelle", "Ecole maternelle", "enseignement", "33", "Bordeaux"),
	row(8, "PHARMACIE DU CENTRE", "PHARMACIE DU CENTRE", "sante", "33", "Bordeaux"),
	row(9, "EHPAD RESIDENCE DU PARC", "EHPAD RESIDENCE DU PARC", "sante", "79", "Champdeniers"),
	row(10, "EHPAD RESIDENCE DU PARC", "EHPAD RESIDENCE DU PARC", "sante", "33", "Bordeaux"),
	row(11, "Alpha Santé", "Alpha Santé", "entreprise", null, null),
	row(12, "Alpha Energie", "Alpha Energie", "entreprise", null, null),
];

const gaz = buildGazetteer(rows);

describe("gazetteer — les noms de lieu ne tranchent pas", () => {
	it("ignore un toponyme nu, même s'il est un alias de collectivité", () => {
		const r = resoudre(gaz, "Aujourd'hui il fait beau à Bordeaux");
		assert.equal(r.org, null);
	});

	it("ne prend pas la Gironde pour l'organisation dont on parle", () => {
		// « Vignobles Toutigeac » était rattaché au Département de la Gironde
		// parce que le résumé citait le département. C'est exactement le faux
		// positif que le gazetteer doit rendre impossible.
		const r = resoudre(gaz, "Vignobles Toutigeac, en Gironde, victime d'une attaque");
		assert.equal(r.org, null);
	});
});

describe("gazetteer — un rôle institutionnel tranche", () => {
	it("rattache « Ville de Tarnos » à la commune", () => {
		const r = resoudre(gaz, "La Ville de Tarnos a été victime d'un rançongiciel");
		assert.equal(r.org?.id, 1);
		assert.equal(r.reason, "alias-role");
	});

	it("rattache « Mairie de Gradignan » malgré la graphie", () => {
		const r = resoudre(gaz, "Mairie de Gradignan — police municipale");
		assert.equal(r.org?.id, 2);
	});
});

describe("gazetteer — les noms génériques ne décident pas", () => {
	it("ne rattache rien sur « Ecole primaire » seul", () => {
		const r = resoudre(gaz, "Une école primaire a fermé ses portes");
		assert.equal(r.org, null);
	});

	it("rattache quand le nom est distinctif", () => {
		const r = resoudre(gaz, "L'école primaire d'Agris a été cambriolée");
		assert.equal(r.org?.id, 5);
	});
});

describe("gazetteer — l'ambiguïté se départage sur des indices", () => {
	it("départage deux établissements homonymes par la commune citée", () => {
		const r = resoudre(gaz, "L'EHPAD Résidence du Parc de Champdeniers a été touché");
		assert.equal(r.org?.id, 9);
		assert.equal(r.reason, "commune");
	});

	it("reste ambigu quand rien ne départage, et rend les candidats", () => {
		const r = resoudre(gaz, "L'EHPAD Résidence du Parc a été touché");
		assert.equal(r.org, null);
		assert.equal(r.reason, "ambigu");
		assert.equal(r.tied.length, 2);
	});

	it("reste ambigu entre deux entreprises homonymes", () => {
		const r = resoudre(gaz, "Incident chez Alpha ce matin");
		assert.equal(r.org, null);
	});
});

describe("gazetteer — porte d'admission", () => {
	it("un nom distinctif suffit à désigner une organisation", () => {
		assert.notEqual(designateUneOrganisation(gaz, "Le collège de l'Osme organise ses portes ouvertes").reason, "ambiant");
	});

	it("un nom générique ne désigne personne", () => {
		const r = designateUneOrganisation(gaz, "Une école primaire fermée pour travaux");
		assert.equal(r.org, null);
	});
});

describe("porte de pertinence — régression du référentiel étendu", () => {
	const orgs = loadRelevanceOrgIndex([
		{ name: "Ecole primaire", domain: null, assets: [] },
		{ name: "PHARMACIE DU CENTRE", domain: null, assets: [] },
		{ name: "Collège de l'Osme", domain: null, assets: [] },
	]);

	it("refuse un article qui ne cite qu'un nom de catégorie", () => {
		// Avant correctif, ces quatre phrases entraient en base : le nom complet
		// d'une école de Périgueux figure dans « une école primaire fermée ».
		for (const titre of [
			"Une école primaire fermée pour travaux à Périgueux",
			"La pharmacie du centre est fermée ce lundi",
			"Ecole maternelle : inscriptions ouvertes",
		]) {
			assert.equal(isRelevant({ title: titre }, { orgs }).relevant, false, titre);
		}
	});

	it("continue d'accepter un nom propre", () => {
		const r = isRelevant({ title: "Le collège de l'Osme ferme pour travaux" }, { orgs });
		assert.equal(r.relevant, true);
		assert.equal(r.reason, "org");
	});

	it("continue d'accepter un mot-clé cyber, sans organisation", () => {
		assert.equal(isRelevant({ title: "Rançongiciel : un hôpital paralysé" }, { orgs: [] }).relevant, true);
	});
});

describe("matchOrgForTextFromList — même moteur que la production", () => {
	const orgs = [
		{ id: 1, name: "Acme Industries", slug: "acme-industries", domain: "acme-industries.fr" },
		{ id: 2, name: "Globex", slug: "globex", domain: "globex.example" },
	];

	it("rattache un nom à deux jetons", () => {
		const r = matchOrgForTextFromList("Cyberattaque visant Acme Industries", orgs);
		assert.equal(r?.orgId, 1);
	});

	it("ne rend rien sur un texte sans rapport", () => {
		assert.equal(matchOrgForTextFromList("Le BHV ferme ses portes après rénovation", orgs), null);
	});

	it("normalise accents et casse comme le moteur d'alias", () => {
		assert.deepEqual(normaliser("Société Générale — Réseau"), ["societe", "generale", "reseau"]);
	});
});
