/**
 * Behavior: archive input is stripped of victim personal data and limited to
 * public HTTP(S) URLs, while gray sources stay accepted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { containsPersonalData, isPublicHttpUrl, redactText, safeHeaders } from "../src/warc/redact.js";

test("emails, phone numbers and national ids are removed from a captured body", () => {
	const dirty = "Contact : victime@example.fr au 06 12 34 56 78, NIR 1 85 04 75 116 001 42.";
	const cleaned = redactText(dirty);
	assert.equal(cleaned.redacted, true);
	assert.match(cleaned.text, /\[email-redacted\]/);
	assert.match(cleaned.text, /\[phone-redacted\]/);
	assert.match(cleaned.text, /\[id-redacted\]/);
	assert.equal(containsPersonalData(cleaned.text), false);
	assert.equal(containsPersonalData(dirty), true);
});

test("a clean body is left untouched", () => {
	const clean = "<h1>Avis CERT-FR</h1><p>Organisation de Nouvelle-Aquitaine</p>";
	assert.deepEqual(redactText(clean), { text: clean, redacted: false });
});

test("only public HTTP(S) URLs without credentials are accepted", () => {
	assert.equal(isPublicHttpUrl("https://forum-gris.example.org/thread/42"), true);
	assert.equal(isPublicHttpUrl("http://presse.fr/avis"), true);
	assert.equal(isPublicHttpUrl("file:///etc/passwd"), false);
	assert.equal(isPublicHttpUrl("https://user:pass@example.org/"), false);
	assert.equal(isPublicHttpUrl("http://127.0.0.1:8080/"), false);
	assert.equal(isPublicHttpUrl("http://10.1.2.3/"), false);
	assert.equal(isPublicHttpUrl("http://192.168.1.4/"), false);
	assert.equal(isPublicHttpUrl("http://172.20.1.4/"), false);
	assert.equal(isPublicHttpUrl("http://site.onion/"), false);
});

test("credential headers never enter the WARC payload", () => {
	const headers = new Headers({
		"content-type": "text/html",
		authorization: "Bearer secret",
		cookie: "session=secret",
		"set-cookie": "session=secret",
	});
	const safe = safeHeaders(headers);
	assert.equal(safe["content-type"], "text/html");
	assert.deepEqual(Object.keys(safe), ["content-type"]);
});
