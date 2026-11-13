import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	familleNaf,
	nomDistinctif,
	nomsCommerciaux,
	planReferentielEtendu,
	secteurDeType,
} from "../src/referentiel/plan-etendu.js";
import type { EtablissementsNA, EntreprisesNA, ReferentielNA } from "../src/referentiel/model.js";
import type { PlannedOrg } from "../src/referentiel/plan.js";

const referentiel = {
	meta: { titre: "t", genereLe: "2026-01-01", region: { code: "75", nom: "NA" }, sources: [], methodeGeocodage: "", limites: [], counts: {} },
	region: { code: "75", nom: "Nouvelle-Aquitaine", chefLieu: null, lat: 45, lon: 0 },
	departements: [],
	epci: [],
	communes: [
		{ code: "33063", nom: "Bordeaux", type: "commune-actuelle", siren: null, departement: "33", epci: null, population: 260000, codesPostaux: ["33000"], codesPostauxRecoupes: [], parent: null, lat: 44.84, lon: -0.58 },
		{ code: "40312", nom: "Tarnos", type: "commune-actuelle", siren: null, departement: "40", epci: null, population: 12000, codesPostaux: ["40220"], codesPostauxRecoupes: [], parent: null, lat: null, lon: null },
	],
} as unknown as ReferentielNA;

const territorial: PlannedOrg[] = [];

function etablissement(
	nom: string,
	code: string,
	codeCommune: string | null,
	type = "Pharmacie",
	identifiant: "finess" | "uai" = "finess",
): EtablissementsNA {
	return {
		meta: { titre: "t", genereLe: "2026-01-01" },
		etablissements: [
			{ [identifiant]: code, nom, type, departement: "33", codeCommune, adresse: "1 RUE X 33000 BORDEAUX", statut: "inconnu", lat: null, lon: null, siteWeb: null, source: "s" } as never,
		],
	};
}

describe("nomDistinctif", () => {
	it("écarte les noms de catégorie que des centaines d'écoles partagent", () => {
		assert.equal(nomDistinctif("Ecole primaire"), false);
		assert.equal(nomDistinctif("Ecole élémentaire"), false);
		assert.equal(nomDistinctif("Ecole maternelle publique"), false);
		assert.equal(nomDistinctif("Pharmacie du Centre"), false);
		assert.equal(nomDistinctif("Centre de soins infirmiers"), false);
	});

	it("garde les noms qui désignent réellement une organisation", () => {
		assert.equal(nomDistinctif("Collège de l'Osme"), true);
		assert.equal(nomDistinctif("Ecole primaire d'Agris"), true);
		assert.equal(nomDistinctif("FAM - ADAPEI"), true);
		assert.equal(nomDistinctif("EHPAD Résidence du Parc"), true);
	});

	it("refuse un nom d'un seul jeton : illisible hors de sa ville", () => {
		assert.equal(nomDistinctif("LABOFFICE"), false);
		assert.equal(nomDistinctif("TROESCH"), false);
	});
});

describe("nomsCommerciaux", () => {
	it("extrait les enseignes enfouies entre parenthèses", () => {
		assert.deepEqual(nomsCommerciaux("AQUITAINE DE GESTION URBAINE & RURALE (AGUR)"), ["AGUR"]);
		assert.deepEqual(nomsCommerciaux("C-TECHNOLOGY (PEAKSYS)"), ["PEAKSYS"]);
	});

	it("ne rend rien quand il n'y a pas d'enseigne", () => {
		assert.deepEqual(nomsCommerciaux("AUTOSPHERE BACK OFFICE"), []);
		// Le groupement n'est pas séparé par une virgule : on préfère rendre
		// l'ensemble plutôt que d'inventer une découpe.
		assert.deepEqual(nomsCommerciaux("BALGUERIE (TRANSO + W&S LOGISTICS)"), ["TRANSO + W&S LOGISTICS"]);
	});
});

describe("familleNaf", () => {
	it("nomme les secteurs que la région emploie vraiment", () => {
		assert.equal(familleNaf("62.01Z"), "numerique");
		assert.equal(familleNaf("10.51Z"), "agroalimentaire");
		assert.equal(familleNaf("41.20A"), "construction");
		assert.equal(familleNaf("47.11D"), "commerce");
		assert.equal(familleNaf("49.41A"), "transport-logistique");
		assert.equal(familleNaf("86.21Z"), "sante-social");
		assert.equal(familleNaf(null), "entreprise");
	});
});

describe("secteurDeType", () => {
	it("ramène les libellés FINESS bavards à une famille de facette", () => {
		assert.equal(secteurDeType("Pharmacie d'officine", "sante"), "pharmacie");
		assert.equal(secteurDeType("Foyer d'Accueil Médicalisé pour Adultes Handicapés (F.A.M.)", "sante"), "foyer");
		assert.equal(secteurDeType("Collège", "enseignement"), "college");
		assert.equal(secteurDeType(null, "sante"), "sante");
	});
});

describe("planReferentielEtendu", () => {
	it("reconstruit les coordonnées depuis la commune quand la source les omet", () => {
		const plan = planReferentielEtendu({
			referentiel,
			territorial,
			sante: etablissement("Pharmacie de la Gare", "330000001", "33063"),
		});
		const org = plan.orgs[0];
		assert.equal(org.lat, 44.84);
		assert.equal(org.lon, -0.58);
		assert.equal(org.geoSource, "centroide-commune");
		assert.equal(plan.counts.coordonneesHeriteesCommune, 1);
		assert.equal(plan.counts.sansCoordonnees, 0);
	});

	it("laisse vide quand la commune elle-même n'a pas de centroïde", () => {
		const plan = planReferentielEtendu({
			referentiel,
			territorial,
			sante: etablissement("Pharmacie de la Gare", "330000001", "40312"),
		});
		assert.equal(plan.orgs[0].lat, null);
		assert.equal(plan.counts.sansCoordonnees, 1);
	});

	it("n'arme pas le moteur avec un nom générique, sans perdre le nom", () => {
		const plan = planReferentielEtendu({
			referentiel,
			territorial,
			enseignement: etablissement("Ecole primaire", "0330001A", "33063", "Ecole", "uai"),
		});
		const org = plan.orgs[0];
		assert.equal(org.name, "Ecole primaire");
		assert.equal(org.aliases.length, 0);
		assert.equal(plan.counts.nomsGeneriques, 1);
	});

	it("identifie chaque établissement par son code officiel", () => {
		const plan = planReferentielEtendu({
			referentiel,
			territorial,
			sante: etablissement("Pharmacie de la Gare", "330000001", "33063"),
			enseignement: etablissement("Collège de l'Osme", "0330001A", "33063", "Collège", "uai"),
		});
		assert.equal(plan.orgs[0].entityCode, "330000001");
		assert.equal(plan.orgs[0].entitySource, "finess");
		assert.equal(plan.orgs[1].entityCode, "0330001A");
		assert.equal(plan.orgs[1].entitySource, "annuaire-education");
		assert.notEqual(plan.orgs[0].slug, plan.orgs[1].slug);
	});

	it("charge une entreprise avec son SIREN, son NAF et ses enseignes", () => {
		const entreprises: EntreprisesNA = {
			meta: { titre: "t", genereLe: "2026-01-01" },
			entreprises: [
				{
					siren: "552032534",
					nom: "C-TECHNOLOGY (PEAKSYS)",
					sigle: null,
					nomsAlternatifs: null,
					naf: "62.01Z",
					categorie: "PME",
					effectifMin: 50,
					etat: "actif",
					dateCreation: "2010-01-01",
					siege: { adresse: "1 RUE X", codePostal: "33000", codeCommune: "33063", commune: "BORDEAUX", departement: "33", lat: null, lon: null },
					siteWeb: null,
					domaine: null,
					source: "sirene",
				},
			],
		};
		const plan = planReferentielEtendu({ referentiel, territorial, entreprises });
		const org = plan.orgs[0];
		assert.equal(org.kind, "entreprise");
		assert.equal(org.siren, "552032534");
		assert.equal(org.naf, "62.01Z");
		assert.equal(org.effectifMin, 50);
		assert.equal(org.sector, "numerique");
		assert.equal(org.slug, "na-entreprise-552032534");
		assert.ok(org.aliases.some((a) => a.alias === "PEAKSYS"));
	});
});
