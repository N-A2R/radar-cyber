/**
 * Les aides de la vague manques GLM : règles pures de lecture du registre et
 * des sites, sans réseau. La décision trancher est testée sur des candidats
 * factices — le réseau réel ne doit jamais décider à la place des règles.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	extraireSirens,
	famille,
	jetons,
	longueurPubliee,
	luhnValide,
	marqueEtDomaine,
	ranger,
	requetesPour,
	sansSeparateurs,
	trancher,
	variantesDenomination,
	type Candidat,
} from "../../../scripts/manques-glm.mts";

function candidat(sur: Partial<Candidat>): Candidat {
	return {
		siren: "000000000",
		denom: "?",
		variantes: [],
		etat: "A",
		ville: null,
		dept: null,
		nature: null,
		adresseSiege: null,
		siretSiege: null,
		extras: [],
		exact: false,
		...sur,
	};
}

// --- lecture des noms -------------------------------------------------------

test("un domaine donne une marque et un domaine, www ôté", () => {
	assert.deepEqual(marqueEtDomaine("www.normandydiesel.fr"), {
		marque: "normandydiesel",
		domaine: "normandydiesel.fr",
	});
	assert.deepEqual(marqueEtDomaine("adveo.com"), { marque: "adveo", domaine: "adveo.com" });
});

test("un nom de revendication sans point n'est pas un domaine", () => {
	assert.deepEqual(marqueEtDomaine("Gloria Cales"), { marque: "Gloria Cales", domaine: null });
	assert.deepEqual(marqueEtDomaine("Universite Paris Sud"), {
		marque: "Universite Paris Sud",
		domaine: null,
	});
});

test("les parenthèses d'une dénomination deviennent des variantes", () => {
	assert.deepEqual(variantesDenomination("DEMOS (DEMOS TRAINING)"), ["DEMOS", "DEMOS TRAINING"]);
	assert.deepEqual(variantesDenomination("ISETA - ECA (ISETA - ECA)"), ["ISETA - ECA"]);
});

test("les séparateurs et les accents disparaissent", () => {
	assert.equal(sansSeparateurs("NORMANDY DIESEL"), "normandydiesel");
	assert.equal(sansSeparateurs("UNIVERSITÉ"), "universite");
});

test("les jetons courts et génériques sont écartés", () => {
	assert.deepEqual(jetons("Université de Paris-Sud"), ["universite", "paris", "sud"]);
});

// --- SIREN ------------------------------------------------------------------

test("un SIREN valide passe la validation Luhn", () => {
	assert.equal(luhnValide("722030277"), true);
	assert.equal(luhnValide("382954279"), true);
	assert.equal(luhnValide("722030278"), false);
	assert.equal(luhnValide("38295427"), false);
});

test("un SIREN imprimé dans une page est extrait avec son contexte", () => {
	const page = "Editeur : Société Anonyme au capital de 14 165 749 €. 722 030 277 RCS Nanterre.";
	const trouves = extraireSirens(page);
	assert.equal(trouves.length, 1);
	assert.equal(trouves[0].siren, "722030277");
	assert.match(trouves[0].contexte, /RCS Nanterre/);
});

test("un SIREN sans mot-clé d'identification à côté n'est pas retenu", () => {
	assert.deepEqual(extraireSirens("Montant facturé 402 205 199 euros TTC"), []);
});

test("un nombre trop long (SIRET ou téléphone) n'est pas un SIREN", () => {
	assert.deepEqual(extraireSirens("SIRET 38295427900040 déclaré au RCS"), []);
});

// --- corroboration par le site ----------------------------------------------

test("la dénomination la plus longue publiée sur le site gagne", () => {
	const texte = "Bienvenue sur le site de l'ISETA-ECA, Institut d'études";
	assert.equal(longueurPubliee(texte, "ISETA - ECA"), 11);
	// « iseta » seul apparaît aussi (dans « ISETA-ECA ») mais plus court :
	// la plus longue dénomination l'emporte au moment de corroborer.
	assert.equal(longueurPubliee(texte, "ISETA"), 7);
	assert.equal(longueurPubliee(texte, "ISETA RETAIL"), 0);
});

test("une dénomination absente du site ne corrobore rien", () => {
	assert.equal(longueurPubliee("Site de la ville de Nanterre", "ECONOMIE MIXTE AMENAGEM GESTION NANTERRE"), 0);
});

test("les séparateurs du texte et de la dénomination s'équivalent", () => {
	assert.equal(longueurPubliee("contact@lumiplan.com — Lumiplan Montagne", "LUMIPLAN MONTAGNE") > 0, true);
});

// --- requêtes de repli --------------------------------------------------------

test("une marque collée est découpée en requêtes de repli", () => {
	const requetes = requetesPour("normandydiesel");
	assert.equal(requetes[0], "normandydiesel");
	assert.ok(requetes.includes("normandy diesel"));
});

test("une marque à mots garde sa seule requête", () => {
	assert.deepEqual(requetesPour("gloria cales"), ["gloria cales"]);
});

// --- familles ---------------------------------------------------------------

test("les natures juridiques se rangent en familles connues", () => {
	assert.equal(famille("7383"), "etablissement_public");
	assert.equal(famille("7210"), "collectivite");
	assert.equal(famille("9220"), "association");
	assert.equal(famille("5499"), "entreprise");
	assert.equal(famille("7343"), "entreprise");
	assert.equal(famille(null), "entreprise");
});

// --- classement et verdict ----------------------------------------------------

test("le classement préfère l'égalité exacte, puis le moins de jetons superflus", () => {
	const ranges = ranger([
		candidat({ siren: "111111111", denom: "NORMANDY DIESEL 27", exact: false, extras: ["27"] }),
		candidat({ siren: "301188736", denom: "NORMANDY DIESEL", exact: true }),
	]);
	assert.equal(ranges[0].siren, "301188736");
});

test("une dénomination cessée passe après une active à jetons égaux", () => {
	const ranges = ranger([
		candidat({ siren: "402205199", etat: "C" }),
		candidat({ siren: "951323997", etat: "A" }),
	]);
	assert.equal(ranges[0].siren, "951323997");
});

test("un SIREN publié par le site tranche en haute confiance", () => {
	const v = trancher({
		candidatsRanges: [
			candidat({ siren: "722030277", denom: "DEMOS (DEMOS TRAINING)", variantes: ["DEMOS"], exact: true }),
			candidat({ siren: "992711838", denom: "DEMOS", variantes: ["DEMOS"], exact: true }),
		],
		sirenPublie: { siren: "722030277", contexte: "722 030 277 RCS Nanterre", url: "https://www.demos.fr/" },
		corroborees: new Set(["722030277", "992711838"]),
		siteVivant: true,
		domaine: "demos.fr",
	});
	assert.equal(v.resolu, true);
	assert.equal(v.confiance, "haute");
	assert.equal(v.candidat?.siren, "722030277");
});

test("des homonymes exacts sans preuve de site ne sont pas résolus", () => {
	const v = trancher({
		candidatsRanges: [
			candidat({ siren: "111111111", denom: "DEMOS", variantes: ["DEMOS"], exact: true }),
			candidat({ siren: "222222222", denom: "DEMOS", variantes: ["DEMOS"], exact: true }),
		],
		sirenPublie: null,
		corroborees: new Set(),
		siteVivant: false,
		domaine: "demos.fr",
	});
	assert.equal(v.resolu, false);
	assert.match(v.raison, /arbitrage humain/);
});

test("une dénomination exacte unique sans site est résolue en moyenne", () => {
	const v = trancher({
		candidatsRanges: [candidat({ siren: "907685325", denom: "ROYAL GLASS", variantes: ["ROYAL GLASS"], exact: true })],
		sirenPublie: null,
		corroborees: new Set(),
		siteVivant: false,
		domaine: null,
	});
	assert.equal(v.resolu, true);
	assert.equal(v.confiance, "moyenne");
});

test("une dénomination à un jeton près est résolue en faible avec avertissement", () => {
	const v = trancher({
		candidatsRanges: [
			candidat({ siren: "199111014", denom: "UNIVERSITE DE PARIS XI PARIS SUD", variantes: ["UNIVERSITE DE PARIS XI PARIS SUD"], exact: false, extras: ["xi"] }),
		],
		sirenPublie: null,
		corroborees: new Set(),
		siteVivant: false,
		domaine: null,
	});
	assert.equal(v.resolu, true);
	assert.equal(v.confiance, "faible");
	assert.match(v.raison, /xi/);
});

test("aucun candidat au registre est un non résolu franc", () => {
	const v = trancher({
		candidatsRanges: [],
		sirenPublie: null,
		corroborees: new Set(),
		siteVivant: false,
		domaine: null,
	});
	assert.equal(v.resolu, false);
	assert.match(v.raison, /aucune entité/);
});
