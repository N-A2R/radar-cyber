import { test } from "node:test";
import assert from "node:assert/strict";
import {
	detecterNouvelleOrganisation,
	detecterRafale,
	detecterChangementNature,
} from "../src/analyse/rupture.js";

const NOW = Date.parse("2026-11-13T00:00:00Z");

test("nouvelle org positive", () => {
	const r = detecterNouvelleOrganisation({
		org: { id: 1, premiereApparition: new Date(NOW - 5 * 86400000).toISOString(), referentielDepuis: new Date(NOW - 365 * 86400000).toISOString() },
		faits: [{ id: 10, orgId: 1, family: "x", date: new Date(NOW).toISOString(), severity: 3, zone: "z" }],
		maintenant: NOW,
	});
	assert.ok(r);
	assert.equal(r.agent, "nouvelle-organisation");
});

test("nouvelle org négatif", () => {
	const r = detecterNouvelleOrganisation({
		org: { id: 2, premiereApparition: new Date(NOW - 5 * 86400000).toISOString(), referentielDepuis: new Date(NOW - 30 * 86400000).toISOString() },
		faits: [{ id: 11, orgId: 2, family: "x", date: new Date(NOW).toISOString(), severity: 3, zone: "z" }],
		maintenant: NOW,
	});
	assert.equal(r, null);
});

test("rafale positive", () => {
	const faits = [1, 2, 3, 4].map((i) => ({ id: i, orgId: 1, family: "vol", date: new Date(NOW - i * 86400000).toISOString(), severity: 2, zone: "zoneA" }));
	const r = detecterRafale({ zone: "zoneA", famille: "vol", faitsRecents: faits, historiqueFenetres: [1, 1, 1, 2], maintenant: NOW });
	assert.ok(r);
	assert.equal(r.agent, "rafale");
});

test("rafale négatif", () => {
	const faits = [{ id: 1, orgId: 1, family: "vol", date: new Date(NOW).toISOString(), severity: 2, zone: "zoneA" }];
	const r = detecterRafale({ zone: "zoneA", famille: "vol", faitsRecents: faits, historiqueFenetres: [1, 1, 1, 2], maintenant: NOW });
	assert.equal(r, null);
});

test("changement nature positive", () => {
	const r = detecterChangementNature({
		orgId: 1,
		historique: [{ family: "vol", severity: 2 }],
		nouveau: { id: 5, orgId: 1, family: "meurtre", date: new Date(NOW).toISOString(), severity: 5, zone: "z" },
	});
	assert.ok(r);
	assert.equal(r.agent, "changement-nature");
});

test("changement nature négatif", () => {
	const r = detecterChangementNature({
		orgId: 1,
		historique: [{ family: "vol", severity: 4 }],
		nouveau: { id: 6, orgId: 1, family: "vol", date: new Date(NOW).toISOString(), severity: 5, zone: "z" },
	});
	assert.equal(r, null);
});
