/**
 * Référentiel territorial — contrôles sans base de données.
 *
 * Deux niveaux : les règles de dérivation d'alias, puis le plan complet sur le
 * vrai jeu versionné (4 462 organisations). Le dernier bloc vérifie que le
 * référentiel se comporte correctement **dans le moteur de rattachement** :
 * homonymes refusés, piège de sous-chaîne évité.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	communeAliases,
	departementAliases,
	departementName,
	epciAliases,
	epciName,
	regionAliases,
} from "../src/referentiel/aliases.js";
import { planReferentiel } from "../src/referentiel/plan.js";
import type { ReferentielNA } from "../src/referentiel/model.js";
import { analyzeAliasIndex, buildAliasIndex, normalize } from "../src/match/core.js";

const data = JSON.parse(
	readFileSync(new URL("../../../db/data/referentiel-na.json", import.meta.url), "utf8"),
) as ReferentielNA;
const plan = planReferentiel(data);

test("alias de commune : nom nu, formes institutionnelles, contractions, élision", () => {
	const aliases = communeAliases("Bordeaux");
	assert.ok(aliases.includes("Bordeaux"));
	assert.ok(aliases.includes("Mairie de Bordeaux"));
	assert.ok(aliases.includes("Commune de Bordeaux"));
	assert.ok(aliases.includes("Ville de Bordeaux"));

	const contracted = communeAliases("Le Bouscat");
	assert.ok(contracted.includes("Mairie du Bouscat"), "« de Le » doit devenir « du »");
	assert.ok(contracted.includes("Commune du Bouscat"));

	const plural = communeAliases("Les Églisottes-et-Chalaures");
	assert.ok(plural.some((a) => a.startsWith("Mairie des ")), "« de Les » doit devenir « des »");

	const elided = communeAliases("Agen");
	assert.ok(elided.includes("Mairie d'Agen"), "élision devant voyelle attendue");
	assert.ok(elided.includes("Mairie de Agen"), "forme non élidée conservée aussi");
});

test("abréviations Saint/Sainte : seulement sous forme institutionnelle", () => {
	const aliases = communeAliases("Saint-Médard-en-Jalles");
	assert.ok(aliases.includes("Commune de St-Médard-en-Jalles"));
	assert.ok(aliases.includes("Mairie de St-Médard-en-Jalles"));
	// Une abréviation nue entrerait en collision avec d'autres communes.
	assert.ok(!aliases.includes("St-Médard-en-Jalles"), "pas d'abréviation nue");
	assert.ok(!aliases.includes("St-Médard"), "pas de troncature abusive");
});

test("commune déléguée : son nom devient un alias du parent", () => {
	const aliases = communeAliases("Aigre", ["Aigre", "Ambérac"]);
	assert.ok(aliases.includes("Ambérac"));
	assert.ok(aliases.includes("Mairie d'Ambérac"));
	assert.equal(aliases.filter((a) => a === "Aigre").length, 1, "pas de doublon avec le parent");
});

test("EPCI : le type abrégé est développé en nom complet", () => {
	assert.equal(
		epciName("CA du Grand Villeneuvois", "CA"),
		"Communauté d'agglomération du Grand Villeneuvois",
	);
	assert.equal(epciName("CC des Coteaux Bordelais", "CC"), "Communauté de communes des Coteaux Bordelais");
	assert.equal(epciName("CU de Bordeaux", "CU"), "Communauté urbaine de Bordeaux");
	assert.equal(epciName("Métropole de Bordeaux", "METRO"), "Métropole de Bordeaux");
	// Le mot distinctif peut être en fin de nom : ne pas doubler le libellé.
	assert.equal(epciName("Bordeaux Métropole", "METRO"), "Bordeaux Métropole");
	const aliases = epciAliases("CA du Grand Villeneuvois", "CA");
	assert.ok(aliases.includes("CA du Grand Villeneuvois"), "forme courte d'origine conservée");
	assert.ok(aliases.includes("Grand Villeneuvois"), "cœur du nom sans article");
});

test("départements : l'article contracté est le bon", () => {
	assert.equal(departementName("Gironde", "33"), "Département de la Gironde");
	assert.equal(departementName("Landes", "40"), "Département des Landes");
	assert.equal(departementName("Lot-et-Garonne", "47"), "Département du Lot-et-Garonne");
	assert.equal(departementName("Deux-Sèvres", "79"), "Département des Deux-Sèvres");
	const aliases = departementAliases("Gironde", "33");
	assert.ok(aliases.includes("Conseil départemental de la Gironde"));
	assert.ok(aliases.includes("CD33"));
	assert.ok(regionAliases("Nouvelle-Aquitaine").includes("Conseil régional de Nouvelle-Aquitaine"));
});

test("plan réel : 4 462 organisations, toutes géocodées", () => {
	assert.equal(plan.counts.communes, 4293);
	assert.equal(plan.counts.epci, 156);
	assert.equal(plan.counts.departements, 12);
	assert.equal(plan.counts.regions, 1);
	assert.equal(plan.counts.orgs, 4462);
	assert.equal(plan.counts.sansCoordonnees, 0, "toute organisation doit être géocodée");
	assert.equal(plan.counts.enfantsRattaches, 224);
	assert.equal(plan.counts.sansSiren, 13, "12 départements + la région, sans SIREN inventé");
	assert.ok(plan.counts.aliases > 20000);
});

test("plan réel : chaque organisation porte son propre nom en alias", () => {
	// buildAliasIndex n'indexe que org_alias : sans cet invariant, des
	// organisations entières seraient invisibles au rattachement.
	for (const org of plan.orgs) {
		assert.ok(
			org.aliases.some((a) => normalize(a.alias) === normalize(org.name)),
			`${org.slug} n'a pas son nom dans ses alias`,
		);
	}
});

test("plan réel : slugs uniques, alias uniques par organisation", () => {
	const slugs = new Set<string>();
	for (const org of plan.orgs) {
		assert.ok(!slugs.has(org.slug), `slug en doublon : ${org.slug}`);
		slugs.add(org.slug);
		const keys = org.aliases.map((a) => a.alias.toLowerCase());
		assert.equal(new Set(keys).size, keys.length, `alias en doublon chez ${org.slug}`);
	}
});

test("plan réel : Bordeaux, Limoges, Pau, Poitiers sont là et bien placés", () => {
	const expectations: Array<[string, number, number]> = [
		["Bordeaux", 44.84, -0.58],
		["Limoges", 45.83, 1.26],
		["Pau", 43.3, -0.37],
		["Poitiers", 46.58, 0.34],
	];
	for (const [name, lat, lon] of expectations) {
		const org = plan.orgs.find((o) => o.slug.startsWith("na-commune-") && o.city === name);
		assert.ok(org, `${name} absent du référentiel`);
		assert.ok(Math.abs((org.lat ?? 0) - lat) < 0.15, `latitude de ${name} aberrante : ${org.lat}`);
		assert.ok(Math.abs((org.lon ?? 0) - lon) < 0.15, `longitude de ${name} aberrante : ${org.lon}`);
		assert.match(org.siren ?? "", /^\d{9}$/, `${name} sans SIREN valide`);
	}
});

test("parent absent du jeu : avertissement, pas de crash ni d'org fantôme", () => {
	const broken: ReferentielNA = {
		...data,
		communes: [
			{ ...data.communes[0], parent: "99999", code: "99998", nom: "Orpheline" },
		],
		epci: [],
		departements: [],
	};
	const result = planReferentiel(broken);
	assert.equal(result.counts.communes, 0);
	assert.ok(result.warnings.some((w) => w.includes("parent 99999 absent")));
});

// --- comportement dans le moteur de rattachement, à l'échelle réelle ---------

const rows = plan.orgs.flatMap((org, index) =>
	org.aliases.map((a) => ({ org_id: index + 1, name: org.name, alias: a.alias })),
);
const index = buildAliasIndex(rows);
const idOf = (slug: string) => plan.orgs.findIndex((o) => o.slug === slug) + 1;

test("échelle réelle : une commune se rattache par sa mairie", () => {
	// Pessac est sans homonyme dans la région ; Mérignac existe dans deux
	// départements, le moteur doit justement s'y abstenir (test plus bas).
	const analysis = analyzeAliasIndex(index, "La mairie de Pessac a été visée par un rançongiciel");
	assert.equal(analysis.match?.orgId, idOf("na-commune-33318"));
	assert.equal(analysis.reason, "matched");
});

test("échelle réelle : le piège de sous-chaîne est évité", () => {
	// « Saint-Médard » existe aussi : le plus long doit gagner.
	const analysis = analyzeAliasIndex(
		index,
		"Un incident confirmé à la mairie de Saint-Médard-en-Jalles",
	);
	assert.equal(analysis.match?.orgId, idOf("na-commune-33449"));
});

test("échelle réelle : un nom communal homonyme est refusé, pas deviné", () => {
	const homonyms = plan.orgs.filter((o) => o.sector === "commune" && o.city === "Mazerolles");
	assert.ok(homonyms.length >= 2, "le jeu doit contenir plusieurs Mazerolles");
	const analysis = analyzeAliasIndex(index, "La mairie de Mazerolles a été touchée");
	assert.equal(analysis.match, null, "homonyme : le moteur doit s'abstenir");
	assert.ok(analysis.tied.length >= 2, "les candidats à égalité doivent être exposés");
});

test("échelle réelle : nom nu sans contexte institutionnel n'attache pas", () => {
	const analysis = analyzeAliasIndex(index, "Un orage est passé sur Bordeaux hier soir");
	assert.equal(analysis.match, null, "un nom de ville seul ne suffit pas à rattacher un incident");
});
