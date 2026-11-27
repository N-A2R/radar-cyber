import assert from "node:assert/strict";
import test from "node:test";

import { evenementSse } from "../src/routes/stream.js";

test("le payload SSE suit le même contrat que GET /api/events", () => {
	const trame = evenementSse({
		id: 42,
		dedup_key: "cle-42",
		family: "cti",
		assertion_type: "confirme",
		title: "Titre",
		summary: "Résumé",
		severity: 3,
		confidence: "high",
		observed_at: "2026-11-27T10:00:00.000Z",
		source_id: "source-42",
		source_url: "https://example.invalid/42",
		geo_type: "region",
		lat: 45.8,
		lon: 1.2,
		org_id: 7,
		regional: true,
		tlp: "CLEAR",
	});

	const data = trame.split("\n").find((ligne) => ligne.startsWith("data: "));
	assert.ok(data, "trame SSE sans ligne data");
	const payload = JSON.parse(data.slice(6)) as Record<string, unknown>;

	assert.equal(payload.id, 42);
	assert.equal(payload.dedupKey, "cle-42");
	assert.equal(payload.assertionType, "confirme");
	assert.equal(payload.observedAt, "2026-11-27T10:00:00.000Z");
	assert.equal(payload.sourceId, "source-42");
	assert.equal(payload.geoType, "region");
	assert.equal(payload.orgId, 7);
	assert.equal(payload.regional, true);
	assert.equal(payload.tlp, "CLEAR");
});
