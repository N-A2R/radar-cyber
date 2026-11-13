/**
 * Corroboration et contradiction : deux sources qui parlent du même fait.
 *
 * Les règles sont déterministes et doivent le rester : une contradiction mal
 * détectée se corrige dans le code, pas dans un prompt. Ce test fixe les trois
 * désaccords observables sur le corpus réel (gravité, nature, date) et vérifie
 * que le regroupement ne fabrique pas de faux positifs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	desaccords,
	FENETRE_GROUPE_MS,
	regrouper,
	resume,
	type EvenementCorroborable,
} from "../src/analyse/corroboration.js";

function evt(partiel: Partial<EvenementCorroborable> & { id: string; date: string }): EvenementCorroborable {
	return {
		family: "ransomware",
		severity: 4,
		assertionType: "third_party_claim",
		sourceId: "s1",
		orgId: 7,
		title: "Revendication",
		...partiel,
	};
}

test("deux sources le même jour, c'est un fait corroboré — pas deux faits", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "sudouest" }),
		evt({ id: "b", date: "2026-10-01T14:00:00Z", sourceId: "france3" }),
	]);
	assert.equal(groupes.length, 1);
	assert.equal(groupes[0]?.sourcesDistinctes, 2);
	assert.equal(groupes[0]?.force, "corrobore");
	// La première source est identifiée : c'est elle qui a révélé le fait.
	assert.equal(groupes[0]?.sources[0]?.sourceId, "sudouest");
	assert.equal(groupes[0]?.sources[1]?.delaiHeures, 6);
});

test("trois sources : le fait est établi", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "sudouest" }),
		evt({ id: "b", date: "2026-10-01T12:00:00Z", sourceId: "france3" }),
		evt({ id: "c", date: "2026-10-02T08:00:00Z", sourceId: "ouestfrance" }),
	]);
	assert.equal(groupes[0]?.force, "etabli");
	assert.equal(groupes[0]?.sourcesDistinctes, 3);
});

test("au-delà de la fenêtre, ce sont deux faits distincts", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z" }),
		evt({ id: "b", date: new Date(Date.parse("2026-10-01T08:00:00Z") + FENETRE_GROUPE_MS + 1000).toISOString() }),
	]);
	assert.equal(groupes.length, 2, "deux signalements à quatre jours d'écart ne sont pas le même fait");
});

test("deux familles différentes ne se regroupent pas", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", family: "ransomware" }),
		evt({ id: "b", date: "2026-10-01T09:00:00Z", family: "phishing" }),
	]);
	assert.equal(groupes.length, 2);
});

test("une source répétée ne corrobore rien", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "meme" }),
		evt({ id: "b", date: "2026-10-01T09:00:00Z", sourceId: "meme" }),
		evt({ id: "c", date: "2026-10-01T10:00:00Z", sourceId: "meme" }),
	]);
	assert.equal(groupes[0]?.sourcesDistinctes, 1);
	assert.equal(groupes[0]?.force, "isole");
	assert.equal(groupes[0]?.sources[0]?.evenements, 3);
});

test("désaccord de gravité : deux crans d'écart suffisent", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "a", severity: 5 }),
		evt({ id: "b", date: "2026-10-01T09:00:00Z", sourceId: "b", severity: 2 }),
	]);
	const conflits = desaccords(groupes);
	const gravite = conflits.find((c) => c.objet === "gravite");
	assert.ok(gravite, "une source parle d'incident majeur, l'autre d'un désagrément");
	assert.match(gravite.description, /2.*5|5.*2/);
});

test("désaccord de nature : confirmé contre revendiqué", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "presse", assertionType: "confirmed_incident" }),
		evt({ id: "b", date: "2026-10-01T09:00:00Z", sourceId: "ransomlook", assertionType: "third_party_claim" }),
	]);
	const nature = desaccords(groupes).find((c) => c.objet === "nature");
	assert.ok(nature, "c'est le désaccord le plus coûteux : rien ne dit que la revendication soit vraie");
	assert.ok(nature.positions.some((p) => p.valeur === "confirmé"));
	assert.ok(nature.positions.some((p) => p.valeur === "revendiqué"));
});

test("un écart de date à l'intérieur d'un groupe est structurellement impossible", () => {
	// C'était une règle de désaccord (« plus de sept jours d'écart »), et un
	// test a montré qu'elle ne pouvait jamais se déclencher : le regroupement
	// ferme à 72 h. On vérifie l'invariant plutôt que la règle morte.
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "a" }),
		evt({ id: "b", date: "2026-10-03T08:00:00Z", sourceId: "b" }),
	]);
	assert.equal(groupes.length, 1);
	const debut = Date.parse(groupes[0]?.debut ?? "");
	const fin = Date.parse(groupes[0]?.fin ?? "");
	assert.ok(fin - debut <= FENETRE_GROUPE_MS, "la fenêtre borne l'écart interne");
	assert.equal(desaccords(groupes).find((c) => (c.objet as string) === "date"), undefined);
});

test("une source seule ne produit aucun désaccord", () => {
	const groupes = regrouper([evt({ id: "a", date: "2026-10-01T08:00:00Z" })]);
	assert.deepEqual(desaccords(groupes), []);
});

test("le résumé compte les faits, pas les lignes", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "a" }),
		evt({ id: "b", date: "2026-10-01T09:00:00Z", sourceId: "b" }),
		evt({ id: "c", date: "2026-10-20T09:00:00Z", sourceId: "a" }),
	]);
	const r = resume(groupes, desaccords(groupes));
	assert.equal(r.faits, 2, "deux groupes, pas trois événements");
	assert.equal(r.evenements, 3);
	assert.equal(r.sources, 2);
	assert.equal(r.corrobores, 1);
	assert.equal(r.isoles, 1);
});

test("une date illisible est écartée plutôt que de fausser le groupe", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "pas une date" }),
		evt({ id: "b", date: "2026-10-01T08:00:00Z" }),
	]);
	assert.equal(groupes.length, 1);
	assert.equal(groupes[0]?.sourcesDistinctes, 1);
});

test("les faits sortent du plus récent au plus ancien", () => {
	// Mesuré sur un scénario réel : la fiche ouvrait sur un fait de 40 jours
	// avant de montrer celui de la veille.
	const groupes = regrouper([
		evt({ id: "vieux", date: "2026-09-20T08:00:00Z", family: "phishing", sourceId: "cert" }),
		evt({ id: "recent", date: "2026-11-10T08:00:00Z", family: "ransomware", sourceId: "presse" }),
		evt({ id: "milieu", date: "2026-10-15T08:00:00Z", family: "intrusion", sourceId: "presse" }),
	]);
	assert.deepEqual(
		groupes.map((g) => g.family),
		["ransomware", "intrusion", "phishing"],
	);
});

test("le délai d'une source n'est jamais négatif", () => {
	// Une source peut apparaître deux fois dans le groupe : la seconde ligne ne
	// doit pas produire un « -5 h après ».
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "premiere" }),
		evt({ id: "b", date: "2026-10-01T10:00:00Z", sourceId: "seconde" }),
		evt({ id: "c", date: "2026-10-01T06:00:00Z", sourceId: "seconde" }),
	]);
	for (const source of groupes[0]?.sources ?? []) {
		assert.ok(source.delaiHeures >= 0, `${source.sourceId} ne peut pas arriver avant le fait`);
	}
});

test("une source qui confirme puis nuance reste une confirmation", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "presse", assertionType: "confirmed_incident" }),
		evt({ id: "b", date: "2026-10-01T09:00:00Z", sourceId: "presse", assertionType: "ambient_signal" }),
		evt({ id: "c", date: "2026-10-01T07:00:00Z", sourceId: "autre", assertionType: "third_party_claim" }),
	]);
	const presse = groupes[0]?.sources.find((s) => s.sourceId === "presse");
	assert.equal(presse?.assertion, "confirmed_incident", "retenir la dernière ligne aurait effacé sa confirmation");
	const nature = desaccords(groupes).find((c) => c.objet === "nature");
	assert.ok(nature, "le désaccord doit rester visible");
});

test("une sévérité non renseignée ne fabrique pas un désaccord de gravité", () => {
	const groupes = regrouper([
		evt({ id: "a", date: "2026-10-01T08:00:00Z", sourceId: "a", severity: 5 }),
		evt({ id: "b", date: "2026-10-01T09:00:00Z", sourceId: "b", severity: null }),
	]);
	assert.deepEqual(desaccords(groupes), []);
});
