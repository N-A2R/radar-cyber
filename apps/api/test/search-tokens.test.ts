/** Pure tokenization rules shared by the global-search route. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchText, searchTokens } from "../src/search/tokens.js";

test("accents are folded to their ASCII base letters", () => {
	assert.equal(normalizeSearchText("Hôpital de l'Étang À Évry"), "hopital de l'etang a evry");
});

test("short words and French function words are dropped", () => {
	assert.deepEqual(searchTokens("de la hopital et"), ["hopital"]);
});

test("punctuation and SQL wildcards are turned into plain tokens", () => {
	assert.deepEqual(searchTokens("100% sûreté_à"), ["100", "surete"]);
});

test("repeated words are emitted once", () => {
	assert.deepEqual(searchTokens("rennes rennes hopital"), ["rennes", "hopital"]);
});

test("at most eight tokens reach the bounded candidate sets", () => {
	const tokens = searchTokens("un deux trois quatre cinq six sept huit neuf dix");
	assert.equal(tokens.length, 8);
	assert.deepEqual(tokens, ["deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"]);
});
