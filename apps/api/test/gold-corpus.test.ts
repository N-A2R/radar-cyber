/**
 * One test per behaviour of the gold corpus contract.
 *
 * All rules are pure and offline; the frozen corpus is read only to prove that
 * the published file still satisfies the contract after any future edit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	ANNOTATION_RULES,
	classifyIncidentType,
	corpusHash,
	looksLikePersonName,
	normaliseDepartment,
	normaliseEvidenceUrl,
	parseGoldJsonl,
	redactPersonalData,
	selectGoldSample,
	summariseGoldCorpus,
	validateGoldCorpus,
	type GoldCandidate,
	type GoldIncident,
} from "../src/gold/corpus.js";

const corpusPath = fileURLToPath(new URL("../../../bench/gold/incidents-na-500.jsonl", import.meta.url));
const frozen = parseGoldJsonl(readFileSync(corpusPath, "utf8"));

function candidate(sourceRef: string, tier: GoldCandidate["evidenceTier"], dept = "33"): GoldCandidate {
	return {
		key: sourceRef,
		sourceRef,
		title: "Cyberattack on a Gironde company",
		organisation: "Example Organisation SAS",
		department: dept as GoldCandidate["department"],
		observedAt: "2026-01-15",
		incidentType: "intrusion",
		evidenceTier: tier,
		sourceKind: "press",
		sourceUrl: `https://example.fr/incident/${sourceRef}`,
		sourceLabel: "Sud Ouest",
		annotation: {
			rule: "curated.verified.v1",
			confidence: "high",
			reviewedAt: "2026-11-22",
			note: "Synthetic candidate for sampling tests.",
		},
	};
}

test("department normalisation accepts NA names and rejects other regions", () => {
	assert.equal(normaliseDepartment("Charente-Maritime"), "17");
	assert.equal(normaliseDepartment("pyrénées-atlantiques"), "64");
	assert.equal(normaliseDepartment("87"), "87");
	assert.equal(normaliseDepartment("65"), null);
	assert.equal(normaliseDepartment("Paris"), null);
});

test("personal data redaction removes contacts and named individuals", () => {
	const redacted = redactPersonalData("Victim Jean Dupont wrote to jean.dupont@example.fr or 06 12 34 56 78");
	assert.match(redacted, /\[email\]/);
	assert.match(redacted, /\[phone\]/);
	assert.match(redacted, /\[redacted\]/);
	assert.doesNotMatch(redacted, /jean\.dupont@example\.fr/);
});

test("incident taxonomy maps descriptions to the seven allowed labels", () => {
	assert.equal(classifyIncidentType("Attackers encrypted the systems"), "ransomware");
	assert.equal(classifyIncidentType("Data leak at a local authority"), "data_leak");
	assert.equal(classifyIncidentType("Phishing campaign") , "phishing");
	assert.equal(classifyIncidentType("Cyberattaque contre une mairie"), "intrusion");
	assert.equal(classifyIncidentType("Service interruption after the incident"), "service_disruption");
	assert.equal(classifyIncidentType("Unrelated press article"), "other");
});

test("evidence URL normalisation collapses scheme and www variants", () => {
	assert.equal(
		normaliseEvidenceUrl("https://www.sudouest.fr/incident/"),
		normaliseEvidenceUrl("http://sudouest.fr/incident"),
	);
	assert.notEqual(normaliseEvidenceUrl("https://sudouest.fr/a"), normaliseEvidenceUrl("https://sudouest.fr/b"));
});

test("person-name heuristic rejects individuals but keeps organisations", () => {
	assert.equal(looksLikePersonName("Jean Dupont"), true);
	assert.equal(looksLikePersonName("HENRY"), false);
	assert.equal(looksLikePersonName("SAS Jean Dupont"), false);
});

test("sampling is deterministic for a fixed seed", () => {
	const pool = Array.from({ length: 90 }, (_, index) =>
		candidate(`c${index}`, index < 30 ? "verified" : index < 60 ? "reported" : "claimed"));
	const first = selectGoldSample(pool, 45, 1234);
	const second = selectGoldSample(pool, 45, 1234);
	assert.deepEqual(first, second);
	assert.equal(first.length, 45);
	assert.equal(new Set(first.map((entry) => entry.key)).size, 45);
});

test("sampling redistributes a short tier instead of failing", () => {
	const pool = [
		...Array.from({ length: 10 }, (_, index) => candidate(`v${index}`, "verified")),
		...Array.from({ length: 10 }, (_, index) => candidate(`r${index}`, "reported")),
		...Array.from({ length: 80 }, (_, index) => candidate(`c${index}`, "claimed")),
	];
	const sample = selectGoldSample(pool, 50, 99);
	assert.equal(sample.length, 50);
	assert.equal(sample.filter((entry) => entry.evidenceTier === "claimed").length, 30);
});

test("validation rejects a department outside Nouvelle-Aquitaine", () => {
	const record = { ...frozen[0]!, department: "75" };
	const report = validateGoldCorpus([record]);
	assert.ok(report.errors.some((error) => error.includes("department outside Nouvelle-Aquitaine")));
});

test("validation requires an evidence URL", () => {
	const record = { ...frozen[0]!, sourceUrl: "" };
	const report = validateGoldCorpus([record]);
	assert.ok(report.errors.some((error) => error.includes("missing evidence URL")));
});

test("validation rejects personal data in a title", () => {
	const record = { ...frozen[0]!, title: "Contact jean.dupont@example.fr about the attack" };
	const report = validateGoldCorpus([record]);
	assert.ok(report.errors.some((error) => error.includes("personal data in title")));
});

test("validation rejects unknown annotation rules", () => {
	const record = { ...frozen[0]!, annotation: { ...frozen[0]!.annotation, rule: "unknown" } };
	assert.ok(validateGoldCorpus([record]).errors.some((error) => error.includes("invalid annotation rule")));
	assert.ok(ANNOTATION_RULES.length >= 4);
});

test("frozen corpus passes validation with 500 unique annotated incidents", () => {
	const report = validateGoldCorpus(frozen);
	assert.deepEqual(report.errors, []);
	assert.equal(report.total, 500);
	assert.equal(new Set(frozen.map((record: GoldIncident) => record.id)).size, 500);
});

test("summary reports all twelve departments and stable hash", () => {
	const summary = summariseGoldCorpus(frozen);
	assert.equal(summary.incidents, 500);
	assert.equal(summary.departments, 12);
	assert.equal(summary.sha256, corpusHash(frozen));
});

test("hash detects any change to the frozen corpus", () => {
	const changed = frozen.map((record, index) => index === 0 ? { ...record, title: `${record.title} updated` } : record);
	assert.notEqual(corpusHash(changed), corpusHash(frozen));
});
