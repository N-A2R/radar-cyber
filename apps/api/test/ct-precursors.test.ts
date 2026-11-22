/**
 * One behaviour per test for the CT precursor attachment.
 * Fixtures are organisation-level only: no names, no certificate contents.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	attachCtByDomain,
	measureCtSource,
	type CtObservation,
	type OrganizationDomain,
} from "../src/prediction/ct-precursors.js";

function org(orgId: number, domain: string | null, website: string | null = null): OrganizationDomain {
	return { orgId, domain, website };
}

function observation(domain: string, firstSeen = "2026-05-01"): CtObservation {
	return { domain, firstSeen };
}

test("a subdomain is attached to the registrable root owner", () => {
	const result = attachCtByDomain(
		[observation("https://www.sous.exemple.fr:8443/contact")],
		[org(1, "exemple.fr")],
	);
	assert.deepEqual(result.attachments.map((a) => a.orgId), [1]);
});

test("a root shared by two organisations is skipped as ambiguous", () => {
	const result = attachCtByDomain(
		[observation("sous.exemple.fr")],
		[org(1, "exemple.fr"), org(2, "www.exemple.fr")],
	);
	assert.equal(result.attachments.length, 0);
	assert.equal(result.ambiguousRoots, 1);
});

test("a different public suffix is never treated as the same root", () => {
	const result = attachCtByDomain([observation("exemple.com")], [org(1, "exemple.fr")]);
	assert.equal(result.attachments.length, 0);
	assert.equal(result.unmatched, 1);
});

test("a value that is not a domain is counted as unmatched", () => {
	const result = attachCtByDomain([observation("not a domain")], [org(1, "exemple.fr")]);
	assert.equal(result.attachments.length, 0);
	assert.equal(result.unmatched, 1);
});

test("attachments are ordered by organisation and day", () => {
	const result = attachCtByDomain(
		[observation("b.fr", "2026-05-02"), observation("a.fr", "2026-05-03"), observation("a.fr", "2026-05-01")],
		[org(2, "b.fr"), org(1, "a.fr")],
	);
	assert.deepEqual(
		result.attachments.map((a) => `${a.orgId}:${a.observedAt}`),
		["1:2026-05-01", "1:2026-05-03", "2:2026-05-02"],
	);
});

test("a certificate seen on the claim day is not a precursor", () => {
	const result = attachCtByDomain([observation("a.fr", "2026-06-01")], [org(1, "a.fr")]);
	const measured = measureCtSource(
		"ct_sous_domaine",
		[{ orgId: 1, claimedAt: "2026-06-01" }],
		result.attachments,
	);
	assert.equal(measured.victimsWithPriorSignal, 0);
});

test("a certificate belonging to another organisation is ignored", () => {
	const result = attachCtByDomain([observation("b.fr", "2026-05-01")], [org(2, "b.fr")]);
	const measured = measureCtSource(
		"ct_sous_domaine",
		[{ orgId: 1, claimedAt: "2026-06-01" }],
		result.attachments,
	);
	assert.equal(measured.victimsWithPriorSignal, 0);
});

test("repeated certificates for one victim count that victim once", () => {
	const measured = measureCtSource(
		"ct_sous_domaine",
		[{ orgId: 1, claimedAt: "2026-06-01" }],
		[
			{ orgId: 1, observedAt: "2026-05-01", root: "a.fr" },
			{ orgId: 1, observedAt: "2026-05-02", root: "sous.a.fr" },
		],
	);
	assert.equal(measured.victimsWithPriorSignal, 1);
	assert.equal(measured.priorSignals, 2);
});
