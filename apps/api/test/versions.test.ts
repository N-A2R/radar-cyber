import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGazetteer, type GazetteerRow } from "../src/match/gazetteer.js";
import {
	MOTEUR_RATTACHEMENT,
	VERSIONS_HISTORIQUES,
	decrireVersion,
	resoudreAvecVersion,
	DEPLOIEMENTS,
	moteurActifA,
	VERSIONS_CONNUES,
} from "../src/match/versions.js";

function gazetteerDeTest() {
	const rows: GazetteerRow[] = [
		{ org_id: 1, name: "Ville de Tarnos", kind: "collectivite", dept: "40", city: "Tarnos", sector: "commune", alias: "ville de tarnos" },
		{ org_id: 2, name: "Commune de Tarnos", kind: "collectivite", dept: "40", city: "Tarnos", sector: "commune", alias: "commune de tarnos" },
		{ org_id: 3, name: "Mairie de Bordeaux", kind: "collectivite", dept: "33", city: "Bordeaux", sector: "commune", alias: "mairie de bordeaux" },
		{ org_id: 4, name: "Bordeaux Métropole", kind: "collectivite", dept: "33", city: "Bordeaux", sector: "epci", alias: "bordeaux metropole" },
		{ org_id: 5, name: "EHPAD Résidence du Parc", kind: "sante", dept: "64", city: "Bayonne", sector: "ehpad", alias: "ehpad residence du parc" },
		{ org_id: 6, name: "EHPAD Résidence du Parc", kind: "sante", dept: "40", city: "Dax", sector: "ehpad", alias: "ehpad residence du parc" },
	];
	return buildGazetteer(rows);
}

test("les versions rejouables sont documentées et datées", () => {
	assert.equal(MOTEUR_RATTACHEMENT, "gazetteer@4");
	assert.ok(VERSIONS_CONNUES.includes("gazetteer@1"));
	assert.ok(VERSIONS_CONNUES.includes(MOTEUR_RATTACHEMENT));
	assert.ok(Date.parse(DEPLOIEMENTS["gazetteer@1"]) < Date.parse(DEPLOIEMENTS[MOTEUR_RATTACHEMENT]));
});

test("moteurActifA distingue l'époque", () => {
	assert.equal(moteurActifA("2024-06-01", "gazetteer"), "gazetteer@1");
	assert.equal(moteurActifA("2025-11-01", "gazetteer"), "gazetteer@2");
	assert.equal(moteurActifA("2025-10-14", "gazetteer"), "gazetteer@1");
	assert.equal(moteurActifA("2025-10-16", "gazetteer"), "gazetteer@2");
	assert.equal(moteurActifA("2026-11-16", "gazetteer"), MOTEUR_RATTACHEMENT);
});

test("le moteur courant départage sur le département, @1 reste ambigu", () => {
	const gaz = gazetteerDeTest();
	const texte = "EHPAD Résidence du Parc à Bayonne (Pyrénées-Atlantiques, 64) victime d'un rançongiciel";
	const courant = resoudreAvecVersion(gaz, texte);
	const v1 = resoudreAvecVersion(gaz, texte, "gazetteer@1");
	assert.equal(courant.org?.id, 5);
	assert.ok(v1.org === null || v1.org.id === 5 || v1.org.id === 6);
	if (v1.org === null) assert.equal(v1.reason, "ambigu");
});

test("le moteur courant refuse un lieu-contredit, @1 ne sait pas le faire", () => {
	const gaz = gazetteerDeTest();
	const texte = "Mairie de Bordeaux (Ohio) piratée";
	const courant = resoudreAvecVersion(gaz, texte);
	const v1 = resoudreAvecVersion(gaz, texte, "gazetteer@1");
	assert.equal(courant.org, null);
	assert.equal(courant.reason, "lieu-contredit");
	assert.notEqual(v1.reason, "lieu-contredit");
});

test("rejouer @2/@3 échoue explicitement au lieu d'exécuter @4", () => {
	const gaz = gazetteerDeTest();
	const texte = "ville de tarnos victime";
	assert.equal(resoudreAvecVersion(gaz, texte, "gazetteer@1").org, null);
	assert.equal(resoudreAvecVersion(gaz, texte, MOTEUR_RATTACHEMENT).org?.id, 1);
	for (const version of VERSIONS_HISTORIQUES) {
		assert.equal(VERSIONS_CONNUES.includes(version), false);
		assert.throws(
			() => resoudreAvecVersion(gaz, texte, version),
			new RegExp(`${version} n'est pas rejouable`),
		);
		assert.match(decrireVersion(version), /non rejouable/);
	}
});
