/**
 * One test per context behavior added to the organization resolver.
 *
 * The gazetteer index alone cannot tell a victim from a sponsor, a company
 * from a place, or a typo from a different name. These cases pin each of those
 * decisions; the A3 benchmark measures their combined effect on the annotated
 * article corpus.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGazetteer, resoudre, type GazetteerRow } from "../src/match/gazetteer.js";

function row(org_id: number, alias: string, extra: Partial<GazetteerRow> = {}): GazetteerRow {
	return {
		org_id,
		alias,
		name: alias,
		kind: "entreprise",
		dept: null,
		city: null,
		sector: null,
		...extra,
	};
}

test("a unique one-word brand resolves when the text names a company", () => {
	const gaz = buildGazetteer([row(1, "Lectra")]);
	const match = resoudre(gaz, "La société Lectra confirme un incident");
	assert.equal(match.org?.id, 1);
});

test("a one-word brand without an organization cue stays unattributed", () => {
	const gaz = buildGazetteer([row(1, "Lectra")]);
	assert.equal(resoudre(gaz, "Lectra reste à quai ce matin").org, null);
});

test("a territorial role resolves when the institution is the subject", () => {
	const gaz = buildGazetteer([
		row(12, "Département de la Gironde", { kind: "collectivite", dept: "33", sector: "departement" }),
	]);
	const match = resoudre(gaz, "Le Département de la Gironde victime d'une fuite");
	assert.equal(match.org?.id, 12);
});

test("a territorial role is not a victim when it follows a relation word", () => {
	const gaz = buildGazetteer([
		row(12, "Département de la Gironde", { kind: "collectivite", dept: "33", sector: "departement" }),
	]);
	assert.equal(resoudre(gaz, "Une entreprise du Département de la Gironde victime d'une fuite").org, null);
});

test("near-miss aliases recover the named organization", () => {
	const gaz = buildGazetteer([
		row(1, "CHU de Bordeaux", { kind: "sante" }),
		row(3, "Université de Poitiers", { kind: "enseignement" }),
	]);
	const hospital = resoudre(gaz, "Le CHU de Bordeau confirme une attaque");
	assert.equal(hospital.org?.id, 1);
	assert.equal(hospital.reason, "fuzzy");
	assert.equal(resoudre(gaz, "L'université de Poitier signale des comptes compromis").org?.id, 3);
});

test("a benign mention is not an organization attribution", () => {
	const gaz = buildGazetteer([row(37, "Orange Nouvelle-Aquitaine")]);
	const match = resoudre(gaz, "Orange Nouvelle-Aquitaine sponsorise un salon régional");
	assert.equal(match.org, null);
	assert.equal(match.reason, "ambiant");
});

test("the first of two distinct named organizations wins", () => {
	const gaz = buildGazetteer([
		row(2, "Université de Bordeaux", { kind: "enseignement" }),
		row(1, "CHU de Bordeaux", { kind: "sante" }),
	]);
	const match = resoudre(gaz, "L'Université de Bordeaux et le CHU de Bordeaux coordonnent leur réponse");
	assert.equal(match.org?.id, 2);
});

test("an alias shared by two organizations stays ambiguous", () => {
	const gaz = buildGazetteer([
		row(31, "Clinique Saint-Jean", { kind: "sante" }),
		row(32, "Clinique Saint-Jean", { kind: "sante" }),
	]);
	const match = resoudre(gaz, "La Clinique Saint-Jean visée par une exfiltration");
	assert.equal(match.org, null);
	assert.equal(match.reason, "ambigu");
});

test("an internal swap in a later token recovers the organization", () => {
	const gaz = buildGazetteer([row(3, "Université de Poitiers", { kind: "enseignement" })]);
	assert.equal(resoudre(gaz, "L'université de Poiteirs signale une fuite").org?.id, 3);
});

test("an internal swap in the first token recovers the organization", () => {
	const gaz = buildGazetteer([row(3, "Université de Poitiers", { kind: "enseignement" })]);
	assert.equal(resoudre(gaz, "L'univeristé de Poitiers confirme une intrusion").org?.id, 3);
});

test("an internal extra letter recovers the organization", () => {
	const gaz = buildGazetteer([row(21, "Cofinoga")]);
	assert.equal(resoudre(gaz, "Cofinooga signalée dans une fuite").org?.id, 21);
});

test("a near miss on a different name stays unattributed", () => {
	const gaz = buildGazetteer([row(1, "CHU de Bordeaux", { kind: "sante" })]);
	const match = resoudre(gaz, "Le CHU de Bordelais confirme une attaque");
	assert.equal(match.org, null);
	assert.equal(match.reason, "aucun");
});
