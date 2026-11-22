/**
 * Behavior: a decommissioned claim URL resolves to the live public page that
 * carries the same claim, so the WARC proof can still be captured.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EligibleFact } from "../src/warc/eligibility.js";
import { alternateUrls } from "../src/warc/service.js";

function fact(sourceUrl: string, evidence: Record<string, unknown> = {}): EligibleFact {
	return { id: 1, sourceUrl, family: "ransomware", dept: "16", regional: true, evidence };
}

test("dead RansomLook post and site routes use the live group page", () => {
	assert.deepEqual(
		alternateUrls(fact("https://www.ransomlook.io/post/6b08b44b54e0", { group: "lamashtu" })),
		["https://www.ransomlook.io/group/lamashtu"],
	);
	assert.deepEqual(
		alternateUrls(fact("https://www.ransomlook.io/site/view?uuid=e3c69462", { group: "qilin" })),
		["https://www.ransomlook.io/group/qilin"],
	);
});

test("a gated FrenchBreaches alert uses its public claim mirror", () => {
	const inner = Buffer.from("www.exemple-na.fr@krybit").toString("base64");
	const slug = `ernat-rw_${Buffer.from(inner).toString("base64")}`;
	assert.deepEqual(
		alternateUrls(fact(`https://frenchbreaches.com/alertes/${slug}`)),
		[`https://www.ransomware.live/id/${inner}`],
	);
});
