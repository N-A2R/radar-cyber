/**
 * Chargement du référentiel — contrôles en base.
 *
 * Ce qui est verrouillé ici : le rejeu ne crée pas de doublon, le SIREN rattache
 * à l'existant au lieu de dupliquer, et le travail humain (nom saisi) n'est pas
 * écrasé par un rechargement.
 *
 * Isolation : plan synthétique à slugs préfixés, supprimé dans `after`. Le jeu
 * réel de 4 462 organisations n'est pas chargé par les tests.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { loadReferentiel } from "../src/referentiel/load.js";
import type { PlannedOrg, ReferentielPlan } from "../src/referentiel/plan.js";

const TAG = `ref${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const createdSlugs: string[] = [];
const createdOrgIds: number[] = [];

function org(overrides: Partial<PlannedOrg> = {}): PlannedOrg {
	const suffix = overrides.entityCode ?? "00001";
	const slug = overrides.slug ?? `${TAG}-commune-${suffix}`;
	const name = overrides.name ?? `Commune de Test ${suffix}`;
	return {
		slug,
		name,
		kind: "collectivite",
		sector: "commune",
		city: `Test ${suffix}`,
		dept: "33",
		siren: null,
		lat: 44.8,
		lon: -0.58,
		geoSource: "test",
		status: "confirme",
		entityCode: suffix,
		codesPostaux: ["33000"],
		population: 1000,
		aliases: [
			{ alias: name, source: "test" },
			{ alias: `Mairie de Test ${suffix}`, source: "test" },
		],
		...overrides,
	};
}

function planOf(orgs: PlannedOrg[]): ReferentielPlan {
	for (const item of orgs) createdSlugs.push(item.slug);
	return {
		orgs,
		counts: {
			orgs: orgs.length,
			aliases: orgs.reduce((n, o) => n + o.aliases.length, 0),
			communes: orgs.length,
			epci: 0,
			departements: 0,
			regions: 0,
			enfantsRattaches: 0,
			sansCoordonnees: 0,
			sansSiren: orgs.filter((o) => o.siren === null).length,
		},
		warnings: [],
	};
}

after(async () => {
	if (createdSlugs.length) {
		const rows = await query<{ id: number }>("SELECT id FROM org WHERE slug = ANY($1::text[])", [createdSlugs]);
		for (const row of rows.rows) createdOrgIds.push(Number(row.id));
	}
	if (createdOrgIds.length) {
		await query("DELETE FROM org_alias WHERE org_id = ANY($1::int[])", [createdOrgIds]);
		await query("DELETE FROM org WHERE id = ANY($1::int[])", [createdOrgIds]);
	}
	await closePools();
});

test("dry-run : rien n'est écrit", async () => {
	const plan = planOf([org({ entityCode: "10001" })]);
	const report = await loadReferentiel(plan, { dryRun: true });
	assert.equal(report.dryRun, true);
	assert.equal(report.created, 1);
	assert.equal(report.aliasesInserted, 0);
	const r = await query<{ n: string }>("SELECT count(*)::text AS n FROM org WHERE slug = $1", [plan.orgs[0].slug]);
	assert.equal(r.rows[0].n, "0", "le dry-run ne doit rien insérer");
});

test("chargement puis rejeu : aucun doublon d'organisation ni d'alias", async () => {
	const plan = planOf([org({ entityCode: "10002" }), org({ entityCode: "10003" })]);
	const first = await loadReferentiel(plan, { dryRun: false });
	assert.equal(first.created, 2);
	assert.equal(first.aliasesInserted, 4);

	const second = await loadReferentiel(plan, { dryRun: false });
	assert.equal(second.created, 0, "le rejeu ne crée rien");
	assert.equal(second.updated, 2);
	assert.equal(second.aliasesInserted, 0, "les alias existent déjà");

	const orgs = await query<{ n: string }>("SELECT count(*)::text AS n FROM org WHERE slug = ANY($1::text[])", [plan.orgs.map((o) => o.slug)]);
	assert.equal(orgs.rows[0].n, "2");
	const ids = await query<{ id: number }>("SELECT id FROM org WHERE slug = ANY($1::text[])", [plan.orgs.map((o) => o.slug)]);
	const aliases = await query<{ n: string }>("SELECT count(*)::text AS n FROM org_alias WHERE org_id = ANY($1::int[])", [ids.rows.map((r) => Number(r.id))]);
	assert.equal(aliases.rows[0].n, "4");
});

test("SIREN commun : rattachement à l'organisation existante, pas de doublon", async () => {
	const siren = `9${Math.floor(Math.random() * 89999999 + 10000000)}`;
	const humanSlug = `${TAG}-humain`;
	createdSlugs.push(humanSlug);
	const existing = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, siren, status) VALUES ($1,$2,'collectivite',$3,'confirme') RETURNING id`,
		[`Mairie saisie à la main ${TAG}`, humanSlug, siren],
	);
	const humanId = Number(existing.rows[0].id);
	createdOrgIds.push(humanId);

	const plan = planOf([org({ entityCode: "10004", siren, name: `Commune de Test 10004` })]);
	const report = await loadReferentiel(plan, { dryRun: false });
	assert.equal(report.attachedBySiren, 1);
	assert.equal(report.created, 0);

	const r = await query<{ id: number; name: string; lat: number | null; city: string | null }>(
		"SELECT id, name, lat, city FROM org WHERE siren = $1",
		[siren],
	);
	assert.equal(r.rows.length, 1, "une seule organisation pour ce SIREN");
	assert.equal(Number(r.rows[0].id), humanId);
	assert.equal(r.rows[0].name, `Mairie saisie à la main ${TAG}`, "le nom humain est conservé");
	assert.equal(Number(r.rows[0].lat), 44.8, "la géométrie manquante est complétée");
	assert.equal(r.rows[0].city, "Test 10004", "la ville manquante est complétée");

	const aliases = await query<{ n: string }>("SELECT count(*)::text AS n FROM org_alias WHERE org_id = $1", [humanId]);
	assert.equal(aliases.rows[0].n, "2", "les alias vont à l'organisation existante");
});

test("rechargement : un nom corrigé par un analyste n'est pas écrasé", async () => {
	const plan = planOf([org({ entityCode: "10005" })]);
	await loadReferentiel(plan, { dryRun: false });
	const corrected = `Nom corrigé ${TAG}`;
	await query("UPDATE org SET name = $1 WHERE slug = $2", [corrected, plan.orgs[0].slug]);
	await loadReferentiel(plan, { dryRun: false });
	const r = await query<{ name: string }>("SELECT name FROM org WHERE slug = $1", [plan.orgs[0].slug]);
	assert.equal(r.rows[0].name, corrected);
});
