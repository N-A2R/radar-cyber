/**
 * Exposed web services: one behaviour per test, no network, disposable DB.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import {
	WEB_SERVICE_SOURCE,
	enregistrerServicesWeb,
	measureExposition,
	webServiceFromVerifiedWebsite,
	type VerifiedWebsiteRow,
} from "../src/exposition/web-service.js";

after(async () => { await closePools(); });

const consultedAt = new Date("2026-11-22T10:00:00Z");

function proof(overrides: Partial<VerifiedWebsiteRow> = {}): VerifiedWebsiteRow {
	return {
		orgId: 1,
		dept: "33",
		domain: "exemple-na.fr",
		source: "wikidata:P856:http200",
		confidence: 0.95,
		proof: { statut: 200, urlFinale: "https://www.exemple-na.fr/contact", titre: "secret" },
		...overrides,
	};
}

test("accepts a 200 answer served by the organisation domain", () => {
	const service = webServiceFromVerifiedWebsite(proof(), "203.0.113.10", consultedAt);
	assert.ok(service);
	assert.equal(service.port, 443);
	assert.equal(service.service, "https");
	assert.equal(service.source, WEB_SERVICE_SOURCE);
	assert.equal(service.sourceUrl, "https://exemple-na.fr/contact");
	assert.equal(service.evidence.status, 200);
});

test("rejects a final URL on another domain", () => {
	assert.equal(
		webServiceFromVerifiedWebsite(
			proof({ proof: { statut: 200, urlFinale: "https://autre.fr/" } }),
			"203.0.113.10",
			consultedAt,
		),
		null,
	);
});

test("rejects an organisation outside Nouvelle-Aquitaine", () => {
	assert.equal(webServiceFromVerifiedWebsite(proof({ dept: "75" }), "203.0.113.10", consultedAt), null);
});

test("rejects a proof without a measured HTTP 200", () => {
	assert.equal(webServiceFromVerifiedWebsite(proof({ proof: { statut: 301 } }), "203.0.113.10", consultedAt), null);
});

test("rejects a low-confidence attribution", () => {
	assert.equal(webServiceFromVerifiedWebsite(proof({ confidence: 0.4 }), "203.0.113.10", consultedAt), null);
});

test("rejects a private resolution instead of inventing a public IP", () => {
	assert.equal(webServiceFromVerifiedWebsite(proof(), "127.0.0.1", consultedAt), null);
});

test("stores technical evidence only", () => {
	const service = webServiceFromVerifiedWebsite(proof(), "203.0.113.10", consultedAt)!;
	assert.deepEqual(Object.keys(service.evidence).sort(), ["domain", "provider", "status", "url"]);
	assert.ok(!JSON.stringify(service.evidence).includes("secret"));
});

test("writing the same service twice keeps one row", async () => {
	const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
	const created = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind, dept, domain) VALUES ($1,$2,$3,$4,$5) RETURNING id",
		["Web service test", `web-service-test-${suffix}`, "entreprise", "33", `test-${suffix}.na.fr`],
	);
	const orgId = created.rows[0]!.id;
	try {
		const service = webServiceFromVerifiedWebsite(
			proof({ orgId, domain: `test-${suffix}.na.fr`, proof: { statut: 200, urlFinale: `https://test-${suffix}.na.fr/` } }),
			"203.0.113.11",
			consultedAt,
		)!;
		assert.equal(await enregistrerServicesWeb([service]), 1);
		assert.equal(await enregistrerServicesWeb([service]), 1);
		const rows = await query("SELECT * FROM exposition_service WHERE org_id = $1", [orgId]);
		assert.equal(rows.rows.length, 1);
	} finally {
		await query("DELETE FROM exposition_service WHERE org_id = $1", [orgId]);
		await query("DELETE FROM org WHERE id = $1", [orgId]);
	}
});

test("measurement counts distinct organisations and ignores other regions", async () => {
	const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
	const created = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, dept, domain) VALUES
		   ($1,$2,'entreprise','33',$3),
		   ($4,$5,'entreprise','33',$6),
		   ($7,$8,'entreprise','75',$9)
		 RETURNING id`,
		[
			"NA one", `measure-na-one-${suffix}`, `one-${suffix}.na.fr`,
			"NA two", `measure-na-two-${suffix}`, `two-${suffix}.na.fr`,
			"Outside one", `measure-out-one-${suffix}`, `out-${suffix}.na.fr`,
		],
	);
	const [naOne, naTwo, outside] = created.rows.map((row) => row.id);
	try {
		const before = await measureExposition();
		const services = [naOne, naTwo, outside].map((orgId, index) =>
			webServiceFromVerifiedWebsite(
				proof({
					orgId,
					domain: `host-${index}-${suffix}.na.fr`,
					proof: { statut: 200, urlFinale: `https://host-${index}-${suffix}.na.fr/` },
				}),
				`203.0.113.${20 + index}`,
				consultedAt,
			)!,
		);
		await enregistrerServicesWeb(services);
		const after = await measureExposition();
		assert.equal(after.organisationsWithService - before.organisationsWithService, 2);
		assert.equal((after.bySource[WEB_SERVICE_SOURCE] ?? 0) - (before.bySource[WEB_SERVICE_SOURCE] ?? 0), 2);
	} finally {
		for (const orgId of [naOne, naTwo, outside]) {
			await query("DELETE FROM exposition_service WHERE org_id = $1", [orgId]);
			await query("DELETE FROM org WHERE id = $1", [orgId]);
		}
	}
});
