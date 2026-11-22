/**
 * One test per observable behaviour of the operating-mode clustering.
 * All tests are pure: no database, no network, no model call.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	clusterOperatingModes,
	signatureOf,
	type ModeEvent,
} from "../src/analyse/operating-modes.js";

function event(id: number, overrides: Partial<ModeEvent> = {}): ModeEvent {
	return {
		id,
		family: "cti",
		assertionType: "ambient_signal",
		title: "Regional cyber news",
		evidence: {},
		sourceId: "press:test",
		regional: true,
		...overrides,
	};
}

test("events outside Nouvelle-Aquitaine are scanned but never clustered", () => {
	const analysis = clusterOperatingModes([
		event(1, { family: "leaks" }),
		event(2, { family: "leaks", regional: false }),
	]);
	assert.equal(analysis.scanned, 2);
	assert.equal(analysis.regional, 1);
	assert.equal(analysis.count, 1);
	assert.equal(analysis.modes[0]?.events, 1);
});

test("ransomware disclosure and bare claim are two distinct modes", () => {
	const analysis = clusterOperatingModes([
		event(1, {
			family: "ransomware",
			title: "victim.example\\$12M\\France\\147GB\\100% DISCLOSED — claimed by crew",
			evidence: { group: "crew" },
		}),
		event(2, {
			family: "ransomware",
			title: "other.example — claimed by crew",
			evidence: { group: "crew" },
		}),
	]);
	assert.deepEqual(
		analysis.modes.map((mode) => mode.key),
		["ransomware-extortion:claim", "ransomware-extortion:publication"],
	);
	assert.equal(analysis.count, 2);
});

test("repeated signatures count distinct sources, not repeated rows", () => {
	const analysis = clusterOperatingModes([
		event(1, { family: "leaks", sourceId: "leak:a" }),
		event(2, { family: "leaks", sourceId: "leak:a" }),
		event(3, { family: "leaks", sourceId: "leak:b" }),
	]);
	assert.equal(analysis.count, 1);
	assert.equal(analysis.modes[0]?.events, 3);
	assert.equal(analysis.modes[0]?.sources, 2);
	assert.equal(analysis.modes[0]?.label, "Data leak publication");
});

test("vulnerability access profile comes from the CVSS vector", () => {
	const vector = (tail: string) => ({ vectorString: `CVSS:3.1/${tail}` });
	const analysis = clusterOperatingModes([
		event(1, { family: "vuln", evidence: vector("AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H") }),
		event(2, { family: "vuln", evidence: vector("AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H") }),
		event(3, { family: "vuln", evidence: vector("AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H") }),
		event(4, { family: "vuln", evidence: vector("AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H") }),
		event(5, { family: "vuln", evidence: vector("AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N") }),
		event(6, { family: "cert_fr", evidence: {} }),
	]);
	assert.deepEqual(
		analysis.modes.map((mode) => `${mode.technique}:${mode.variant}`),
		[
			"vulnerability-exposure:advisory",
			"vulnerability-exposure:authenticated-remote",
			"vulnerability-exposure:local-access",
			"vulnerability-exposure:scope-change",
			"vulnerability-exposure:unauthenticated-remote",
			"vulnerability-exposure:user-interaction",
		],
	);
});

test("technique words identify modes independently of the source", () => {
	const analysis = clusterOperatingModes([
		event(1, { title: "Device code phishing against staff", sourceId: "feed:a" }),
		event(2, { title: "Typosquatting domain impersonates a bank", sourceId: "feed:b" }),
		event(3, { title: "Supply chain breach through an extension", sourceId: "onion:a" }),
		event(4, { title: "DDoS leaves municipal sites inaccessible", sourceId: "telegram:a" }),
		event(5, { title: "Website defacement on a regional shop", sourceId: "paste:a" }),
		event(6, { title: "Fuite de données massive chez un éditeur", sourceId: "feed:c" }),
	]);
	assert.deepEqual(
		analysis.modes.map((mode) => mode.technique),
		[
			"credential-phishing",
			"data-leak",
			"service-disruption",
			"supply-chain",
			"typosquatting",
			"web-defacement",
		],
	);
	assert.equal(analysis.unclassified, 0);
});

test("structured group evidence outranks unrelated title words", () => {
	const signature = signatureOf(
		event(1, {
			family: "ransomware",
			title: "A fire in a Gironde warehouse",
			evidence: { group: "crew" },
		}),
	);
	assert.deepEqual(signature, { technique: "ransomware-extortion", variant: "claim" });
});

test("unrelated regional news stays unclassified instead of becoming a mode", () => {
	const analysis = clusterOperatingModes([
		event(1, { title: "Mister Agricole 2027 in Charente-Maritime" }),
	]);
	assert.equal(analysis.count, 0);
	assert.equal(analysis.unclassified, 1);
	assert.equal(analysis.classified, 0);
});

test("modes carry no title, source id or victim identity", () => {
	const victim = "Centre Hospitalier Victor Hugo";
	const person = "Camille Dupont";
	const secretSource = "onion:private-feed";
	const analysis = clusterOperatingModes([
		event(1, {
			family: "ransomware",
			title: `${victim} — ${person} — 100% DISCLOSED`,
			sourceId: secretSource,
			evidence: { group: "crew" },
		}),
	]);
	const serialised = JSON.stringify(analysis.modes);
	for (const forbidden of [victim, person, secretSource, "DISCLOSED"]) {
		assert.ok(!serialised.includes(forbidden), `mode output leaked ${forbidden}`);
	}
	assert.deepEqual(Object.keys(analysis.modes[0] ?? {}), [
		"key", "technique", "variant", "label", "events", "sources",
	]);
});

test("input order does not change the measured count or modes", () => {
	const events = [
		event(1, { family: "leaks", sourceId: "leak:a" }),
		event(2, { family: "ransomware", title: "a.example", evidence: { group: "crew" } }),
		event(3, { family: "vuln", evidence: { vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" } }),
		event(4, { title: "Mister Agricole in Gironde" }),
	];
	assert.deepEqual(clusterOperatingModes([...events].reverse()), clusterOperatingModes(events));
});
