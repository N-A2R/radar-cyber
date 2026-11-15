import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGazetteer, resoudre, type GazetteerRow } from "../src/match/gazetteer.js";
import { MOTEURS } from "../src/journal/index.js";

/**
 * gazetteer@3 — ce que la vague SIRENE a rendu nécessaire.
 *
 * Au 15 novembre 2026, le stock a porté le référentiel de 41 801 à 700 320
 * organisations : l'alias d'usage « hyper u » (posé à la main le 14) frappe
 * désormais 49 unités légales, et le moteur, fidèle à son refus d'ambiguïté,
 * a perdu trois incidents enseigne ; pendant qu'un alias distinctif porté par
 * un nom de département (une association colombophile) rattachait à tort un
 * texte citant ce département. Trois règles nouvelles, chacune testée :
 * l'alias d'usage tranche, la commune du texte tranche avant lui, et un alias
 * qui est un toponyme de département ne désigne rien.
 */

function gazetteerEnseigne(): ReturnType<typeof buildGazetteer> {
	const rows: GazetteerRow[] = [
		// L'alias d'usage posé à la main le 14 novembre : « Hyper U » désigne le réseau.
		{ org_id: 1, name: "Hyper U (réseau des supermarchés)", kind: "entreprise", dept: "33", city: null, sector: "commerce", alias: "hyper u", source: "annuaire-entreprises" },
		// Les unités légales du stock : mêmes enseigne, communes différentes.
		{ org_id: 2, name: "SICOSUD HYPER U", kind: "entreprise", dept: "64", city: "Pau", sector: "commerce", alias: "hyper u", source: "sirene" },
		{ org_id: 3, name: "COOP ATLANTIQUE HYPER U", kind: "entreprise", dept: "40", city: "Bayonne", sector: "commerce", alias: "hyper u", source: "sirene" },
	];
	return buildGazetteer(rows);
}

test("l'alias d'usage tranche une ambiguïté d'enseigne créée par le stock", () => {
	const gaz = gazetteerEnseigne();
	// Deux communes citées : l'arbitrage communal ne peut pas trancher, l'usage si.
	const r = resoudre(gaz, "Hyper U à Pau et à Bayonne touchés par la cyberattaque");
	assert.equal(r.org?.id, 1, "l'alias d'usage désigne le réseau");
	assert.equal(r.reason, "alias-usage");
});

test("la commune citée tranche avant l'alias d'usage", () => {
	const gaz = gazetteerEnseigne();
	const r = resoudre(gaz, "Hyper U de Pau cyberattaqué, frigos arrêtés");
	assert.equal(r.org?.id, 2, "le magasin de Pau est la victime nommée");
	assert.equal(r.reason, "commune");
});

test("deux alias d'usage sur la même clé ne tranche pas plus qu'avant", () => {
	const rows: GazetteerRow[] = [
		{ org_id: 1, name: "Hyper U Nord", kind: "entreprise", dept: "33", city: "Bordeaux", sector: "commerce", alias: "hyper u", source: "annuaire-entreprises" },
		{ org_id: 2, name: "Hyper U Sud", kind: "entreprise", dept: "64", city: "Pau", sector: "commerce", alias: "hyper u", source: "annuaire-entreprises" },
	];
	const r = resoudre(buildGazetteer(rows), "Hyper U à Pau et à Bordeaux piraté");
	assert.equal(r.org, null, "deux réseaux homonymes : on ne devine pas");
	assert.equal(r.reason, "ambigu");
});

test("un alias qui est un nom de département ne désigne rien", () => {
	const rows: GazetteerRow[] = [
		{ org_id: 4, name: "SOUS-GROUPEMENT COLOMBOPHILE DES PYRENEES ATLANTIQUES", kind: "association", dept: "64", city: "Pau", sector: "associations", alias: "pyrenees atlantiques", source: "sirene" },
	];
	const r = resoudre(buildGazetteer(rows), "Intrusion chez ERNAT à Orthez, Pyrénées-Atlantiques");
	assert.equal(r.org, null, "le toponyme du département ne désigne pas le colombophile");
	assert.equal(r.reason, "aucun");
});

test("sans source d'usage, le moteur garde le comportement @2", () => {
	const rows: GazetteerRow[] = [
		{ org_id: 1, name: "Ville de Tarnos", kind: "collectivite", dept: "40", city: "Tarnos", sector: "commune", alias: "ville de tarnos" },
	];
	const r = resoudre(buildGazetteer(rows), "ville de tarnos victime");
	assert.equal(r.org?.id, 1);
	assert.equal(r.reason, "alias-role");
});

test("la version de rattachement déclarée au journal est gazetteer@4", () => {
	assert.equal(MOTEURS.rattachement, "gazetteer@4");
});

test("un alias auto-dérivé du stock exige deux mots propres", () => {
	const rows: GazetteerRow[] = [
		// Le cas réel du 15 novembre : une association légalement nommée
		// « A CE JOUR » rattachait tout texte contenant la phrase.
		{ org_id: 7, name: "A CE JOUR", kind: "association", dept: "64", city: "Anglet", sector: "associations", alias: "a ce jour", source: "sirene-nom" },
	];
	const r = resoudre(buildGazetteer(rows), "Incident chez ERNAT à Orthez. À ce jour, aucun comment.");
	assert.equal(r.org, null, "la phrase courante ne désigne pas l'association");
	assert.equal(r.reason, "aucun");
});

test("un alias auto-dérivé avec deux mots propres reste matchable", () => {
	const rows: GazetteerRow[] = [
		{ org_id: 8, name: "DASS SONJOY", kind: "entreprise", dept: "33", city: "Bordeaux", sector: "commerce", alias: "dass sonjoy", source: "sirene-nom" },
	];
	const r = resoudre(buildGazetteer(rows), "Rançongiciel chez DASS SONJOY");
	assert.equal(r.org?.id, 8, "deux mots propres : le nom légal désigne");
	assert.equal(r.reason, "alias-distinctif");
});

test("un alias auto-dérivé portant un rôle garde la règle ordinaire", () => {
	const rows: GazetteerRow[] = [
		{ org_id: 9, name: "Mairie de Test", kind: "collectivite", dept: "33", city: "Test", sector: "commune", alias: "mairie de test", source: "sirene-nom" },
	];
	const r = resoudre(buildGazetteer(rows), "la mairie de test piratée");
	assert.equal(r.org?.id, 9, "un rôle institutionnel tranche même en source stock");
	assert.equal(r.reason, "alias-role");
});
