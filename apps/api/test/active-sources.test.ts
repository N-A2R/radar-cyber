/**
 * Behavior tests for the versioned active-source corpus.
 * No network and no database: inputs are synthetic, the corpus is read offline.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
	OUTPUT,
	build,
	countActiveSources,
	normalizeUrl,
	type VerifiedSource,
} from "../../../scripts/generer-sources-actives.mts";

const PROOF = {
	http_status: 200,
	verifie_le: "2026-11-21",
	url_finale: "https://lycee-test.fr/",
	extrait: "Site du lycée test — actualités et pédagogie",
	jetons_trouves: ["test"],
	methode: "GET HTTP 200 and discriminant token",
};

function proofRow(overrides: Record<string, unknown> = {}): string {
	const { preuve, ...rest } = overrides;
	const proof = preuve && typeof preuve === "object" ? preuve as Record<string, unknown> : {};
	return JSON.stringify({
		nom: "Lycée Test",
		departement: "33",
		url: "https://lycee-test.fr/",
		url_preuve: "https://lycee-test.fr/",
		preuve: { ...PROOF, ...proof },
		...rest,
	});
}

function urlRow(url: string, overrides: Record<string, unknown> = {}): string {
	return proofRow({ url, url_preuve: url, ...overrides });
}

function buildFrom(...lines: string[]) {
	return build([{ file: "institutions-complet.jsonl", lines }]);
}

function committedSources(): VerifiedSource[] {
	return readFileSync(fileURLToPath(new URL("../../../bench/corpus/sources-na-1000.jsonl", import.meta.url)), "utf8")
		.split("\n")
		.filter((line) => line.trim().length > 0)
		.map((line) => JSON.parse(line) as VerifiedSource);
}

test("HTTP 200 institutional rows become sources with a visible-text item", () => {
	const { sources, rejected } = buildFrom(proofRow(), proofRow({ preuve: { http_status: 404 } }));
	assert.equal(sources.length, 1);
	assert.equal(sources[0]?.preuve.http_status, 200);
	assert.match(sources[0]?.item.extrait ?? "", /lycée test/);
	assert.equal(sources[0]?.item.date, "2026-11-21");
	assert.equal(rejected.length, 1);
	assert.equal(rejected[0]?.motif, "not_verified_na");
});

test("only Nouvelle-Aquitaine departments are retained", () => {
	const { sources, rejected } = buildFrom(
		urlRow("https://lycee-a.fr/"),
		urlRow("https://lycee-b.fr/", { departement: "75" }),
		urlRow("https://lycee-c.fr/", { departement: "Gironde" }),
	);
	assert.equal(sources.length, 2);
	assert.ok(sources.every((source) => source.departement === "33"));
	assert.equal(rejected.length, 1);
});

test("records naming or quoting victims are rejected", () => {
	const { sources, rejected } = buildFrom(
		proofRow({ nom: "Victime M. Dupont" }),
		proofRow({ preuve: { extrait: "La victime a été prise en charge" } }),
	);
	assert.equal(sources.length, 0);
	assert.deepEqual(rejected.map((row) => row.motif), ["personal_data", "personal_data"]);
});
test("duplicate URLs collapse to one source", () => {
	const { sources } = buildFrom(
		urlRow("https://www.lycee-test.fr/?a=1"),
		urlRow("http://lycee-test.fr/"),
	);
	assert.equal(sources.length, 1);
	assert.equal(
		normalizeUrl("https://www.lycee-test.fr/?a=1"),
		normalizeUrl("http://lycee-test.fr/"),
	);
});

test("the builder honours an explicit limit", () => {
	const { sources } = build(
		[{ file: "institutions-complet.jsonl", lines: [
			urlRow("https://lycee-a.fr/"),
			urlRow("https://lycee-b.fr/"),
			urlRow("https://lycee-c.fr/"),
		] }],
		2,
	);
	assert.equal(sources.length, 2);
});

test("the counter ignores non-200 proofs and empty items", () => {
	const good = buildFrom(proofRow()).sources[0];
	assert.ok(good);
	const notVerified = { ...good, preuve: { ...good.preuve, http_status: 404 } };
	const emptyItem = { ...good, item: { titre: "", date: null, extrait: "" } };
	assert.equal(countActiveSources([good, notVerified, emptyItem]), 1);
});

test("the committed corpus holds at least 1000 active sources", () => {
	const sources = committedSources();
	assert.ok(sources.length >= 1000, `${sources.length} sources in the corpus`);
	assert.equal(countActiveSources(sources), sources.length);
});

test("the committed corpus stays inside Nouvelle-Aquitaine without duplicates or victim data", () => {
	const sources = committedSources();
	const departments: Record<string, true> = {
		"16": true, "17": true, "19": true, "23": true, "24": true, "33": true,
		"40": true, "47": true, "64": true, "79": true, "86": true, "87": true,
	};
	assert.ok(sources.every((source) => departments[source.departement] === true));
	assert.equal(new Set(sources.map((source) => normalizeUrl(source.url))).size, sources.length);
	assert.ok(!sources.some((source) => /\b(victime|victims?|sinistré|M\.|Mme|Monsieur|Madame)\b/i
		.test(`${source.nom} ${source.item.extrait}`)));
});
