import assert from "node:assert/strict";
import test from "node:test";
import {
	domainRoot,
	evaluateCoherence,
	extractVictimRoots,
	isDistinctiveName,
	type CoherenceEvent,
	type CoherenceInput,
} from "../src/detection/attachment-coherence.js";

function event(overrides: Partial<CoherenceEvent> = {}): CoherenceEvent {
	return {
		id: 1,
		title: "Dutch CERT news about port resilience",
		summary: null,
		hint: null,
		evidenceAlias: null,
		department: null,
		publisherRoots: ["feeds.ncsc.nl"],
		...overrides,
	};
}

function input(overrides: Partial<CoherenceInput["org"]> = {}, ev = event()): CoherenceInput {
	return {
		event: ev,
		org: {
			id: 482872,
			name: "OPEN SOURCE",
			domains: ["ncsc.nl"],
			aliases: [],
			department: "33",
			...overrides,
		},
	};
}

test("flags an attachment whose only shared domain is the publisher host", () => {
	const verdict = evaluateCoherence(input());
	assert.equal(verdict.coherent, false);
	assert.equal(verdict.reason, "publisher-domain-only");
});

test("keeps an attachment when the victim domain matches the organisation domain", () => {
	const verdict = evaluateCoherence(
		input({ name: "AXISCADES", domains: ["axiscades.com"] }, event({ hint: "www.axiscades.com" })),
	);
	assert.equal(verdict.coherent, true);
	assert.equal(verdict.reason, "shared-domain");
});

test("keeps an attachment through a shared DNS network node", () => {
	const verdict = evaluateCoherence(
		input({ name: "OWNER", domains: ["owned.example"] }, event({ hint: "victim.example" })),
		[{ victimRoot: "victim.example", orgRoot: "owned.example" }],
	);
	assert.equal(verdict.coherent, true);
	assert.equal(verdict.reason, "shared-network");
});

test("keeps a claim with an explicit matching department", () => {
	const verdict = evaluateCoherence(
		input(
			{ name: "ORG 23", domains: [], department: "23" },
			event({ department: "23", publisherRoots: ["onion.example"] }),
		),
	);
	assert.equal(verdict.coherent, true);
	assert.equal(verdict.reason, "shared-department");
});

test("keeps an attachment when the distinctive organisation name appears in the title", () => {
	const verdict = evaluateCoherence(
		input(
			{ name: "GITES DE FRANCE", domains: [] },
			event({ title: "Gîtes de France - 117,574 breached accounts", publisherRoots: ["leak.example"] }),
		),
	);
	assert.equal(verdict.coherent, true);
	assert.equal(verdict.reason, "distinctive-name");
});

test("flags an attachment supported only by a generic expression", () => {
	const verdict = evaluateCoherence(
		input(
			{ name: "MAISON HEBRARD", domains: [] },
			event({
				title: "Tentatives de fraude aupres des professionnels au bureau",
				publisherRoots: ["pref19.example"],
				evidenceAlias: "au bureau",
			}),
		),
	);
	assert.equal(verdict.coherent, false);
	assert.equal(verdict.reason, "no-shared-node");
});

test("excludes the publisher host from the extracted victim domains", () => {
	const roots = extractVictimRoots(event({
		title: "ransomlook.io lists axiscades.com as a victim",
		publisherRoots: ["ransomlook.io"],
	}));
	assert.deepEqual(roots, ["axiscades.com"]);
});

test("compares domain roots across subdomains and query strings", () => {
	assert.equal(domainRoot("WWW.Axiscades.com\\$100"), "axiscades.com");
});

test("requires two distinctive tokens to create a name node", () => {
	assert.equal(isDistinctiveName("open source"), false);
	assert.equal(isDistinctiveName("boulazac basket"), true);
});
