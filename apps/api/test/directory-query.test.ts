/**
 * Annuaire serveur — contrôles en base : pagination, facettes, recherche.
 *
 * Isolation : organisations jetables à slugs préfixés, supprimées dans `after`.
 * Les facettes sont le point délicat : les compteurs d'une dimension doivent
 * rester calculés hors du filtre de cette dimension, sinon changer de
 * département vide la liste des départements.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { query, closePools } from "../src/db.js";
import { queryDirectory } from "../src/directory/query.js";

const TAG = `dir${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const slugs: string[] = [];
const orgIds: number[] = [];

type Seed = { name: string; city: string; dept: string; sector?: string; aliases?: string[]; events?: number };

async function seed(spec: Seed): Promise<number> {
	const slug = `${TAG}-${slugs.length}`;
	slugs.push(slug);
	const r = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, sector, city, dept, status)
		 VALUES ($1,$2,'collectivite',$3,$4,$5,'confirme') RETURNING id`,
		[spec.name, slug, spec.sector ?? "commune", spec.city, spec.dept],
	);
	const id = Number(r.rows[0].id);
	orgIds.push(id);
	for (const alias of spec.aliases ?? [spec.name]) {
		await query("INSERT INTO org_alias (org_id, alias, source) VALUES ($1,$2,'test') ON CONFLICT DO NOTHING", [id, alias]);
	}
	const source = await query<{ id: string }>("SELECT id FROM source ORDER BY id LIMIT 1");
	for (let i = 0; i < (spec.events ?? 0); i++) {
		await query(
			`INSERT INTO event (dedup_key, family, assertion_type, title, severity, source_id, geo_type, org_id)
			 VALUES ($1,'ransomware','confirmed_incident',$2,4,$3,'entity_location',$4)`,
			[`${slug}-e${i}`, `Incident ${spec.name}`, source.rows[0].id, id],
		);
	}
	return id;
}

let pessacId = 0;
let ready = false;

async function fixtures(): Promise<void> {
	if (ready) return;
	pessacId = await seed({
		name: `Commune de Pessac ${TAG}`,
		city: `Pessac ${TAG}`,
		dept: "33",
		aliases: [`Commune de Pessac ${TAG}`, `Mairie de Pessac ${TAG}`, `Pessac ${TAG}`],
		events: 3,
	});
	await seed({ name: `Commune de Mérignac ${TAG}`, city: `Mérignac ${TAG}`, dept: "33", events: 1 });
	await seed({ name: `Commune de Mazerolles ${TAG}`, city: `Mazerolles ${TAG}`, dept: "33" });
	await seed({ name: `Commune de Mazerolles ${TAG}`, city: `Mazerolles ${TAG}`, dept: "16", events: 2 });
	await seed({ name: `CA du Test ${TAG}`, city: `Test ${TAG}`, dept: "47", sector: "epci" });
	ready = true;
}

after(async () => {
	if (orgIds.length) {
		await query("DELETE FROM event WHERE org_id = ANY($1::int[])", [orgIds]);
		await query("DELETE FROM org_alias WHERE org_id = ANY($1::int[])", [orgIds]);
		await query("DELETE FROM org WHERE id = ANY($1::int[])", [orgIds]);
	}
	await closePools();
});

/** Restreint chaque assertion aux organisations du test. */
function mine<T extends { slug: string }>(rows: readonly T[]): T[] {
	return rows.filter((row) => row.slug.startsWith(TAG));
}

test("pagination : total stable, pages disjointes, limite respectée", async () => {
	await fixtures();
	const first = await queryDirectory({ q: TAG, limit: 2, page: 0 });
	const second = await queryDirectory({ q: TAG, limit: 2, page: 1 });
	assert.equal(first.rows.length, 2);
	assert.equal(first.total, 5);
	assert.equal(second.total, first.total);
	const ids = new Set([...first.rows, ...second.rows].map((r) => r.id));
	assert.equal(ids.size, 4, "les pages ne se recouvrent pas");
	const beyond = await queryDirectory({ q: TAG, limit: 2, page: 99 });
	assert.equal(beyond.rows.length, 0);
	assert.equal(beyond.total, 5, "le total ne dépend pas de la page demandée");
});

test("sans recherche : filtres, tri et facettes côté serveur", async () => {
	await fixtures();
	const all = await queryDirectory({ dept: "33", limit: 200, sort: "name" });
	const ours = mine(all.rows);
	assert.equal(ours.length, 3);
	assert.ok(ours.every((o) => o.dept === "33"));

	const byEvents = await queryDirectory({ dept: "33", limit: 200, sort: "eventCount", dir: "desc" });
	const mineByEvents = mine(byEvents.rows);
	assert.equal(mineByEvents[0].id, pessacId, "la plus active d'abord");

	// La facette département ne doit pas se réduire au département filtré.
	const depts = all.facets.dept.map((f) => f.value);
	assert.ok(depts.includes("16") && depts.includes("47"), `facette département trop étroite : ${depts.join(",")}`);
	// Chaque facette n'ignore que son propre filtre : la facette secteur
	// reste soumise au département, sinon les compteurs mentiraient.
	const sectors = all.facets.sector.map((f) => f.value);
	assert.ok(sectors.includes("commune"));
	assert.ok(!sectors.includes("epci"), "l'EPCI est en 47, il ne doit pas compter dans le 33");
	const withoutDept = await queryDirectory({ limit: 200 });
	assert.ok(withoutDept.facets.sector.some((f) => f.value === "epci" && f.count > 0));
});

test("recherche par alias : « mairie de … » trouve la commune", async () => {
	await fixtures();
	const result = await queryDirectory({ q: `mairie de pessac ${TAG}` });
	assert.equal(result.rows[0]?.id, pessacId);
	assert.equal(result.rows[0]?.reason, "exact-alias");
	assert.ok(result.rows[0]?.matchedAlias?.startsWith("Mairie de Pessac"));
});

test("recherche tolérante : une lettre en trop est rattrapée", async () => {
	await fixtures();
	// Le préfixe de quatre caractères ouvre le filet, le flou départage.
	const result = await queryDirectory({ q: `Pesssac ${TAG}` });
	assert.ok(result.rows.some((r) => r.id === pessacId), "la faute de frappe doit retrouver Pessac");
});

test("avec événements : le filtre ne garde que les organisations actives", async () => {
	await fixtures();
	const result = await queryDirectory({ q: TAG, withEvents: true, limit: 200 });
	assert.equal(result.total, 3);
	assert.ok(result.rows.every((row) => row.eventCount > 0));
});

test("les jokers saisis sont des littéraux, pas des motifs SQL", async () => {
	await fixtures();
	const wildcard = await queryDirectory({ q: "%" });
	assert.equal(mine(wildcard.rows).length, 0, "« % » ne doit pas tout faire remonter");
	// Huit « _ » : comme joker SQL, cela matcherait tous les noms ; comme
	// littéral, aucun. On teste l'échappement, pas le filet flou (qui, lui,
	// rattrape légitimement une saisie proche d'un nom de ville).
	const underscore = await queryDirectory({ q: "________", limit: 200 });
	assert.equal(mine(underscore.rows).length, 0, "« _ » ne doit pas servir de joker SQL");
});

test("facettes avec recherche : chaque dimension reste ouverte", async () => {
	await fixtures();
	const result = await queryDirectory({ q: `Mazerolles ${TAG}`, dept: "33" });
	assert.equal(result.total, 1, "le filtre département s'applique aux résultats");
	const depts = result.facets.dept.map((f) => f.value);
	assert.ok(depts.includes("16"), "la facette département doit montrer l'autre homonyme");
	assert.equal(result.facets.dept.find((f) => f.value === "16")?.count, 1);
});

test("résultat vide : pas d'erreur, facets vides, total nul", async () => {
	await fixtures();
	const result = await queryDirectory({ q: `${TAG}zzzzintrouvable` });
	assert.equal(result.total, 0);
	assert.deepEqual(result.rows, []);
	assert.deepEqual(result.facets.dept, []);
});
