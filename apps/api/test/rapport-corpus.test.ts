/**
 * Rapport de progression du corpus : un test par comportement observable.
 * Aucune base requise : l'agrégation, l'historique et le rendu sont purs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	HORS_NA,
	ajouterIncident,
	ajouterOrganisation,
	ajouterSnapshot,
	ajouterSource,
	ecrireHistorique,
	lireHistorique,
	rendreRapport,
	recomposerTotal,
	snapshotVide,
	type Snapshot,
} from "../src/analyse/rapport-corpus.js";
import { DEPT_LABELS } from "../src/collectors/relevance.js";

const DEPTS = ["16", "17", HORS_NA];
const LIBELLES = { "16": "charente", "17": "charente-maritime", [HORS_NA]: "hors NA" };

function rapport(snapshot: Snapshot, precedent: Snapshot | null = null): string {
	return rendreRapport(snapshot, precedent, DEPTS, LIBELLES, "docs/historique.json");
}

test("une source alimente son département et sa famille sans double compte", () => {
	const snapshot = snapshotVide("2026-11-21", DEPTS);
	const maintenant = Date.now();
	ajouterSource(snapshot, "16", "cti", 2, maintenant, maintenant);
	ajouterSource(snapshot, "16", "cti", 0, maintenant - 8 * 86_400_000, maintenant);
	recomposerTotal(snapshot);

	assert.deepEqual(snapshot.depts["16"], {
		declarees: 2,
		productives: 1,
		rouges: 1,
		orgsAvecDomaine: 0,
		incidents: 0,
	});
	assert.deepEqual(snapshot.familles["cti"], snapshot.depts["16"]);
	assert.equal(snapshot.total.declarees, 2);
});

test("un incident est compté dans son département et sa famille, une seule fois par ligne", () => {
	const snapshot = snapshotVide("2026-11-21", DEPTS);
	ajouterIncident(snapshot, "16", "fuite");
	ajouterIncident(snapshot, "16", "fuite");
	ajouterIncident(snapshot, "17", "ransomware");
	ajouterOrganisation(snapshot, "16", "sans-famille");
	recomposerTotal(snapshot);

	assert.equal(snapshot.depts["16"]!.incidents, 2);
	assert.equal(snapshot.familles["fuite"]!.incidents, 2);
	assert.equal(snapshot.depts["16"]!.orgsAvecDomaine, 1);
	assert.equal(snapshot.total.incidents, 3);
	assert.equal(snapshot.total.orgsAvecDomaine, 1);
});

test("l'historique JSON est relu et conserve les trente derniers snapshots", () => {
	const snapshots = Array.from({ length: 31 }, (_, i) =>
		snapshotVide(`2026-11-${String((i % 28) + 1).padStart(2, "0")}`, DEPTS),
	);
	const texte = ecrireHistorique(snapshots);
	const relus = lireHistorique(texte);
	assert.equal(relus.length, 31);
	assert.equal(JSON.parse(texte).version, 1);

	const suivant = snapshotVide("2026-11-30", DEPTS);
	const ajoutes = ajouterSnapshot(relus, suivant);
	assert.equal(ajoutes.length, 30);
	assert.deepEqual(ajoutes.at(-1), suivant);
});

test("un historique corrompu est signalé au lieu d'être lu comme une série vide", () => {
	assert.throws(() => lireHistorique("{"), /historique JSON illisible/);
	assert.throws(() => lireHistorique('{"snapshots":[{"date":"qui"},{}]}'), /historique JSON invalide/);
});

test("le second rapport affiche des deltas nuls sur toutes les lignes", () => {
	const precedent = snapshotVide("2026-11-21", DEPTS);
	ajouterSource(precedent, "16", "cti", 1, Date.now(), Date.now());
	ajouterIncident(precedent, "16", "fuite");
	recomposerTotal(precedent);
	const courant = structuredClone(precedent);

	const markdown = rapport(courant, precedent);
	assert.match(markdown, /\| Sources déclarées \| 1 \(0\) \| 0 \|/);
	assert.match(markdown, /\| 16 — charente \| 1 \(0\) \| 1 \(0\) \| 0 \(0\) \| 0 \(0\) \| 1 \(0\) \|/);
	assert.doesNotMatch(markdown, /\(\+| \(-/);
});

test("la conclusion tient en une phrase et porte les cinq chiffres", () => {
	const courant = snapshotVide("2026-11-22", DEPTS);
	ajouterSource(courant, "16", "cti", 1, Date.now(), Date.now());
	ajouterOrganisation(courant, "16", "sans-famille");
	ajouterIncident(courant, "17", "fuite");
	recomposerTotal(courant);
	const precedent = snapshotVide("2026-11-21", DEPTS);

	const conclusion = rapport(courant, precedent)
		.split("\n")
		.filter((ligne) => ligne.startsWith("**Conclusion**"));
	assert.equal(conclusion.length, 1);
	assert.equal(conclusion[0]!.endsWith("."), true);
	assert.equal((conclusion[0]!.match(/\./g) ?? []).length, 1);
	for (const chiffre of ["déclarées 1", "productives 1", "rouges 0", "organisations avec domaine 1", "incidents du corpus 1"]) {
		assert.ok(conclusion[0]!.includes(chiffre), `conclusion sans ${chiffre}`);
	}
});

test("le rapport généré déclare l'objectif de couverture et la mesure", () => {
	const depts = Object.keys(DEPT_LABELS);
	const markdown = rendreRapport(
		snapshotVide("2026-11-22", depts),
		null,
		depts,
		DEPT_LABELS,
		"docs/historique.json",
	);
	assert.match(markdown, /Mesure reproductible : `pnpm mesure:corpus-progression --check`/);
	assert.match(
		markdown,
		/OBJECTIF : atteint — 12 \/ 12 départements de Nouvelle-Aquitaine couverts par 5 indicateurs \(60 \/ 60 cellules\)/,
	);
});
