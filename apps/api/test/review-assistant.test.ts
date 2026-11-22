/**
 * Review assistant — one observable behaviour per test.
 *
 * The corpus used by the measurement script is read-only; these tests use
 * synthetic claims and never touch a database or a network service.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	declaredCountryOf, isDomainHint, isNaDepartment, scopeOf, suggestDecision,
	type AssistantClaim,
} from "../src/review-assistant/suggest.js";
import {
	computeAcceptance, dedupeDecisions, type AnalystDecision,
} from "../src/review-assistant/acceptance.js";

const claim = (over: Partial<AssistantClaim> = {}): AssistantClaim => ({
	claimId: 1, orgHint: "example.fr", hasDescription: false, ...over,
});

// --- Suggestion rules -------------------------------------------------------

test("an empty hint is rejected", () => {
	const result = suggestDecision(claim({ orgHint: "   " }));
	assert.equal(result.action, "reject");
	assert.equal(result.reason, "no-usable-hint");
});

test("a declared country outside France is rejected", () => {
	const result = suggestDecision(claim({
		orgHint: "acme.com\\$1M\\USA\\40GB\\100% DISCLOSED",
	}));
	assert.equal(result.action, "reject");
	assert.equal(result.reason, "declared-country-outside-scope");
	assert.equal(result.scope, "out-of-scope");
});

test("a declared French country stays in scope and is reviewed", () => {
	const result = suggestDecision(claim({
		orgHint: "acme.fr\\$1M\\France\\40GB\\100% DISCLOSED",
	}));
	assert.equal(result.action, "review");
	assert.equal(result.scope, "na");
});

test("declared country extraction skips amounts, volumes and disclosure states", () => {
	assert.equal(declaredCountryOf("acme.com\\$1M\\Canada\\40GB\\100% DISCLOSED"), "Canada");
});

test("an unstructured hint declares no country", () => {
	assert.equal(declaredCountryOf("Mairie de Bordeaux"), null);
});

test("a www domain is recognised as a domain hint", () => {
	assert.equal(isDomainHint("www.example.fr"), true);
});

test("a company name is not recognised as a domain hint", () => {
	assert.equal(isDomainHint("Groupe Alternance"), false);
});

test("a Nouvelle-Aquitaine department is recognised", () => {
	assert.equal(isNaDepartment("33"), true);
});

test("a department outside Nouvelle-Aquitaine is not recognised", () => {
	assert.equal(isNaDepartment("65"), false);
});

test("a known department forces a review", () => {
	const result = suggestDecision(claim({ orgHint: "ACME", department: "17" }));
	assert.equal(result.action, "review");
	assert.equal(result.reason, "na-department-needs-review");
});

test("a French locality signal keeps the claim in scope", () => {
	const result = suggestDecision(claim({ orgHint: "Universite Paris Sud" }));
	assert.equal(result.scope, "na");
	assert.equal(result.action, "review");
});

test("a domain with a description is promoted", () => {
	const result = suggestDecision(claim({ orgHint: "www.vanmor.com", hasDescription: true }));
	assert.equal(result.action, "promote");
	assert.equal(result.reason, "domain-hint-with-evidence");
});

test("a domain without a description stays for review", () => {
	const result = suggestDecision(claim({ orgHint: "www.vanmor.com", hasDescription: false }));
	assert.equal(result.action, "review");
	assert.equal(result.reason, "domain-hint-without-evidence");
});

test("a domain from a domain-identifier feed is promoted without a description", () => {
	const result = suggestDecision(claim({
		orgHint: "www.vanmor.com", hasDescription: false, source: "ransomwatch",
	}));
	assert.equal(result.action, "promote");
	assert.equal(result.reason, "domain-identifier-feed");
});

test("an ambiguous hint is reviewed with the lowest confidence", () => {
	const result = suggestDecision(claim({ orgHint: "Rollex", hasDescription: false }));
	assert.equal(result.action, "review");
	assert.equal(result.reason, "ambiguous-hint");
	assert.equal(result.confidence, 0.5);
});

test("an explicit country overrides the hint text", () => {
	const result = suggestDecision(claim({ orgHint: "something.fr", declaredCountry: "Brazil" }));
	assert.equal(result.action, "reject");
});

test("scope is unknown when no regional signal is available", () => {
	assert.equal(scopeOf(claim({ orgHint: "Rollex" })), "unknown");
});

test("a suggestion never echoes the hint text", () => {
	const result = suggestDecision(claim({ orgHint: "Secret Victim Associates" }));
	assert.ok(!JSON.stringify(result).includes("Secret Victim"));
	assert.equal(result.reason, "ambiguous-hint");
});

test("a suggestion never reports victim data", () => {
	assert.equal(suggestDecision(claim({ orgHint: "ACME", hasDescription: true })).personalDataFindings, 0);
});

test("the engine is deterministic", () => {
	const input = claim({ orgHint: "acme.fr\\$1M\\France\\40GB\\100% DISCLOSED", hasDescription: true });
	assert.deepEqual(suggestDecision(input), suggestDecision(input));
});

// --- Acceptance metric ------------------------------------------------------

const suggest = (claimId: number, action: "promote" | "review" | "reject") => ({
	claimId, action, confidence: 0.8, reason: "test", scope: "na" as const, personalDataFindings: 0 as const,
});

test("an empty corpus yields a zeroed report", () => {
	const report = computeAcceptance([], []);
	assert.equal(report.evaluated, 0);
	assert.equal(report.acceptanceRate, 0);
});

test("a matching decision counts as accepted", () => {
	const report = computeAcceptance([suggest(1, "promote")], [{ claimId: 1, action: "promote" }]);
	assert.equal(report.evaluated, 1);
	assert.equal(report.accepted, 1);
	assert.equal(report.acceptanceRate, 1);
});

test("a different decision does not count as accepted", () => {
	const report = computeAcceptance([suggest(1, "promote")], [{ claimId: 1, action: "reject" }]);
	assert.equal(report.accepted, 0);
	assert.equal(report.acceptanceRate, 0);
});

test("undecided claims are excluded from the denominator", () => {
	const report = computeAcceptance(
		[suggest(1, "review"), suggest(2, "review")],
		[{ claimId: 1, action: "review" }],
	);
	assert.equal(report.evaluated, 1);
	assert.equal(report.acceptanceRate, 1);
});

test("the latest decision per claim wins", () => {
	const decisions = dedupeDecisions([
		{ claimId: 1, action: "promote" },
		{ claimId: 1, action: "reject" },
	]);
	assert.deepEqual(decisions, [{ claimId: 1, action: "reject" }]);
});

test("the rate is rounded to four decimals", () => {
	const report = computeAcceptance(
		[suggest(1, "review"), suggest(2, "review"), suggest(3, "promote")],
		[{ claimId: 1, action: "review" }, { claimId: 2, action: "promote" }, { claimId: 3, action: "promote" }],
	);
	assert.equal(report.acceptanceRate, 0.6667);
});

test("the report breaks results down by suggested action", () => {
	const report = computeAcceptance(
		[suggest(1, "review"), suggest(2, "promote")],
		[{ claimId: 1, action: "reject" }, { claimId: 2, action: "promote" }],
	);
	assert.equal(report.byAction.review.suggested, 1);
	assert.equal(report.byAction.review.accepted, 0);
	assert.equal(report.byAction.promote.rate, 1);
	assert.equal(report.byAction.reject.suggested, 0);
});

test("the majority baseline uses the most frequent analyst decision", () => {
	const report = computeAcceptance(
		[suggest(1, "review"), suggest(2, "review"), suggest(3, "promote")],
		[{ claimId: 1, action: "review" }, { claimId: 2, action: "review" }, { claimId: 3, action: "promote" }],
	);
	assert.equal(report.majorityBaselineRate, 0.6667);
});

test("the acceptance report contains no personal data field", () => {
	const report = computeAcceptance([suggest(1, "review")], [{ claimId: 1, action: "review" }]);
	assert.deepEqual(Object.keys(report).sort(), [
		"acceptanceRate", "accepted", "byAction", "evaluated", "majorityBaselineRate", "personalDataFindings",
	]);
});
