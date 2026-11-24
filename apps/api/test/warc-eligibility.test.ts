/**
 * Behavior: only Nouvelle-Aquitaine facts with a public source URL and no
 * victim-level classification enter the WARC proof scope.
 */
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, ingestQuery, query } from "../src/db.js";
import { eligibleFacts, pendingFacts } from "../src/warc/eligibility.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `warc${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const ids: Record<string, number> = {};
let runId: number;

async function fact(key: string, fields: {
	dept?: string;
	regional?: boolean;
	url: string | null;
	tlp?: string;
	family?: string;
}): Promise<void> {
	let orgId: number | null = null;
	if (fields.dept) {
		const inserted = await query<{ id: number }>(
			`INSERT INTO org (name, slug, kind, dept) VALUES ($1,$2,'collectivite',$3) RETURNING id`,
			[`Commune ${TAG} ${key}`, `${tagSlug()}-${key}`, fields.dept],
		);
		orgId = inserted.rows[0]!.id;
	}
	const inserted = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url,
		                    evidence, tlp, regional, org_id)
		 VALUES ($1,$2,'confirmed_incident',$3,'ransomlook',$4,$8::jsonb,$5,$6,$7)
		 RETURNING id`,
		[`${TAG}-${key}`, fields.family ?? "cti", `Fait ${key}`, fields.url,
		 fields.tlp ?? "CLEAR", fields.regional ?? false, orgId,
		 JSON.stringify({ run_id: runId })],
	);
	ids[key] = Number(inserted.rows[0]!.id);
}

function tagSlug(): string {
	return `na-${TAG.toLowerCase()}`;
}

before(async () => {
	const sourceId = `src-${TAG}`;
	await query(
		`INSERT INTO source (id, name, family, url) VALUES ($1,$2,'cti',$3)`,
		[sourceId, `Source ${TAG}`, "https://exemple.invalid/source"],
	);
	const run = await query<{ id: number }>(
		`INSERT INTO collector_run (source_id, finished_at, status) VALUES ($1, now(), 'ok') RETURNING id`,
		[sourceId],
	);
	runId = Number(run.rows[0]!.id);
	await fact("na", { dept: "33", url: "https://presse.example.org/avis" });
	await fact("regional", { url: "https://cert.example.org/avis", regional: true });
	await fact("outside", { dept: "75", url: "https://presse.example.org/paris" });
	await fact("noncapturable", { dept: "16", url: "ftp://presse.example.org/avis" });
	await fact("red", { dept: "17", url: "https://forum.example.org/victime", tlp: "RED" });
	await fact("leaks", { dept: "19", url: "https://leaks.example.org/victime", family: "leaks" });
});

after(async () => {
	await query("DELETE FROM warc_proof WHERE event_id = ANY($1::bigint[])", [Object.values(ids)]);
	await supprimerEvenementsArchivees("id = ANY($1::bigint[])", [Object.values(ids)]);
	await query("DELETE FROM collector_run WHERE id = $1", [runId]);
	await query("DELETE FROM source WHERE id LIKE $1", [`src-${TAG}%`]);
	await query("DELETE FROM org WHERE slug LIKE $1", [`${tagSlug()}%`]);
});

test("the scope keeps NA and regional facts, drops the rest", async () => {
	const rows = await eligibleFacts();

	const found = new Set(rows.map((r) => Number(r.id)));
	assert.equal(found.has(ids.na!), true);
	assert.equal(found.has(ids.regional!), true);
	for (const excluded of ["outside", "noncapturable", "red", "leaks"]) {
		assert.equal(found.has(ids[excluded]!), false, `${excluded} must stay out of scope`);
	}
});

test("pending facts exclude those that already hold a proof row", async () => {
	await ingestQuery(
		`INSERT INTO warc_proof (event_id, source_url, target_uri, warc_file, record_id,
		                         block_sha1, payload_sha256, http_status, byte_length)
		 VALUES ($1,'https://presse.example.org/avis','https://presse.example.org/avis',
		         'data/warc/test.warc','urn:uuid:00000000-0000-4000-8000-000000000001',
		         'sha1:AAAA','abc',200,10)
		 ON CONFLICT (event_id) DO NOTHING`,
		[ids.na],
	);
	const pending = await pendingFacts(1000);
	const found = new Set(pending.map((r) => Number(r.id)));
	assert.equal(found.has(ids.na!), false);
	assert.equal(found.has(ids.regional!), true);
});
