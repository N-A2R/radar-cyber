/** Behaviour tests for the reproducible domain coverage metric. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	formatCoverage,
	hasVerifiedProvenance,
	inNouvelleAquitaine,
	normalizeDomain,
	summarizeCoverage,
	type CoverageRow,
} from "../../../scripts/domain-coverage.mts";

const row = (overrides: Partial<CoverageRow> = {}): CoverageRow => ({
	organisation: { id: 1, dept: "16", domain: "angouleme.fr" },
	provenance: {
		orgId: 1, champ: "domaine", valeur: "https://www.angouleme.fr/", source: "wikidata:P856:http200",
		confiance: 0.95,
		preuve: { statut: 200, urlFinale: "https://www.angouleme.fr/accueil", token: "angouleme" },
	},
	...overrides,
});

describe("domain coverage", () => {
	it("normalizes domains to a lowercase host root", () => {
		assert.equal(normalizeDomain("HTTPS://WWW.Angouleme.fr/actualite"), "angouleme.fr");
		assert.equal(normalizeDomain("  angouleme.fr.  "), "angouleme.fr");
		assert.equal(normalizeDomain("not a host"), null);
		assert.equal(normalizeDomain("http://127.0.0.1/"), null);
		assert.equal(normalizeDomain(null), null);
	});

	it("limits the scope to Nouvelle-Aquitaine departments", () => {
		assert.equal(inNouvelleAquitaine("16"), true);
		assert.equal(inNouvelleAquitaine("33"), true);
		assert.equal(inNouvelleAquitaine("75"), false);
		assert.equal(inNouvelleAquitaine(null), false);
	});

	it("counts a domain only with matching source, confidence and HTTP proof", () => {
		assert.equal(hasVerifiedProvenance(row()), true);
		assert.equal(hasVerifiedProvenance(row({ provenance: null })), false);
		assert.equal(hasVerifiedProvenance(row({
			provenance: { ...row().provenance!, valeur: "autre.fr" },
		})), false);
		assert.equal(hasVerifiedProvenance(row({
			provenance: { ...row().provenance!, preuve: { statut: 404, urlFinale: "https://www.angouleme.fr/" } },
		})), false);
		assert.equal(hasVerifiedProvenance(row({
			provenance: { ...row().provenance!, source: "" },
		})), false);
		assert.equal(hasVerifiedProvenance(row({
			organisation: { id: 2, dept: "75", domain: "angouleme.fr" },
		})), false);
	});

	it("computes coverage against the Nouvelle-Aquitaine population", () => {
		const outside = row({ organisation: { id: 3, dept: "75", domain: "paris.fr" } });
		const noProof = row({ organisation: { id: 4, dept: "17", domain: "rochelle.fr" }, provenance: null });
		const summary = summarizeCoverage([row(), outside, noProof], 1_673_221, 2);
		assert.deepEqual(summary, {
			organisations: 1_673_221,
			nouvelleAquitaine: 2,
			withDomain: 2,
			withVerifiedProvenance: 1,
			coveragePercent: 50,
		});
	});

	it("prints stable machine-readable keys", () => {
		const text = formatCoverage(summarizeCoverage([row()], 10, 1));
		assert.match(text, /^organisations_total=10$/m);
		assert.match(text, /^organisations_avec_domaine_verifie_et_provenance=1$/m);
		assert.match(text, /^couverture_pourcent=100$/m);
	});
});
