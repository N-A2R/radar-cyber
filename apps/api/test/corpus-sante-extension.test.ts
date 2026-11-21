/**
 * Extension du corpus santé — un test par comportement vérifiable.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	estEtablissementSante,
	evaluerPageSante,
	extraireCandidatsSante,
	jetonsSante,
	ligneCorpusSante,
	nettoyerCommune,
	nouveauxCandidats,
	typeSante,
	urlRechercheSante,
	type CandidatSante,
} from "../src/corpus/sante.js";

const fiche = (titre: string, ville: string, alias: string, types: string[], ssType = "health_institution") => ({
	index_id: "health_offer",
	ss_type: ssType,
	its_nid: 123,
	tm_X3b_und_title: [titre],
	tm_X3b_und_field_ville: [ville],
	tm_X3b_und_establishment_type_names: types,
	ss_field_node_path_alias: alias,
});

const payload = (docs: unknown[]) => ({
	datas: { grouped: { ss_field_custom_group: { groups: [{ doclist: { docs } }] } } },
});

const candidat: CandidatSante = {
	nom: "Centre hospitalier de Saintes",
	commune: "Saintes",
	departement: "Charente-Maritime",
	url: "https://www.sante.fr/centre-hospitalier-ch/saintes/centre-hospitalier-de-saintes",
	types: ["Centre hospitalier (CH)"],
	nid: 123,
};

test("lecture : seules les fiches d'établissement sont retenues, sans doublon", () => {
	const candidats = extraireCandidatsSante(payload([
		fiche("Centre hospitalier de Saintes", "Saintes cedex", "/ch/saintes", ["Centre hospitalier (CH)"]),
		fiche("Centre hospitalier de Saintes", "Saintes", "/ch/saintes", ["Centre hospitalier (CH)"]),
		fiche("Médecin généraliste", "Saintes", "/medecin/saintes", ["Médecin"], "health_professional"),
	]), "Charente-Maritime");
	assert.equal(candidats.length, 1);
	assert.deepEqual(candidats[0], {
		nom: "Centre hospitalier de Saintes",
		commune: "Saintes",
		departement: "Charente-Maritime",
		url: "https://www.sante.fr/ch/saintes",
		types: ["Centre hospitalier (CH)"],
		nid: 123,
	});
	assert.deepEqual(extraireCandidatsSante({ datas: {} }, "Gironde"), []);
});

test("sélection : les noms et URL déjà présents dans le corpus sont écartés", () => {
	const nouveaux = nouveauxCandidats(
		[
			candidat,
			{ ...candidat, nom: "Clinique du Parc", url: "https://www.sante.fr/clinique/parc" },
			{ ...candidat, nom: "EHPAD du Parc", url: "https://www.sante.fr/ehpad/parc" },
			{ ...candidat, nom: "EHPAD du Parc", url: "https://www.sante.fr/ehpad/parc" },
		],
		[
			{ nom: "centre hospitalier de Saintes", url: "https://autre.fr/" },
			{ nom: "Autre", url: "https://www.sante.fr/clinique/parc/" },
		],
	);
	assert.deepEqual(nouveaux.map((c) => c.nom), ["EHPAD du Parc"]);
});

test("typage : EHPAD, CHU, clinique et CH sont distingués, les services écartés", () => {
	assert.equal(typeSante(["Etablissement d'hébergement pour personnes âgées dépendantes"], "Maison de retraite du Parc"), "ehpad");
	assert.equal(typeSante(["Centre hospitalier universitaire"], "CHU de Bordeaux"), "chu");
	assert.equal(typeSante(["Hôpitaux & cliniques"], "Clinique d'Angoulins"), "clinique");
	assert.equal(typeSante(["Centre hospitalier (CH)"], "CH de Saintes"), "ch");
	assert.equal(typeSante(["Hôpitaux & cliniques"], "CH de Saintes"), "ch");
	assert.equal(typeSante(["Centre de jour pour personnes âgées"], "Accueil de jour"), null);
	assert.equal(nettoyerCommune("Bordeaux Cedex 33076"), "Bordeaux");
});

test("qualité : les services internes ne sont pas des établissements", () => {
	assert.equal(estEtablissementSante({ ...candidat, nom: "Foyer en reseau" }), false);
	assert.equal(estEtablissementSante({ ...candidat, nom: "Hopital de jour cmp psy" }), false);
	assert.equal(estEtablissementSante(candidat), true);
	assert.equal(estEtablissementSante({ ...candidat, nom: "Maison de retraite du Parc", types: ["EHPAD"] }), true);
});

test("cohérence : la page doit répondre 200 et mentionner au moins deux jetons du nom", () => {
	const nom = "Clinique du Parc à Limoges";
	assert.deepEqual(jetonsSante(nom), ["parc", "limoges"]);
	assert.equal(evaluerPageSante("<html></html>", 404, null, nom).raison, "HTTP 404");
	assert.equal(evaluerPageSante("<html><body>Autre établissement</body></html>", 200, "u", nom).confirme, false);
	const ok = evaluerPageSante(
		"<html><body><h1>La clinique du Parc à Limoges</h1><p>Établissement de santé du parc, accueil du lundi au vendredi, consultations spécialisées et plateau technique à Limoges.</p></body></html>",
		200,
		"https://www.sante.fr/clinique/parc",
		nom,
	);
	assert.equal(ok.confirme, true);
	assert.deepEqual(ok.jetonsTrouves, ["parc", "limoges"]);
	assert.match(ok.extrait ?? "", /clinique du parc a limoges/);
});

test("ligne de corpus : l'URL de preuve et les jetons vérifiés sont conservés", () => {
	const verification = evaluerPageSante(
		"<html><body><h1>Centre hospitalier de Saintes</h1><p>Établissement public de santé.</p></body></html>",
		200,
		"https://www.sante.fr/ch/saintes",
		candidat.nom,
	);
	const ligne = ligneCorpusSante(candidat, "ch", "na-sante-0001", verification, "2026-11-21");
	assert.equal(ligne.id, "na-sante-0001");
	assert.equal(ligne.url, candidat.url);
	assert.equal(ligne.url_finale, "https://www.sante.fr/ch/saintes");
	assert.equal(ligne.statut_http, 200);
	assert.deepEqual(ligne.jetonsTrouves ?? [], []);
	assert.deepEqual(ligne.jetons_trouves, verification.jetonsTrouves);
	assert.equal(ligne.source, "sante.fr fiche établissement");
});

test("API : l'URL de recherche porte le département et l'index public", () => {
	const u = new URL(urlRechercheSante("EHPAD", "Gironde", 2));
	assert.equal(u.origin + u.pathname, "https://www.sante.fr/solr/request/ajax/");
	assert.equal(u.searchParams.get("where"), "Gironde");
	assert.equal(u.searchParams.get("what"), "EHPAD");
	assert.equal(u.searchParams.get("page"), "2");
	assert.equal(u.searchParams.get("index"), "health_offer");
});
