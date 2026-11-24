/**
 * Comportements observables du regroupement multi-organismes et de sa mesure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluerCampagnes } from "../src/analyse/campaign-quality.js";
import { analyserCampagnes, type EvenementCampagne } from "../src/analyse/campagnes.js";

function revendication(
	id: number,
	observation: string,
	victime: number,
	claimedAt: string,
	groupe = "cactus",
): EvenementCampagne {
	return {
		id,
		family: "ransomware",
		title: `victime ${victime} — revendiqué par ${groupe}`,
		observedAt: observation,
		sourceId: "ransomlook",
		sourceUrl: null,
		orgId: victime,
		sector: null,
		evidence: { claimed_at: claimedAt },
	};
}
test("deux victimes du même acteur dans le même mois forment une campagne", () => {
	const analyse = analyserCampagnes([
		revendication(1, "2026-11-01T10:00:00Z", 11, "2026-11-02"),
		revendication(2, "2026-11-25T10:00:00Z", 12, "2026-11-25"),
	]);
	assert.equal(analyse.campagnes.length, 1);
	assert.deepEqual(analyse.campagnes[0]?.incidents, [1, 2]);
	assert.equal(analyse.campagnes[0]?.preuve.liens[0]?.motif, "groupe-mois:cactus:2026-11");
});

test("deux revendications de la même victime ne forment pas une campagne mensuelle", () => {
	const analyse = analyserCampagnes([
		revendication(1, "2026-11-01T10:00:00Z", 11, "2026-11-02"),
		revendication(2, "2026-11-25T10:00:00Z", 11, "2026-11-25"),
	]);
	assert.equal(analyse.campagnes.length, 0);
});

test("le mois de revendication, pas celui de collecte, décide du lien", () => {
	const analyse = analyserCampagnes([
		revendication(1, "2026-11-01T10:00:00Z", 11, "2026-10-02"),
		revendication(2, "2026-11-25T10:00:00Z", 12, "2026-10-25"),
	]);
	assert.equal(analyse.campagnes.length, 1);
	assert.equal(analyse.campagnes[0]?.preuve.liens[0]?.motif, "groupe-mois:cactus:2026-10");
});

test("une campagne multi-organismes ne franchit pas la frontière du mois civil", () => {
	const analyse = analyserCampagnes([
		revendication(1, "2026-05-28T10:00:00Z", 11, "2026-05-28"),
		revendication(2, "2026-06-05T10:00:00Z", 12, "2026-06-05"),
	]);
	assert.equal(analyse.campagnes.length, 0);
});

test("la mesure valide deux campagnes annotées retrouvées à l'identique", () => {
	const evenements = [
		revendication(1, "2026-11-01T10:00:00Z", 11, "2026-11-01"),
		revendication(2, "2026-11-02T10:00:00Z", 12, "2026-11-02"),
		revendication(3, "2026-12-01T10:00:00Z", 13, "2026-12-01"),
		revendication(4, "2026-12-02T10:00:00Z", 14, "2026-12-02"),
	];
	const campagnes = analyserCampagnes(evenements).campagnes;
	assert.equal(campagnes.length, 2);
	const mesure = evaluerCampagnes(evenements, campagnes, [
		{
			acteur: "cactus",
			mois: "2026-11",
			incidents: [1, 2],
			organisations: 2,
			famille: "ransomware",
		},
		{
			acteur: "cactus",
			mois: "2026-12",
			incidents: [3, 4],
			organisations: 2,
			famille: "ransomware",
		},
	]);
	assert.deepEqual(
		{ tp: mesure.tp, fp: mesure.fp, fn: mesure.fn },
		{ tp: 2, fp: 0, fn: 0 },
	);
});


test("une campagne qui fusionne deux annotations est un faux positif et deux faux négatifs", () => {
	const evenements = [
		revendication(1, "2026-11-01T10:00:00Z", 11, "2026-11-01"),
		revendication(2, "2026-11-02T10:00:00Z", 12, "2026-11-02"),
		revendication(3, "2026-11-03T10:00:00Z", 13, "2026-11-03"),
		revendication(4, "2026-11-04T10:00:00Z", 14, "2026-11-04"),
	];
	const campagnes = analyserCampagnes(evenements).campagnes;
	assert.equal(campagnes.length, 1);
	const mesure = evaluerCampagnes(evenements, campagnes, [
		{
			acteur: "cactus",
			mois: "2026-11",
			incidents: [1, 2],
			organisations: 2,
			famille: "ransomware",
		},
		{
			acteur: "cactus",
			mois: "2026-12",
			incidents: [3, 4],
			organisations: 2,
			famille: "ransomware",
		},
	]);
	assert.deepEqual(
		{ tp: mesure.tp, fp: mesure.fp, fn: mesure.fn },
		{ tp: 0, fp: 1, fn: 2 },
	);
});