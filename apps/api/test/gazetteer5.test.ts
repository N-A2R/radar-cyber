/**
 * Un alias d'un seul mot peut désigner une marque — pas seulement un lieu.
 *
 * La garde de gazetteer@3 écartait de l'index de décision tout alias d'un seul
 * jeton sans rôle d'établissement, au motif qu'un mot seul est un nom de lieu.
 * Vrai pour « Pau », faux pour « Ymed », « Weda », « Cdiscount » : la mesure de
 * couverture du 17 novembre 2026 comptait cinq incidents « présents au
 * référentiel mais non reconnus » dont l'organisation était en base, avec son
 * alias actif, uniquement à cause de cette règle.
 *
 * La règle devient : un alias d'un seul mot n'est écarté que s'il est ambigu
 * (plusieurs organisations le portent) ou s'il est le nom d'un territoire du
 * référentiel.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGazetteer, resoudre, type GazetteerRow } from "../src/match/gazetteer.js";

function ligne(partiel: Partial<GazetteerRow> & { org_id: number; alias: string; name: string }): GazetteerRow {
	return {
		kind: "entreprise",
		dept: null,
		city: null,
		sector: "commerce",
		source: "usage",
		...partiel,
	} as GazetteerRow;
}

test("une marque d'un seul mot tranche quand elle est unique au référentiel", () => {
	const gaz = buildGazetteer([ligne({ org_id: 1, name: "YMED", alias: "Ymed" })]);
	const r = resoudre(gaz, "Ymed, éditeur de la plateforme Sooncare, victime d'une intrusion");
	assert.equal(r.org?.id, 1, "l'alias unique « Ymed » doit désigner l'organisation");
});

test("une marque portée par plusieurs organisations reste ambiguë, donc écartée", () => {
	const gaz = buildGazetteer([
		ligne({ org_id: 1, name: "INTERMARCHE GRADIGNAN", alias: "intermarche", city: "Gradignan" }),
		ligne({ org_id: 2, name: "INTERMARCHE MARMANDE", alias: "intermarche", city: "Marmande" }),
	]);
	const r = resoudre(gaz, "Une cyberattaque frappe l'intermarché du coin");
	assert.equal(r.org, null, "deux porteurs : aucun ne peut trancher");
});

test("un alias d'un seul mot qui est le nom d'un territoire ne rattache rien", () => {
	const gaz = buildGazetteer([
		ligne({ org_id: 1, name: "Pau", alias: "Pau", sector: "commune", kind: "collectivite" }),
		ligne({ org_id: 2, name: "PALOIS DISTRIBUTION", alias: "Pau" }),
	]);
	const r = resoudre(gaz, "Le réseau de la ville de Pau a été coupé");
	assert.notEqual(r.org?.id, 2, "l'alias « Pau » ne doit pas désigner une entreprise");
});
