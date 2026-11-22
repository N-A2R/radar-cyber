/**
 * Behavior: a captured HTTP response becomes a verifiable WARC proof, and a
 * damaged archive record stops counting even when the database row remains.
 */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closePools, query } from "../src/db.js";
import { measureWarcProofs } from "../src/warc/measure.js";
import { archiveWarcFacts } from "../src/warc/service.js";

const TAG = `wp${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
let dir: string;
const ids: Record<string, number> = {};

async function insertFact(key: string, url: string, evidence: Record<string, unknown> = {}): Promise<void> {
	const org = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'entreprise','33') RETURNING id`,
		[`Org ${TAG} ${key}`, `${TAG}-${key}`],
	);
	const event = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url,
		                    evidence, tlp, org_id)
		 VALUES ($1,'cti','confirmed_incident',$2,'ransomlook',$3,$4::jsonb,'CLEAR',$5)
		 RETURNING id`,
		[`${TAG}-${key}`, `Fait ${key}`, url, JSON.stringify(evidence), org.rows[0]!.id],
	);
	ids[key] = event.rows[0]!.id;
}

before(async () => {
	dir = await mkdtemp(join(tmpdir(), "radar-warc-"));
	await insertFact("clean", "https://presse.example.org/clean");
	await insertFact("dirty", "https://forum.example.org/dirty");
	await insertFact("gone", "https://presse.example.org/gone");
});

after(async () => {
	await query("DELETE FROM warc_proof WHERE event_id = ANY($1::bigint[])", [Object.values(ids)]);
	await query("DELETE FROM event WHERE id = ANY($1::bigint[])", [Object.values(ids)]);
	await query("DELETE FROM org WHERE slug LIKE $1", [`${TAG}-%`]);
	await closePools();
	if (dir) await rm(dir, { recursive: true, force: true });
});

test("archiving stores a redacted response and counts it as a valid proof", async () => {
	const report = await archiveWarcFacts({
		dir,
		limit: 100,
		concurrency: 2,
		fetchImpl: async (url) => {
			if (url.includes("/gone")) return new Response("missing", { status: 404 });
			const html = url.includes("/dirty")
				? "<p>Contact victime@example.fr au 06 12 34 56 78</p>"
				: "<h1>Avis public</h1>";
			return new Response(html, {
				status: 200,
				headers: { "content-type": "text/html; charset=utf-8", "set-cookie": "sid=secret" },
			});
		},
	});
	assert.equal(report.archived, 2);
	assert.equal(report.skipped["http-404"], 1);
	assert.equal(report.files.length, 1);

	const stored = await query<{ event_id: string; redacted: boolean; payload_sha256: string }>(
		`SELECT event_id, redacted, payload_sha256 FROM warc_proof WHERE event_id = ANY($1::bigint[])
		 ORDER BY event_id`,
		[Object.values(ids)],
	);
	assert.equal(stored.rows.length, 2);
	assert.equal(stored.rows.some((r) => r.redacted), true);
	assert.match(stored.rows[0]!.payload_sha256, /^[0-9a-f]{64}$/);

	const measured = await measureWarcProofs(dir);
	assert.equal(measured.factsWithArchivableProof, 2);
	assert.equal(measured.invalidProofs.length, 0);
});


test("a damaged WARC record is no longer counted", async () => {
	const stored = await query<{ event_id: string }>("SELECT event_id FROM warc_proof ORDER BY event_id LIMIT 1");
	await query("UPDATE warc_proof SET warc_record = $1 WHERE event_id = $2", [Buffer.from("broken"), stored.rows[0]!.event_id]);
	const measured = await measureWarcProofs(dir);
	assert.equal(measured.factsWithArchivableProof, 1);
	assert.equal(measured.invalidProofs.length, 1);
});

test("a dead legacy route is proven by the live page carrying the same claim", async () => {
	const groupUrl = "https://www.ransomlook.io/group/testgroup%20(apt)";
	await insertFact("legacy", "https://www.ransomlook.io/page_company.php?id=999", { group: "testgroup (apt)" });
	const report = await archiveWarcFacts({
		dir,
		limit: 100,
		concurrency: 1,
		fetchImpl: async (url) => {
			if (url.includes("page_company.php")) return new Response("gone", { status: 404 });
			if (url === groupUrl) {
				return new Response("<h1>fol-23.fr claim, 2025-01-17</h1>", {
					status: 200,
					headers: { "content-type": "text/html; charset=utf-8" },
				});
			}
			return new Response("unexpected", { status: 500 });
		},
	});
	assert.equal(report.archived, 1, JSON.stringify(report.skipped));
	const stored = await query<{ target_uri: string }>(
		"SELECT target_uri FROM warc_proof WHERE event_id = $1",
		[ids.legacy],
	);
	assert.equal(stored.rows[0]?.target_uri, groupUrl);
});
