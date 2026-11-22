/**
 * Semantic organisation duplicates: one test per detector behaviour.
 *
 * The pure rules run without a database; the final test exercises the
 * measurement CLI end to end against the fresh test database.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../src/db.js";
import {
	canonicalKey,
	computePrecision,
	detectSemanticDuplicates,
	samplePairs,
	type SemanticOrgRow,
} from "../src/dedup/semantic-duplicates.js";

const SCRIPT = fileURLToPath(new URL("../../../scripts/semantic-duplicates.mts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const PREFIX = `semdup-${Date.now()}`;

function row(input: Partial<SemanticOrgRow> & { id: number; name: string }): SemanticOrgRow {
	return {
		city: "Bordeaux",
		dept: "33",
		siren: null,
		entitySource: "sirene",
		...input,
	};
}

after(async () => {
	await query("DELETE FROM org WHERE slug LIKE $1", [`${PREFIX}%`]).catch(() => {});
	await closePools().catch(() => {});
});

test("canonical key folds accents, case and punctuation", () => {
	assert.equal(canonicalKey("École Élémentaire — Bordeaux!"), "bordeaux ecole elementaire");
	assert.equal(canonicalKey("école élémentaire  de BORDEAUX"), "bordeaux ecole elementaire");
});

test("canonical key expands institutional synonyms", () => {
	assert.equal(
		canonicalKey("CHU de Bordeaux"),
		canonicalKey("Centre Hospitalier Universitaire de Bordeaux"),
	);
	assert.equal(canonicalKey("Mairie de Jarnac"), canonicalKey("Commune de Jarnac"));
	assert.equal(canonicalKey("UNIV de Poitiers"), canonicalKey("Université de Poitiers"));
});

test("canonical key removes legal forms and word order", () => {
	assert.equal(canonicalKey("SELARL Pharmacie Saint-Louis"), canonicalKey("Pharmacie Saint Louis"));
	assert.equal(canonicalKey("Pharmacie des Cèdres"), canonicalKey("Cèdres pharmacie"));
});

test("two sources describing the same key produce one pair in one group", () => {
	const result = detectSemanticDuplicates([
		row({ id: 1, name: "Pharmacie des Cèdres", entitySource: "sirene" }),
		row({ id: 2, name: "Pharmacie Cèdres", entitySource: "finess" }),
	]);
	assert.equal(result.pairs.length, 1);
	assert.equal(result.groups.length, 1);
	assert.deepEqual(result.groups[0]!.memberIds, [1, 2]);
	assert.equal(result.pairs[0]!.signals.includes("canonical-key"), true);
});

test("pair identities do not depend on PostgreSQL row order", () => {
	const first = row({ id: 11, name: "Pharmacie des Cèdres", entitySource: "sirene" });
	const second = row({ id: 22, name: "Pharmacie Cèdres", entitySource: "finess" });
	const forward = detectSemanticDuplicates([first, second]);
	const backward = detectSemanticDuplicates([second, first]);
	assert.deepEqual(forward.pairs.map((pair) => pair.id), backward.pairs.map((pair) => pair.id));
	assert.equal(forward.pairs[0]!.left.id, 11);
});

test("identical normalized names stay out of the semantic detector", () => {
	const result = detectSemanticDuplicates([
		row({ id: 1, name: "Pharmacie Saint-Louis", entitySource: "sirene" }),
		row({ id: 2, name: "PHARMACIE SAINT LOUIS", entitySource: "finess" }),
	]);
	assert.equal(result.pairs.length, 0);
});

test("conflicting SIRENs are never paired", () => {
	const result = detectSemanticDuplicates([
		row({ id: 1, name: "Pharmacie Centrale", siren: "111111111", entitySource: "sirene" }),
		row({ id: 2, name: "Pharmacie Centrale", siren: "222222222", entitySource: "finess" }),
	]);
	assert.equal(result.pairs.length, 0);
});

test("same source, other city, CEDEX and generic keys are rejected", () => {
	const result = detectSemanticDuplicates([
		row({ id: 1, name: "Pharmacie Centrale", entitySource: "sirene" }),
		row({ id: 2, name: "Pharmacie Centrale", entitySource: "sirene" }),
		row({ id: 3, name: "Pharmacie Centrale", entitySource: "finess", city: "Limoges" }),
		row({ id: 4, name: "Pharmacie Centrale", entitySource: "finess", city: "CEDEX" }),
		row({ id: 5, name: "Chatellerault", entitySource: "finess" }),
		row({ id: 6, name: "GIE de Chatellerault", entitySource: "sirene-site" }),
		row({ id: 7, name: "Pharmacie Centrale", entitySource: "finess", dept: "75" }),
	]);
	assert.equal(result.pairs.length, 0);
});

test("sample selection is stable for a seed", () => {
	const rows = Array.from({ length: 30 }, (_, index) => [
		row({ id: index * 2 + 1, name: `Pharmacie ${index} Centre`, entitySource: "sirene" }),
		row({ id: index * 2 + 2, name: `Centre pharmacie ${index}`, entitySource: "finess" }),
	]).flat();
	const detected = detectSemanticDuplicates(rows);
	const first = samplePairs(detected.pairs, 5, 42);
	assert.equal(detected.pairs.length, 30);
	assert.deepEqual(first.map((pair) => pair.id), samplePairs(detected.pairs, 5, 42).map((pair) => pair.id));
	assert.equal(first.length, 5);
});

test("precision counts uncertain verdicts as false positives", () => {
	const detected = detectSemanticDuplicates([
		row({ id: 1, name: "Pharmacie des Cèdres", entitySource: "sirene" }),
		row({ id: 2, name: "Pharmacie Cèdres", entitySource: "finess" }),
		row({ id: 3, name: "École des Lilas", entitySource: "sirene" }),
		row({ id: 4, name: "École Lilas", entitySource: "finess" }),
	]);
	const [first, second] = detected.pairs;
	assert.ok(first && second);
	const precision = computePrecision(detected.pairs, {
		[first.id]: "same",
		[second.id]: "uncertain",
		"pair-not-in-sample": "same",
	});
	assert.deepEqual(precision, {
		verified: 2,
		truePositive: 1,
		falsePositive: 1,
		uncertain: 1,
		unknownVerdicts: 1,
		precision: 0.5,
	});
});

test("measurement CLI reports the count without writing to the database", async () => {
	const names = [
		{ id: 1, name: `${PREFIX} Pharmacie des Tilleuls`, source: "sirene" },
		{ id: 2, name: `${PREFIX} Pharmacie Tilleuls`, source: "finess" },
		{ id: 3, name: `${PREFIX} Pharmacie Tilleuls`, source: "sirene-site", dept: "75" },
	];
	for (const item of names) {
		await query(
			`INSERT INTO org (name, slug, kind, city, dept, entity_source)
			 VALUES ($1, $2, 'sante', 'Bordeaux', $3, $4)`,
			[item.name, `${PREFIX}-${item.id}`, item.dept ?? "33", item.source],
		);
	}

	const directory = mkdtempSync(join(tmpdir(), "semantic-dedup-"));
	const output = join(directory, "report.json");
	execFileSync(TSX, [SCRIPT, `--json=${output}`], { encoding: "utf8" });
	const report = JSON.parse(readFileSync(output, "utf8")) as {
		scope: { departments: number; eligibleRows: number };
		detected: { pairs: number; groups: number };
		pairs: Array<{ left: { name: string }; right: { name: string } }>;
	};
	assert.equal(report.scope.departments, 12);
	assert.equal(report.detected.pairs, 1);
	assert.equal(report.detected.groups, 1);
	assert.match(report.pairs[0]!.left.name, new RegExp(PREFIX));
	assert.ok(report.scope.eligibleRows >= 2);
	assert.equal((await query("SELECT id FROM org WHERE slug LIKE $1", [`${PREFIX}%`])).rows.length, 3);
});
