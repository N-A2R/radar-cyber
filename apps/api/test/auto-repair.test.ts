import { test } from "node:test";
import assert from "node:assert/strict";
import { detectItems, parseNarrativeItems } from "../src/collectors/generic.js";
import { evaluateRepairs, hasEncodingDefect, repairItems } from "../src/collectors/parsers/auto-repair.js";

/** One test per repair behaviour. No fixture contains victim personal data. */
const repair = (body: string, contentType: string | null = "text/html") =>
	evaluateRepairs(body, contentType, detectItems);
const JSON_ARRAY = '[{"title":"Cyber incident report","summary":"Regional cyber alert"}]';

test("UTF-16 body decoded as latin-1 is repaired without human input", () => {
	const body = Buffer.from(`\uFEFF${JSON_ARRAY}`, "utf16le").toString("latin1");
	assert.equal(detectItems(body, null).strategy, "none");
	const result = repair(body);
	assert.equal(result.repaired, true);
	assert.deepEqual(result.repairs, ["utf16-decoded"]);
	assert.ok(result.strategy.startsWith("json-"));
	assert.equal(result.itemCount, 1);
});

test("NUL bytes inside JSON are removed and the document becomes readable", () => {
	const body = '[{"title":"Cyber\u0000 alert","summary":"Regional bulletin"}]';
	assert.equal(detectItems(body, null).strategy, "none");
	const result = repair(body);
	assert.equal(result.repaired, true);
	assert.deepEqual(result.repairs, ["control-chars-removed"]);
	assert.ok(result.strategy.startsWith("json-"));
	assert.equal(result.itemCount, 1);
});

test("truncated JSON array keeps its complete records", () => {
	const body = '[{"title":"Cyber alert one","summary":"First record"},{"title":"Cyber alert two"';
	assert.equal(detectItems(body, null).strategy, "none");
	const result = repair(body);
	assert.equal(result.repaired, true);
	assert.deepEqual(result.repairs, ["truncated-json-closed"]);
	assert.ok(result.strategy.startsWith("json-"));
	assert.equal(result.itemCount, 2);
});

test("JSONP wrapper is unwrapped before detection", () => {
	const body = `callback(${JSON_ARRAY});`;
	assert.equal(detectItems(body, null).strategy, "none");
	const result = repair(body);
	assert.equal(result.repaired, true);
	assert.deepEqual(result.repairs, ["jsonp-unwrapped"]);
	assert.ok(result.strategy.startsWith("json-"));
});

test("CDATA-wrapped JSON is unwrapped before detection", () => {
	const body = `<![CDATA[${JSON_ARRAY}]]>`;
	assert.equal(detectItems(body, null).strategy, "none");
	const result = repair(body);
	assert.equal(result.repaired, true);
	assert.deepEqual(result.repairs, ["cdata-unwrapped"]);
	assert.ok(result.strategy.startsWith("json-"));
});

test("short preamble in front of JSON is trimmed", () => {
	const body = `NOTICE: generated feed\n${JSON_ARRAY}`;
	assert.equal(detectItems(body, null).strategy, "none");
	const result = repair(body);
	assert.equal(result.repaired, true);
	assert.deepEqual(result.repairs, ["leading-junk-trimmed"]);
	assert.ok(result.strategy.startsWith("json-"));
});

test("two defects are repaired together when neither alone suffices", () => {
	const body = '[{"title":"Cyber\u0000 alert","summary":"Regional bulletin"';
	assert.equal(detectItems(body, null).strategy, "none");
	const result = repair(body);
	assert.equal(result.repaired, true);
	assert.equal(result.repairs[0]?.startsWith("combined:"), true);
	assert.equal(result.itemCount, 1);
});

test("anti-bot challenge is refused rather than repaired", () => {
	const body =
		"<html><head><title>Just a moment...</title></head><body>" +
		"<div class='challenge'>Checking your browser before accessing the site. " +
		"Enable JavaScript to continue.</div></body></html>";
	assert.equal(detectItems(body, null).strategy, "none");
	const result = repair(body);
	assert.equal(result.repaired, false);
	assert.equal(result.itemCount, 0);
	assert.deepEqual(result.repairs, []);
});

test("a readable body is not counted as repaired", () => {
	const result = repair(JSON_ARRAY, "application/json");
	assert.equal(result.repaired, false);
	assert.ok(result.strategy.startsWith("json-"));
	assert.equal(result.itemCount, 1);
	assert.deepEqual(result.repairs, []);
});

test("UTF-8 text read as latin-1 is repaired without changing the items", () => {
	const body = '[{"title":"LycÃ©e Sud des Landes","summary":"Regional cyber alert"}]';
	const result = repair(body, "application/json");
	assert.equal(result.repaired, true);
	assert.deepEqual(result.repairs, ["utf8-mojibake-fixed"]);
	assert.ok(result.strategy.startsWith("json-"));
	const items = repairItems(body, "application/json", detectItems).items;
	assert.equal(items[0]?.title, "Lycée Sud des Landes");
});

test("a genuine latin-1 accent is not rewritten as mojibake", () => {
	const body = '[{"title":"Lycée Sud des Landes","summary":"Regional cyber alert"}]';
	const result = repair(body, "application/json");
	assert.equal(result.repaired, false);
	assert.deepEqual(result.repairs, []);
});

test("repair result carries metadata only, never item content", () => {
	const body = Buffer.from(`\uFEFF${JSON_ARRAY}`, "utf16le").toString("latin1");
	const result = repair(body);
	assert.deepEqual(Object.keys(result).sort(), ["itemCount", "path", "repaired", "repairs", "strategy"]);
	assert.equal(JSON.stringify(result).includes("Cyber incident"), false);
});

test("encoding gate flags misdecoded text but leaves genuine accents alone", () => {
	assert.equal(hasEncodingDefect('[{"title":"LycÃ©e Sud des Landes"}]'), true);
	assert.equal(hasEncodingDefect('[{"title":"Lycée Sud des Landes"}]'), false);
});

test("repaired body is returned so the declared reader can reparse it", () => {
	const body = '[{"title":"LycÃ©e Sud des Landes","summary":"Regional cyber alert"}]';
	const result = repairItems(body, "application/json", detectItems);
	assert.equal(result.repaired, true);
	assert.equal(result.body.includes("LycÃ©e"), false);
	assert.equal(result.body.includes("Lycée"), true);
});

test("declared HTML reader sees repaired text instead of the misdecoded one", () => {
	const body = "<html><body>" +
		'<a href="/a">LycÃ©e Sud des Landes</a>' +
		'<a href="/b">Regional cyber bulletin</a>' +
		'<a href="/c">Nouvelle-Aquitaine veille</a>' +
		"</body></html>";
	const before = parseNarrativeItems(body, {}, "html");
	const fixed = repairItems(body, "text/html", detectItems);
	assert.equal(fixed.repaired, true);
	const after = parseNarrativeItems(fixed.body, {}, "html");
	assert.equal(String(before[0]?.title).includes("LycÃ©e"), true);
	assert.equal(String(after[0]?.title).includes("Lycée"), true);
	assert.equal(evaluateRepairs(body, "text/html", detectItems).body, undefined);
});
