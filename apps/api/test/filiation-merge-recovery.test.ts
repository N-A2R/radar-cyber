/**
 * Recovery of SIRET establishments absorbed by organisation deduplication —
 * one test per observable behaviour.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	planRecovery,
	type LegalEntityRow,
	type MergeAliasRow,
} from "../src/filiation/merge-recovery.js";

const parent = (overrides: Partial<LegalEntityRow> = {}): LegalEntityRow => ({
	id: 100,
	entityCode: "382799021",
	entitySource: "sirene",
	dept: "64",
	name: "LA COUPOLE BIARRITZ",
	city: "Biarritz",
	validTo: null,
	...overrides,
});

const alias = (overrides: Partial<MergeAliasRow> = {}): MergeAliasRow => ({
	survivorId: 123124,
	slug: "la-coupole-biarritz-38279902100029",
	siret: "38279902100029",
	...overrides,
});

test("a merged SIRET establishment is recovered with its NA legal entity", () => {
	assert.deepEqual(planRecovery([alias()], [parent({ id: 123124 })], []), [
		{
			survivorId: 123124,
			slug: "la-coupole-biarritz-38279902100029",
			siret: "38279902100029",
			parentId: 123124,
			name: "LA COUPOLE BIARRITZ (SIRET 38279902100029)",
			dept: "64",
			city: "Biarritz",
		},
	]);
});

test("a merged establishment without an active NA legal entity is skipped", () => {
	assert.deepEqual(planRecovery([alias()], [parent({ validTo: "2025-01-01" })], []), []);
	assert.deepEqual(planRecovery([alias()], [parent({ dept: "75" })], []), []);
	assert.deepEqual(planRecovery([alias()], [parent({ entitySource: "sirene-ferme" })], []), []);
	assert.deepEqual(planRecovery([alias({ siret: "38279902100abc" })], [parent()], []), []);
});

test("recovery is idempotent and emits only public organisation fields", () => {
	assert.deepEqual(planRecovery([alias()], [parent()], ["38279902100029"]), []);
	assert.equal(planRecovery([alias(), alias()], [parent()], []).length, 1);
	const [row] = planRecovery([alias()], [parent()], []);
	assert.deepEqual(Object.keys(row).sort(), [
		"city", "dept", "name", "parentId", "siret", "slug", "survivorId",
	]);
	assert.doesNotMatch(JSON.stringify(row), /victim|email|phone/i);
});
