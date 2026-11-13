import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGazetteer, type GazetteerRow } from "../src/match/gazetteer.js";
import { resoudreAvecVersion, DEPLOIEMENTS, moteurActifA, VERSIONS_CONNUES } from "../src/match/versions.js";

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

test("les versions connues sont documentées et datées", () => {
	assert.ok(VERSIONS_CONNUES.includes("gazetteer@1"));
	assert.ok(VERSIONS_CONNUES.includes("gazetteer@2"));
	assert.ok(Date.parse(DEPLOIEMENTS["gazetteer@1"]) < Date.parse(DEPLOIEMENTS["gazetteer@2"]));
});

test("moteurActifA distingue l'époque", () => {
	assert.equal(moteurActifA("2024-06-01", "gazetteer"), "gazetteer@1");
	assert.equal(moteurActifA("2025-11-01", "gazetteer"), "gazetteer@2");
	assert.equal(moteurActifA("2025-10-14", "gazetteer"), "gazetteer@1");
	assert.equal(moteurActifA("2025-10-16", "gazetteer"), "gazetteer@2");
});

test("gazetteer@2 départage sur le département, @1 reste ambigu", () => {
	const gaz = gazetteerDeTest();
	// Deux EHPAD homonymes, le texte cite le département 64 — V2 tranche, V1 non
	const texte = "EHPAD Résidence du Parc à Bayonne (Pyrénées-Atlantiques, 64) victime d'un rançongiciel";
	const v2 = resoudreAvecVersion(gaz, texte, "gazetteer@2");
	const v1 = resoudreAvecVersion(gaz, texte, "gazetteer@1");
	// V2 doit départager par département
	assert.equal(v2.org?.id, 5, "gazetteer@2 départage par département 64");
	// V1 ne départage pas — ambigu ou premier venu
	assert.ok(v1.org === null || v1.org.id === 5 || v1.org.id === 6, "V1 ambiguous or arbitrary");
	if (v1.org === null) assert.equal(v1.reason, "ambigu");
});

test("gazetteer@2 refuse un lieu-contredit, @1 ne sait pas le faire", () => {
	const gaz = gazetteerDeTest();
	const texte = "Mairie de Bordeaux (Ohio) piratée";
	const v2 = resoudreAvecVersion(gaz, texte, "gazetteer@2");
	const v1 = resoudreAvecVersion(gaz, texte, "gazetteer@1");
	assert.equal(v2.org, null);
	assert.equal(v2.reason, "lieu-contredit");
	// V1 ne connaît pas lieu-contredit
	assert.notEqual(v1.reason, "lieu-contredit");
});

test("rejouer avec l'ancien moteur redonne l'état de l'époque", () => {
	const avant = moteurActifA("2025-10-10", "gazetteer");
	const apres = moteurActifA("2025-11-10", "gazetteer");
	assert.equal(avant, "gazetteer@1");
	assert.equal(apres, "gazetteer@2");
	// Le texte "ville de tarnos" est un rôle — V1 est ambigu entre Ville et
	// Commune (même nom court), V2 tranche par le rôle
	const gaz = gazetteerDeTest();
	const texte = "ville de tarnos victime";
	const a = resoudreAvecVersion(gaz, texte, avant);
	const b = resoudreAvecVersion(gaz, texte, apres);
	assert.equal(a.org, null, "V1 reste ambigu entre les deux Tarnos");
	assert.equal(a.reason, "ambigu");
	assert.ok(b.org !== null, "V2 tranche par le rôle");
	assert.equal(b.org?.id, 1);
});
