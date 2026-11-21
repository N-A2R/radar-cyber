/**
 * Jeu de régression du moteur de couverture : six cas synthétiques qui couvrent
 * chaque motif et les deux délais de détection. Les motifs sont écrits en clair
 * dans les attentes : renommer un motif, ou faire glisser une règle de
 * classement, doit faire échouer ce test.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	classerCouverture,
	MOTIFS_COUVERTURE,
	type FaitCouverture,
} from "../src/analyse/couverture.js";

const PUBLICATION = "2026-11-01";

const collecte = (date: string) => ({ date });
const rattache = (date: string, correct = true) => ({ orgId: "org-1", date, correct });

const cas: ReadonlyArray<{
	nom: string;
	fait: FaitCouverture;
	motif: string;
	delaiJours: number | null;
}> = [
	{
		nom: "vu le jour même",
		fait: {
			id: "vu-jour-meme",
			datePublication: PUBLICATION,
			collecte: collecte(PUBLICATION),
			jugeCyber: true,
			rattachement: rattache(PUBLICATION),
		},
		motif: "vu",
		delaiJours: 0,
	},
	{
		nom: "vu en retard de 5 jours",
		fait: {
			id: "vu-retard-5j",
			datePublication: PUBLICATION,
			collecte: collecte("2026-11-02"),
			jugeCyber: true,
			rattachement: rattache("2026-11-06"),
		},
		motif: "vu",
		delaiJours: 5,
	},
	{
		nom: "pas rattaché",
		fait: {
			id: "pas-rattache",
			datePublication: PUBLICATION,
			collecte: collecte(PUBLICATION),
			jugeCyber: true,
			rattachement: null,
		},
		motif: "pas_rattache",
		delaiJours: null,
	},
	{
		nom: "pas collecté",
		fait: {
			id: "pas-collecte",
			datePublication: PUBLICATION,
			collecte: null,
			jugeCyber: true,
			rattachement: null,
		},
		motif: "pas_collecte",
		delaiJours: null,
	},
	{
		nom: "pas jugé cyber",
		fait: {
			id: "pas-juge-cyber",
			datePublication: PUBLICATION,
			collecte: collecte(PUBLICATION),
			jugeCyber: false,
			rattachement: null,
		},
		motif: "pas_juge_cyber",
		delaiJours: null,
	},
	{
		nom: "faux positif",
		fait: {
			id: "faux-positif",
			datePublication: PUBLICATION,
			collecte: collecte(PUBLICATION),
			jugeCyber: true,
			rattachement: rattache(PUBLICATION, false),
		},
		motif: "faux_positif",
		delaiJours: null,
	},
];

describe("moteur de couverture — six cas synthétiques", () => {
	for (const { nom, fait, motif, delaiJours } of cas) {
		it(nom, () => {
			const resultat = classerCouverture(fait);
			assert.equal(resultat.id, fait.id);
			assert.equal(resultat.motif, motif);
			assert.equal(resultat.delaiJours, delaiJours);
		});
	}

	it("les motifs restent exactement ceux de la mesure", () => {
		assert.deepEqual(Object.values(MOTIFS_COUVERTURE), [
			"vu",
			"pas_collecte",
			"pas_rattache",
			"pas_juge_cyber",
			"faux_positif",
		]);
	});

	it("la répartition des six cas ne bouge pas", () => {
		assert.deepEqual(
			cas.map(({ fait }) => classerCouverture(fait).motif),
			["vu", "vu", "pas_rattache", "pas_collecte", "pas_juge_cyber", "faux_positif"],
		);
	});
});
