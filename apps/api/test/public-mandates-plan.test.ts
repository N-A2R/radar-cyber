/**
 * Public office referential — one test per derivation rule, no database.
 *
 * The first two checks run on the real versioned Nouvelle-Aquitaine dataset;
 * the others use small synthetic organisations to isolate a single rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	MANDATE_FIELDS,
	MANDATE_ROLES,
	NA_DEPARTMENTS,
	personalDataFindings,
	planPublicMandates,
	planPublicMandatesFromOrgs,
} from "../src/public-mandates/plan.js";
import { planReferentiel } from "../src/referentiel/plan.js";
import type { PlannedOrg } from "../src/referentiel/plan.js";
import type { ReferentielNA } from "../src/referentiel/model.js";

const data = JSON.parse(
	readFileSync(new URL("../../../db/data/referentiel-na.json", import.meta.url), "utf8"),
) as ReferentielNA;
const referential = planReferentiel(data);
const offices = planPublicMandates(referential);

function org(overrides: Partial<PlannedOrg> = {}): PlannedOrg {
	return {
		slug: "na-commune-16001",
		name: "Commune de test",
		kind: "collectivite",
		sector: "commune",
		city: "Test",
		dept: "16",
		siren: "211600010",
		lat: 45,
		lon: 0,
		geoSource: "admin-express-centroide",
		status: "confirme",
		entityCode: "16001",
		codesPostaux: [],
		population: null,
		aliases: [],
		...overrides,
	};
}

test("real dataset gives one office to every territorial authority", () => {
	assert.equal(offices.counts.total, referential.counts.orgs);
	assert.equal(offices.mandates.length, referential.counts.orgs);
	assert.deepEqual(offices.warnings, []);
	assert.deepEqual(Object.keys(NA_DEPARTMENTS).sort(), ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"]);
	assert.equal(offices.counts.byRole.mayor, referential.counts.communes);
	assert.equal(offices.counts.byRole.epci_president, referential.counts.epci);
	assert.equal(offices.counts.byRole.department_president, referential.counts.departements);
	assert.equal(offices.counts.byRole.region_president, referential.counts.regions);
	assert.deepEqual(
		Object.keys(offices.counts.byRole).sort(),
		[...MANDATE_ROLES].sort(),
	);
	assert.ok(Object.values(offices.counts.byRole).every((n) => n > 0));
	for (const mandate of offices.mandates) {
		assert.ok(mandate.jurisdictionCode.length > 0);
		assert.ok(mandate.source.length > 0);
		assert.ok(mandate.proofUrl.startsWith("https://"));
	}
});

test("cross-border EPCI keeps its office with no invented department", () => {
	const crossBorder = referential.orgs.filter(
		(o) => o.sector === "epci" && o.dept === null,
	);
	assert.ok(crossBorder.length > 0, "the real dataset has cross-border EPCI");
	const kept = offices.mandates.filter(
		(m) => m.jurisdictionKind === "epci" && m.dept === null,
	);
	assert.equal(kept.length, crossBorder.length);
	assert.deepEqual(
		kept.map((m) => m.jurisdictionCode).sort(),
		crossBorder.map((o) => o.entityCode).sort(),
	);
});

test("only Nouvelle-Aquitaine collectivities get an office", () => {
	const result = planPublicMandatesFromOrgs([
		org(),
		org({ slug: "na-commune-75001", entityCode: "75001", dept: "75" }),
		org({ slug: "na-departement-75", sector: "departement", entityCode: "75", dept: "75" }),
		org({ slug: "na-region-84", sector: "region", entityCode: "84", dept: null }),
		org({ slug: "hospital-16", kind: "sante", sector: "commune" }),
		org({ slug: "shop-16", kind: "entreprise", sector: "commerce" }),
	]);
	assert.equal(result.counts.total, 1);
	assert.equal(result.mandates[0].orgSlug, "na-commune-16001");
	assert.equal(result.mandates[0].mandateRole, "mayor");
	assert.equal(result.warnings.length, 3);
});

test("a duplicate jurisdiction yields a single office", () => {
	const result = planPublicMandatesFromOrgs([
		org(),
		org({ slug: "na-commune-16001-copy", siren: "299999999" }),
	]);
	assert.equal(result.counts.total, 1);
	assert.equal(result.warnings.length, 1);
	assert.match(result.warnings[0], /duplicate office/);
});

test("no office row carries personal or victim data", () => {
	assert.deepEqual(personalDataFindings(offices.mandates), []);
	for (const mandate of offices.mandates) {
		assert.deepEqual(Object.keys(mandate).sort(), [...MANDATE_FIELDS].sort());
	}
	const sampled = personalDataFindings([
		{ ...offices.mandates[0], email: "maire@example.fr" } as typeof offices.mandates[number],
	]);
	assert.ok(sampled.length > 0, "an added personal field must be detected");
});

test("raw organisations can be planned without a referential plan", () => {
	const result = planPublicMandatesFromOrgs([org()]);
	assert.equal(result.counts.total, 1);
	assert.equal(result.counts.byRole.mayor, 1);
});
