/**
 * Le « pourquoi » d'un rattachement : conservé, relisible, honnête.
 *
 * Le journal disait « aucun rattachement retenu » pour quatre situations très
 * différentes — texte vide, aucun alias, ambiguïté refusée, index indisponible.
 * La fiche d'un événement ne pouvait donc rien expliquer, et un analyste ne
 * pouvait pas distinguer « on n'a pas trouvé » de « on n'a pas pu chercher ».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	depuisEvidence,
	estIndisponible,
	libelleMotif,
	versEvidence,
	type ExplicationRattachement,
} from "../src/journal/rattachement.js";

const base: ExplicationRattachement = {
	moteur: "gazetteer@2",
	motif: "alias-distinctif",
	alias: "chu de bordeaux",
	confiance: 0.9,
};

test("une explication fait l'aller-retour par la preuve", () => {
	const evidence = { feed: "Sud Ouest", rattachement: versEvidence(base) };
	const relue = depuisEvidence(evidence);
	assert.ok(relue);
	assert.equal(relue.motif, "alias-distinctif");
	assert.equal(relue.alias, "chu de bordeaux");
	assert.equal(relue.confiance, 0.9);
});

test("les candidats à égalité sont conservés", () => {
	const ambigu: ExplicationRattachement = {
		moteur: "gazetteer@2",
		motif: "ambigu",
		alias: "residence du parc",
		confiance: 0,
		candidats: [
			{ id: 12, name: "Résidence du Parc (Niort)" },
			{ id: 13, name: "Résidence du Parc (Angoulême)" },
		],
	};
	const relue = depuisEvidence({ rattachement: versEvidence(ambigu) });
	assert.ok(relue);
	assert.equal(relue.candidats?.length, 2);
});

test("un index indisponible n'est pas un échec de rattachement", () => {
	const indisponible: ExplicationRattachement = {
		moteur: "gazetteer@2",
		motif: "aucun",
		alias: null,
		confiance: 0,
		indisponible: true,
	};
	const relue = depuisEvidence({ rattachement: versEvidence(indisponible) });
	assert.ok(relue);
	assert.equal(estIndisponible(relue), true);
	assert.equal(estIndisponible({ motif: "aucun" }), false);
});

test("une preuve d'avant le chantier ne casse rien", () => {
	// Les événements ingérés avant n'ont pas d'explication : la fiche doit
	// pouvoir le dire sans planter.
	assert.equal(depuisEvidence({ feed: "CERT-FR" }), null);
	assert.equal(depuisEvidence(null), null);
	assert.equal(depuisEvidence("chaine"), null);
	assert.equal(depuisEvidence({ rattachement: { motif: 12 } }), null);
});

test("chaque motif connu a un libellé qui dit pourquoi, pas combien", () => {
	for (const motif of [
		"alias-role",
		"alias-distinctif",
		"departement",
		"commune",
		"lieu-contredit",
		"ambigu",
		"ambiant",
		"aucun",
		"fuzzy",
	]) {
		const libelle = libelleMotif(motif);
		assert.ok(!libelle.startsWith("motif non documenté"), `${motif} sans libellé`);
		assert.ok(!/\d/.test(libelle), `${motif} : un libellé ne porte pas de score`);
	}
	// Un motif inconnu reste visible au lieu de disparaître.
	assert.match(libelleMotif("motif-du-futur"), /motif-du-futur/);
});
