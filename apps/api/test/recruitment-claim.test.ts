/**
 * Claim/recruitment measurement: one behaviour per test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	analyseRecruitmentClaims,
	fisherOneSidedP,
	isIntermediaryEmployer,
	isRssiTitle,
	normaliseOrganisationName,
	type ClaimRecord,
	type RecruitmentClaimInput,
	type RecruitmentOffer,
} from "../src/analyse/recruitment-claim.js";
import { parseOfferPage, publicationDateFromLabel } from "../src/collectors/france-travail-offers.js";

const COLLECTED = "2026-11-22T12:00:00Z";
const AS_OF = "2026-11-21T16:00:00Z";

function offer(overrides: Partial<RecruitmentOffer> = {}): RecruitmentOffer {
	return {
		id: "o1", organisation: "Syndicat Intercommunal", department: "79",
		title: "Manager de Transition - RSSI H/F", publishedAt: "2026-11-02T00:00:00Z",
		url: "https://example.invalid/o1", source: "test", query: "RSSI", ...overrides,
	};
}

function claim(overrides: Partial<ClaimRecord> = {}): ClaimRecord {
	return {
		id: "c1", orgId: "1", orgName: "Syndicat Intercommunal",
		kind: "third_party_claim", at: "2026-11-10T10:00:00Z", isNa: true, ...overrides,
	};
}

function input(overrides: Partial<RecruitmentClaimInput> = {}): RecruitmentClaimInput {
	return { asOf: AS_OF, offers: [offer()], claims: [claim()], population: 1000, ...overrides };
}

test("recognises strict RSSI and CISO titles only", () => {
	assert.equal(isRssiTitle("Manager de Transition - RSSI H/F"), true);
	assert.equal(isRssiTitle("Chief Information Security Officer"), true);
	assert.equal(isRssiTitle("Responsable sécurité des systèmes d'information"), true);
	assert.equal(isRssiTitle("Ingénieur Réseaux LAN / WiFi / WAN"), false);
	assert.equal(isRssiTitle("Ingénieur Cyber-Résilience / Architecte Sécurité SI"), false);
	assert.equal(isRssiTitle("Consultant GRC H/F"), false);
});

test("excludes staffing agencies from employer signals", () => {
	assert.equal(isIntermediaryEmployer("Randstad professional"), true);
	assert.equal(isIntermediaryEmployer("Cabinet de recrutement Atlantique"), true);
	assert.equal(isIntermediaryEmployer("SYD Digital Care"), false);
});

test("normalises organisation names before joining records", () => {
	assert.equal(normaliseOrganisationName("SYD Digital Care"), "syd digital care");
	assert.equal(normaliseOrganisationName("Communauté d'Agglomération — Niort"), "communaute d agglomeration niort");
	assert.equal(normaliseOrganisationName("---"), "");
});

test("derives a publication day from each relative label", () => {
	assert.equal(publicationDateFromLabel("Publié il y a 2 jours", COLLECTED), "2026-11-20T00:00:00Z");
	assert.equal(publicationDateFromLabel("Publié hier", COLLECTED), "2026-11-21T00:00:00Z");
	assert.equal(publicationDateFromLabel("Publié aujourd'hui", COLLECTED), "2026-11-22T00:00:00Z");
	assert.equal(publicationDateFromLabel("Publié il y a 3 heures", COLLECTED), "2026-11-22T00:00:00Z");
	assert.equal(publicationDateFromLabel("date inconnue", COLLECTED), null);
});

test("parses a result page without reading candidate fields", () => {
	const page = `
		<div data-id-offre="A1" class="result">
		  <h2 class="t4 media-heading"><span class="media-heading-title">Manager de Transition - RSSI H/F</span></h2>
		  <p translate="no" class="subtext">SYD Digital Care</p>
		  <span> - 79 - NIORT </span><span>Publié il y a 2 jours</span>
		  <p class="candidate">candidate name: Jean Dupont</p>
		</div>
		<div data-id-offre="A2" class="result">
		  <h2><span class="media-heading-title">RSSI adjoint</span></h2>
		  <p translate="no" class="subtext">Université Exemple</p>
		  <span> - 75 - PARIS </span><span>Publié aujourd'hui</span>
		</div>`;
	const offers = parseOfferPage(page, COLLECTED, "RSSI");
	assert.equal(offers.length, 2);
	assert.deepEqual(Object.keys(offers[0]!).sort(), [
		"department", "id", "organisation", "publishedAt", "query", "source", "title", "url",
	]);
	assert.deepEqual(
		[offers[0]!.id, offers[0]!.organisation, offers[0]!.department, offers[0]!.publishedAt],
		["A1", "SYD Digital Care", "79", "2026-11-20T00:00:00Z"],
	);
	assert.equal(offers[1]?.department, "75");
	assert.equal(JSON.stringify(offers).includes("Jean Dupont"), false);
});

test("builds a zero-filled twelve-month window", () => {
	const result = analyseRecruitmentClaims(input());
	assert.equal(result.window.length, 12);
	assert.equal(result.window[0], "2025-12");
	assert.equal(result.window[11], "2026-11");
	assert.equal(result.monthly.length, 12);
	assert.equal(result.monthly.filter((m) => m.claims === 0).length, 11);
	assert.equal(result.monthly[11]?.claims, 1);
	assert.equal(result.monthly[11]?.offers, 1);
	assert.equal(result.checks.windowHas12Months, true);
});

test("ignores non-claims, non-NA records and claims outside the window", () => {
	const result = analyseRecruitmentClaims(input({
		claims: [
			claim(),
			claim({ id: "c2", kind: "confirmed_incident" }),
			claim({ id: "c3", isNa: false }),
			claim({ id: "c4", at: "2025-11-30T10:00:00Z" }),
			claim({ id: "c5", at: "2026-12-02T10:00:00Z" }),
			claim({ id: "c6", orgId: "" }),
		],
		offers: [offer(), offer({ id: "o2", department: "75" })],
	}));
	assert.equal(result.counts.claims, 1);
	assert.equal(result.counts.recruitmentOffers, 1);
	assert.equal(result.checks.naOnly, true);
	assert.equal(result.checks.thirdPartyClaimsOnly, true);
});

test("counts exposure only when the offer predates the first claim", () => {
	const before = analyseRecruitmentClaims(input({ offers: [offer({ publishedAt: "2026-11-01T00:00:00Z" })] }));
	assert.equal(before.counts.exposedVictims, 1);
	const after = analyseRecruitmentClaims(input({ offers: [offer({ publishedAt: "2026-11-15T00:00:00Z" })] }));
	assert.equal(after.counts.exposedVictims, 0);
});

test("rejects generic titles and intermediary employers at analysis time", () => {
	const result = analyseRecruitmentClaims(input({
		offers: [
			offer({ id: "generic", title: "Responsable Réseaux & Sécurité" }),
			offer({ id: "agency", organisation: "Randstad professional" }),
		],
	}));
	assert.equal(result.counts.recruitmentOffers, 0);
	assert.equal(result.counts.recruitingOrganisations, 0);
	assert.equal(result.counts.exposedVictims, 0);
});

test("computes odds ratio and one-sided Fisher tail for a positive table", () => {
	const result = analyseRecruitmentClaims(input({
		population: 1007,
		claims: [
			...Array.from({ length: 4 }, (_, i) => claim({ id: `case-${i}`, orgId: `case-${i}`, orgName: `Exposed ${i}` })),
			...Array.from({ length: 2 }, (_, i) => claim({ id: `ctrl-${i}`, orgId: `ctrl-${i}`, orgName: `Other ${i}` })),
		],
		offers: Array.from({ length: 5 }, (_, i) => offer({ id: `job-${i}`, organisation: `Exposed ${i}` })),
	}));
	assert.deepEqual(result.table, { exposedCases: 4, exposedControls: 1, unexposedCases: 2, unexposedControls: 1000 });
	assert.equal(result.statistics.oddsRatio, 2000);
	assert.ok(result.statistics.pValue < 0.05);
	assert.equal(result.statistics.verdict, "positive_association");
});

test("reports no positive association when zero victims were recruiting", () => {
	const result = analyseRecruitmentClaims(input({ claims: [claim({ orgName: "Autre structure" })] }));
	assert.equal(result.statistics.oddsRatio, 0);
	assert.equal(result.statistics.pValue, 1);
	assert.equal(result.statistics.verdict, "no_positive_association");
	assert.ok(fisherOneSidedP(0, 1, 21, 1_671_885) === 1);
});

test("keeps the no-personal-data contract", () => {
	const result = analyseRecruitmentClaims(input());
	assert.equal(result.checks.noPersonalDataFields, true);
	const dirty = analyseRecruitmentClaims(input({
		offers: [{ ...offer(), victimName: "Jean Dupont" } as RecruitmentOffer],
	}));
	assert.equal(dirty.checks.noPersonalDataFields, false);
});

test("replays identically for identical inputs", () => {
	const first = analyseRecruitmentClaims(input());
	const second = analyseRecruitmentClaims(input());
	assert.deepEqual(first, second);
	assert.equal(JSON.stringify(first).includes("Syndicat Intercommunal"), false);
});
