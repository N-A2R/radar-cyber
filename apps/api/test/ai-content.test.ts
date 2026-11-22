/**
 * Tests for AI-content detection (src/detect/ai-content.ts).
 *
 * One behaviour per test. All inputs are inline strings: no database write,
 * no network call, and no victim personal data in the fixtures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAiContent } from "../src/detect/ai-content.js";

const AI_TEXT =
	"In conclusion, the incident illustrates a broader landscape of challenges for organisations in Nouvelle-Aquitaine. " +
	"It is important to note that the situation may appear similar in other regions and could affect partners. " +
	"Overall, stakeholders should consider the importance of coordination and visibility at every stage. " +
	"The environment remains complex and the challenges could evolve in the coming months.";

test("flags formulaic abstract prose with even sentence rhythm", () => {
	const verdict = detectAiContent({ text: AI_TEXT, department: "33" });
	assert.equal(verdict.isAiGenerated, true);
	assert.ok(verdict.signals.includes("formulaic_discourse"));
	assert.ok(verdict.signals.includes("generic_abstract_prose"));
	assert.ok(verdict.signals.includes("flat_rhythm"));
});

test("does not flag a single formulaic phrase on its own", () => {
	const verdict = detectAiContent({
		text: "Le 12 novembre 2026, l'ANSSI a publié un avis CVE-2024-40766 concernant trois produits. En conclusion, la situation est suivie par les équipes locales avec une attention particulière.",
		department: "33",
	});
	assert.equal(verdict.isAiGenerated, false);
	assert.ok(verdict.score < 4);
});

test("keeps a dated CVE notice from a public source", () => {
	const verdict = detectAiContent({
		text: "[Mise à jour du 7 août 2025] Le 6 août 2025, SonicWall a remplacé une partie de son communiqué initial pour indiquer que les incidents évoqués étaient corrélés à la vulnérabilité CVE-2024-40766. Celle-ci a fait l'objet d'un bulletin qui recommande la mise à jour immédiate des pare-feux concernés.",
		department: "33",
	});
	assert.equal(verdict.isAiGenerated, false);
});

test("keeps a short ransomware claim below the evidence length", () => {
	const verdict = detectAiContent({ text: "axiscades.com — revendiqué par incransom", department: "33" });
	assert.equal(verdict.isAiGenerated, false);
	assert.equal(verdict.score, 0);
});

test("keeps a figure-rich press report", () => {
	const verdict = detectAiContent({
		text: "Pyrénées-Atlantiques : face à une hausse de 37,4 % des infractions numériques, élus et industriels s'arment contre la cybercriminalité. Face à l'explosion des cyberattaques, la gendarmerie des Pyrénées-Atlantiques a organisé, mercredi 18 novembre, à Mourenx, un séminaire destiné aux élus et aux industriels du département. Les participants ont échangé sur les pratiques à adopter.",
		department: "64",
	});
	assert.equal(verdict.isAiGenerated, false);
});

test("refuses a department outside Nouvelle-Aquitaine", () => {
	const verdict = detectAiContent({ text: AI_TEXT, department: "75" });
	assert.equal(verdict.inScope, false);
	assert.equal(verdict.isAiGenerated, false);
	assert.deepEqual(verdict.signals, []);
});

test("refuses a text without a department", () => {
	const verdict = detectAiContent({ text: AI_TEXT, department: null });
	assert.equal(verdict.inScope, false);
	assert.equal(verdict.score, 0);
});

test("treats a gray source like a public source", () => {
	const publicVerdict = detectAiContent({ text: AI_TEXT, department: "33", sourceKind: "public" });
	const grayVerdict = detectAiContent({ text: AI_TEXT, department: "33", sourceKind: "gray" });
	assert.equal(grayVerdict.isAiGenerated, publicVerdict.isAiGenerated);
	assert.deepEqual(grayVerdict.signals, publicVerdict.signals);
});

test("returns signals and score without echoing the input text", () => {
	const verdict = detectAiContent({ text: `${AI_TEXT} Jean Dupont 06 12 34 56 78`, department: "33" });
	assert.equal(JSON.stringify(verdict).includes("Jean Dupont"), false);
	assert.equal(JSON.stringify(verdict).includes("06 12 34 56 78"), false);
});
