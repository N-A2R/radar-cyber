/** Un comportement par test : réemploi des URL d'exposition prouvées HTTP 200. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	provenanceForExposition, selectExpositionCandidates, type ExpositionRow,
} from "../../../scripts/expand-domains-exposition.mts";

function row(overrides: Partial<ExpositionRow> = {}): ExpositionRow {
	return {
		serviceId: 1, orgId: 10, name: "COMMUNE DE BOULAZAC", city: "Boulazac", dept: "24",
		siren: "111111111", source: "osm-http-200", sourceUrl: "https://www.ville-boulazac.fr/",
		provider: "osm:website", evidenceDomain: "ville-boulazac.fr",
		consultedAt: "2026-11-23T10:00:00Z",
		...overrides,
	};
}

describe("exposition-backed domain route", () => {
	it("keeps one candidate per organisation and per domain root", () => {
		const selected = selectExpositionCandidates([
			row(), row({ serviceId: 2, sourceUrl: "https://ville-boulazac.fr/contact" }),
			row({ serviceId: 3, orgId: 11, sourceUrl: "https://autre.fr", evidenceDomain: "autre.fr" }),
		], new Set());
		assert.deepEqual(selected.map((entry) => entry.row.serviceId), [1, 3]);
	});

	it("rejects marketplace hosts and URLs whose root differs from the evidence", () => {
		const selected = selectExpositionCandidates([
			row({ serviceId: 2, evidenceDomain: "orpi.com", sourceUrl: "https://www.orpi.com" }),
			row({ serviceId: 3, sourceUrl: "https://autre.fr/mairie" }),
		], new Set());
		assert.deepEqual(selected, []);
	});

	it("does not reuse a domain already attributed to another organisation", () => {
		const selected = selectExpositionCandidates([row()], new Set(["ville-boulazac.fr"]));
		assert.deepEqual(selected, []);
	});

	it("traces the registry and the live HTTP proof", () => {
		const [selection] = selectExpositionCandidates([row()], new Set());
		const proof = provenanceForExposition(selection, {
			ok: true, motif: "http200-title-and-body", token: "boulazac", confidence: 0.95,
			title: "Boulazac", status: 200, finalUrl: "https://ville-boulazac.fr/", htmlLength: 900,
		});
		assert.equal(proof.source, "exposition-service:http200");
		assert.equal(proof.preuve.registre, "osm-http-200");
		assert.equal(proof.preuve.provider, "osm:website");
		assert.equal(proof.preuve.statut, 200);
		assert.equal(proof.preuve.urlFinale, "https://ville-boulazac.fr/");
	});
});
