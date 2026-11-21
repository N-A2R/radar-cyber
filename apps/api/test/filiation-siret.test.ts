/**
 * Filiation extraction — one test per observable behaviour.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closePools, query } from "../src/db.js";
import { buildFiliationLinks, type FiliationOrg } from "../src/filiation/siret.js";
import { applyFiliationLinks, measureFiliation } from "../src/filiation/store.js";

const parent = (id: number, code = "025480401", dept = "79"): FiliationOrg => ({
	id, entityCode: code, entitySource: "sirene", dept, validTo: null,
});

const child = (id: number, code = "02548040100550", dept = "79"): FiliationOrg => ({
	id, entityCode: code, entitySource: "sirene-site", dept, validTo: null,
});
after(async () => {
	await closePools().catch(() => {});
});

test("an NA establishment links to its NA legal entity with public proof", () => {
	const links = buildFiliationLinks([parent(1), child(2)]);
	assert.equal(links.length, 1);
	assert.deepEqual(links[0], {
		childId: 2,
		parentId: 1,
		evidence: {
			method: "siren-prefix",
			source: "insee-sirene",
			childCode: "02548040100550",
			parentCode: "025480401",
			dataset: "insee-stock-etablissement-v3",
			url: "https://annuaire-entreprises.data.gouv.fr/entreprise/025480401",
		},
	});
});

test("an establishment outside Nouvelle-Aquitaine is not linked", () => {
	assert.deepEqual(buildFiliationLinks([parent(1), child(2, "02548040100550", "75")]), []);
});

test("a parent outside Nouvelle-Aquitaine, closed or from another dataset is not linked", () => {
	assert.deepEqual(buildFiliationLinks([parent(1, "025480401", "75"), child(2)]), []);
	assert.deepEqual(buildFiliationLinks([{ ...parent(1), validTo: "2025-01-01" }, child(2)]), []);
	assert.deepEqual(buildFiliationLinks([{ ...parent(1), entitySource: "sirene-ferme" }, child(2)]), []);
});

test("malformed identifiers and self-links are rejected", () => {
	assert.deepEqual(buildFiliationLinks([parent(1), child(2, "0254804")]), []);
	assert.deepEqual(buildFiliationLinks([parent(1), child(2, "02548040100abc")]), []);
	assert.deepEqual(buildFiliationLinks([parent(1, "025480401"), child(1, "02548040100001")]), []);
});

test("extraction is order-independent and emits one link per establishment", () => {
	const orgs = [child(3), parent(1), child(2), { ...child(2) }];
	const links = buildFiliationLinks(orgs);
	assert.deepEqual(links.map((link) => link.childId).sort(), [2, 3]);
	assert.deepEqual(buildFiliationLinks([...orgs].reverse()).map((link) => link.childId).sort(), [2, 3]);
});

test("evidence carries identifiers and a public URL, never victim data", () => {
	const [link] = buildFiliationLinks([parent(1), child(2)]);
	assert.deepEqual(Object.keys(link.evidence).sort(), [
		"childCode", "dataset", "method", "parentCode", "source", "url",
	]);
	assert.match(link.evidence.url, /^https:\/\/annuaire-entreprises\.data\.gouv\.fr\/entreprise\/\d{9}$/);
});

test("links persist with proof, are idempotent and are counted once", async () => {
	const code = String(Date.now()).slice(-9);
	const inserted = await Promise.all([
		query<{ id: number }>(
			`INSERT INTO org (name, slug, kind, status, dept, entity_code, entity_source)
			 VALUES ('Filiation Test Parent', $1, 'entreprise', 'confirme', '79', $2, 'sirene')
			 RETURNING id`,
			[`filiation-parent-${code}`, code],
		),
		query<{ id: number }>(
			`INSERT INTO org (name, slug, kind, status, dept, entity_code, entity_source)
			 VALUES ('Filiation Test Child', $1, 'entreprise', 'confirme', '79', $2, 'sirene-site')
			 RETURNING id`,
			[`filiation-child-${code}`, `${code}00001`],
		),
	]);
	const [parentId, childId] = inserted.map((result) => result.rows[0].id);
	try {
		const links = buildFiliationLinks([parent(parentId, code), child(childId, `${code}00001`)]);
		assert.equal(links.length, 1);
		assert.equal(await applyFiliationLinks(links), 1);
		assert.equal(await applyFiliationLinks(links), 0);

		const measure = await measureFiliation();
		assert.equal(measure.established, 1);
		assert.equal(measure.candidates, 1);
		assert.equal(measure.byDepartment["79"], 1);

		const stored = await query<{ method: string; parent: number }>(
			`SELECT parent_evidence->>'method' AS method, parent_org_id AS parent
			 FROM org WHERE id = $1`,
			[childId],
		);
		assert.deepEqual(stored.rows[0], { method: "siren-prefix", parent: parentId });
	} finally {
		await query("DELETE FROM org WHERE id = ANY($1::int[])", [[parentId, childId]]);
	}
});
