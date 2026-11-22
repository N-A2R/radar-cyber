/**
 * One behaviour per test for quarantine-hint retro-attachment.
 * Fixtures are organisation-level only: no claim text or personal detail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	attachQuarantineMentions,
	measureQuarantineSource,
	type OrganizationIdentity,
	type QuarantineMention,
} from "../src/prediction/quarantine-precursors.js";

function org(
	orgId: number,
	name: string,
	domain: string | null = null,
	aliases: readonly string[] = [],
): OrganizationIdentity {
	return { orgId, name, domain, website: null, aliases };
}

function mention(hint: string, receivedAt = "2026-05-01"): QuarantineMention {
	return { hint, receivedAt };
}

test("a domain hint is attached to the registrable root owner", () => {
	const result = attachQuarantineMentions(
		[mention("https://www.sous.exemple.fr/contact")],
		[org(1, "Autre", "exemple.fr")],
	);
	assert.deepEqual(result.attachments.map((a) => a.orgId), [1]);
});

test("a domain root shared by two organisations is skipped", () => {
	const result = attachQuarantineMentions(
		[mention("sous.exemple.fr")],
		[org(1, "Un", "exemple.fr"), org(2, "Deux", "www.exemple.fr")],
	);
	assert.deepEqual(result.attachments, []);
	assert.equal(result.ambiguous, 1);
});

test("an exact normalised organisation name resolves to its owner", () => {
	const result = attachQuarantineMentions(
		[mention("ÉTUDES Réalisations-Négoce")],
		[org(7, "Etudes Realisations Negoce")],
	);
	assert.deepEqual(result.attachments.map((a) => a.orgId), [7]);
});

test("a non-domain alias resolves to its owner", () => {
	const result = attachQuarantineMentions(
		[mention("ernat")],
		[org(9, "Autre", null, ["ERNAT"])],
	);
	assert.deepEqual(result.attachments.map((a) => a.orgId), [9]);
});

test("a domain hint never falls back to a matching organisation name", () => {
	const result = attachQuarantineMentions([mention("exemple.com")], [org(1, "Exemple")]);
	assert.deepEqual(result.attachments, []);
	assert.equal(result.unmatched, 1);
});

test("attachments are ordered by organisation and day", () => {
	const result = attachQuarantineMentions(
		[mention("b.fr", "2026-05-02"), mention("a.fr", "2026-05-03"), mention("a.fr", "2026-05-01")],
		[org(2, "B", "b.fr"), org(1, "A", "a.fr")],
	);
	assert.deepEqual(
		result.attachments.map((a) => `${a.orgId}:${a.observedAt}`),
		["1:2026-05-01", "1:2026-05-03", "2:2026-05-02"],
	);
});

test("a mention on the claim day is not a precursor", () => {
	const measured = measureQuarantineSource(
		[{ orgId: 1, claimedAt: "2026-06-01" }],
		[{ orgId: 1, observedAt: "2026-06-01" }],
	);
	assert.equal(measured.victimsWithPriorSignal, 0);
});

test("a mention belonging to another organisation is ignored", () => {
	const measured = measureQuarantineSource(
		[{ orgId: 1, claimedAt: "2026-06-01" }],
		[{ orgId: 2, observedAt: "2026-05-01" }],
	);
	assert.equal(measured.victimsWithPriorSignal, 0);
});

test("repeated prior mentions count one victim and all signals", () => {
	const measured = measureQuarantineSource(
		[{ orgId: 1, claimedAt: "2026-06-01" }],
		[
			{ orgId: 1, observedAt: "2026-05-01" },
			{ orgId: 1, observedAt: "2026-05-02" },
		],
	);
	assert.equal(measured.victimsWithPriorSignal, 1);
	assert.equal(measured.priorSignals, 2);
});

test("a hint with no owner is reported as unmatched", () => {
	const result = attachQuarantineMentions([mention("Personne")], [org(1, "Exemple")]);
	assert.equal(result.unmatched, 1);
	assert.equal(result.ambiguous, 0);
});
