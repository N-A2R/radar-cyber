/** One behaviour per test: derivation of the measurable figure. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	extractAmount,
	extractAwardees,
	groupContracts,
	isCyberObject,
	isNaDepartments,
	measureContracts,
	safeNoticeKeys,
	type ContractNotice,
} from "../src/procurement/cyber-contracts.js";

const notice = (overrides: Partial<ContractNotice>): ContractNotice => ({
	id: "n1",
	date: "2026-04-05",
	departments: ["86"],
	buyer: "Buyer",
	object: "Audit de cybersécurité",
	nature: "APPEL_OFFRE",
	folderId: null,
	amountEur: null,
	amountKind: null,
	awardees: [],
	...overrides,
});

test("awarded total wins over a payable amount in an attribution notice", () => {
	const payload = JSON.stringify({
		"cbc:TotalAmount": { "@currencyID": "EUR", "#text": "123440" },
		"cbc:PayableAmount": { "@currencyID": "EUR", "#text": "493760" },
	});
	assert.deepEqual(extractAmount(payload, "ATTRIBUTION"), { amountEur: 123440, kind: "awarded" });
});

test("a tender ceiling is reported as an estimated amount", () => {
	const payload = JSON.stringify({
		"efbc:FrameworkMaximumAmount": { "@currencyID": "EUR", "#text": "800000" },
	});
	assert.deepEqual(extractAmount(payload, "APPEL_OFFRE"), { amountEur: 800000, kind: "estimated" });
});

test("awardee extraction keeps company names and drops natural persons", () => {
	const gestion = JSON.stringify({ INDEXATION: { TITULAIRES: { DENOMINATION: ["ADISTA", "SATEC"] } } });
	const donnees = JSON.stringify({
		MAPA: { attribution: { attribution: { resultat: { attribue: {
			titulaire: { PersonnePhysique: { nom: "Dupont" }, PersonneMorale: "INTEGRITY360" },
		} } } } },
	});
	assert.deepEqual(extractAwardees(gestion, donnees), ["ADISTA", "SATEC"]);
	assert.deepEqual(extractAwardees(null, donnees), ["INTEGRITY360"]);
});

test("tender and award notices of one market are counted once", () => {
	const grouped = groupContracts([
		notice({ id: "a", nature: "APPEL_OFFRE", folderId: "f1", amountEur: 200000, amountKind: "estimated", date: "2026-04-05" }),
		notice({ id: "b", nature: "ATTRIBUTION", folderId: "f1", amountEur: 62844, amountKind: "awarded", date: "2026-08-11", awardees: ["ADISTA"] }),
	]);
	assert.equal(grouped.length, 1);
	assert.equal(grouped[0].amountEur, 62844);
	assert.equal(grouped[0].firstPublished, "2026-04-05");
	assert.deepEqual(grouped[0].noticeIds, ["a", "b"]);
	assert.deepEqual(grouped[0].awardees, ["ADISTA"]);
});

test("measurement excludes a market published outside the rolling window", () => {
	const contracts = groupContracts([
		notice({ id: "in", date: "2026-04-05" }),
		notice({ id: "out", date: "2025-11-21", object: "Pare-feu du SDIS" }),
	]);
	const measured = measureContracts(contracts, "2025-11-22", "2026-11-22");
	assert.equal(measured.count, 1);
	assert.deepEqual(measured.contracts[0].noticeIds, ["in"]);
});

test("measurement sums published amounts and lists awardees", () => {
	const contracts = groupContracts([
		notice({ id: "a", folderId: "f1", amountEur: 100, amountKind: "awarded", awardees: ["ADISTA"] }),
		notice({ id: "b", folderId: "f2", amountEur: 250, amountKind: "estimated", awardees: ["ADISTA", "SATEC"] }),
		notice({ id: "c", folderId: "f3" }),
	]);
	const measured = measureContracts(contracts, "2025-11-22", "2026-11-22");
	assert.equal(measured.count, 3);
	assert.equal(measured.totalAmountEur, 350);
	assert.equal(measured.withAmount, 2);
	assert.equal(measured.withAwardee, 2);
	assert.deepEqual(measured.awardees[0], { name: "ADISTA", contracts: 2, amountEur: 350 });
});

test("versioned corpus contains only NA cyber notices", () => {
	const corpus = JSON.parse(readFileSync(fileURLToPath(new URL("../../../bench/corpus/cyber-contracts-na.json", import.meta.url)), "utf8")) as {
		notices: ContractNotice[];
	};
	assert.ok(corpus.notices.length > 0);
	assert.ok(corpus.notices.every((n) => isCyberObject(n.object) && isNaDepartments(n.departments)));
	assert.ok(corpus.notices.every((n) => safeNoticeKeys(n as unknown as Record<string, unknown>)));
});
