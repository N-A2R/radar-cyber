/**
 * Behavior: a WARC 1.1 response record can be written, parsed back and
 * verified by its block and payload digests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildWarcResponse, parseWarcFile, verifyBlockDigest } from "../src/warc/record.js";

const input = {
	targetUri: "https://www.cert.cyber.gouv.fr/avis/CERTFR-2026-AVI-1566/",
	date: new Date("2026-11-22T10:00:00.000Z"),
	status: 200,
	headers: { "x-source-kind": "cert_fr" },
	body: Buffer.from("<html>public source</html>", "utf8"),
	contentType: "text/html; charset=utf-8",
};

test("a built record carries the mandatory WARC headers", () => {
	const built = buildWarcResponse(input);
	const head = built.bytes.subarray(0, 600).toString("utf8");
	assert.match(head, /^WARC\/1\.1\r\n/);
	assert.match(head, /WARC-Type: response\r\n/);
	assert.match(head, /WARC-Record-ID: <urn:uuid:[0-9a-f-]{36}>\r\n/);
	assert.match(head, /WARC-Date: 2026-11-22T10:00:00\.000Z\r\n/);
	assert.match(head, new RegExp(`WARC-Target-URI: ${input.targetUri.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\r\\n`));
	assert.match(head, /WARC-Block-Digest: sha1:[A-Z2-7]{32}\r\n/);
	assert.match(head, /Content-Type: application\/http; msgtype=response\r\n/);
});

test("a record round-trips through the parser with matching digests", () => {
	const built = buildWarcResponse(input);
	const [record] = parseWarcFile(built.bytes);
	assert.equal(record.headers["warc-type"], "response");
	assert.equal(record.headers["warc-target-uri"], input.targetUri);
	assert.equal(record.httpStatus, 200);
	assert.deepEqual(record.body, input.body);
	assert.equal(createHash("sha256").update(record.body).digest("hex"), built.payloadSha256);
	assert.equal(verifyBlockDigest(record.block, built.blockSha1), true);
	assert.equal(verifyBlockDigest(record.block, "sha1:BAD"), false);
});

test("a WARC file holds several independently parseable records", () => {
	const a = buildWarcResponse(input);
	const b = buildWarcResponse({ ...input, targetUri: "https://example.org/other", status: 301 });
	const records = parseWarcFile(Buffer.concat([a.bytes, b.bytes]));
	assert.equal(records.length, 2);
	assert.deepEqual(records.map((r) => r.httpStatus), [200, 301]);
	assert.equal(records[1]?.headers["warc-record-id"], `<${b.recordId}>`);
});

test("building a record rejects an invalid target or status", () => {
	assert.throws(() => buildWarcResponse({ ...input, targetUri: "file:///etc/passwd" }), /http\(s\)/);
	assert.throws(() => buildWarcResponse({ ...input, status: 999 }), /status/);
});
