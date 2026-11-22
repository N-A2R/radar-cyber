/**
 * RNA association qualification: one behaviour per test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	parseRnaCsvLine,
	rnaCandidate,
	rnaRowFromLine,
} from "../src/exposition/rna-site.js";

const NA = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

test("accepts an RNA row with a declared website", () => {
	assert.deepEqual(rnaCandidate({
		siret: "88319750100017",
		siteweb: "//les-ailes-chalaisiennes.com/",
		adrs_codepostal: "17230",
	}, NA), {
		siren: "883197501",
		website: "https://les-ailes-chalaisiennes.com",
		domain: "les-ailes-chalaisiennes.com",
		dept: "17",
	});
});

test("keeps semicolons and doubled quotes inside a CSV field", () => {
	assert.deepEqual(parseRnaCsvLine('"a;b";"c""d"'), ["a;b", 'c"d']);
});

test("maps a CSV line to its RNA header columns", () => {
	assert.deepEqual(rnaRowFromLine('"123";"https://example.fr"', ["siret", "siteweb"]), {
		siret: "123",
		siteweb: "https://example.fr",
	});
});
