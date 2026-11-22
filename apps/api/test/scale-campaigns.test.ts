/**
 * One test per observable behaviour of the large-scale campaign anchors.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyserCampagnes, type EvenementCampagne } from "../src/analyse/campagnes.js";
import { extractScaleSignals, normalizeHeadline } from "../src/analyse/scale-signals.js";

function event(id: number, overrides: Partial<EvenementCampagne> = {}): EvenementCampagne {
	return {
		id,
		family: "vuln",
		title: "Multiples vulnerabilities in the Linux kernel of SUSE (13 November 2026)",
		observedAt: "2026-11-17T10:00:00.000Z",
		sourceId: "nvd_cve",
		sourceUrl: null,
		orgId: null,
		sector: null,
		evidence: {},
		...overrides,
	};
}

test("two sources reporting the same CVE form one vulnerability campaign", () => {
	const analyse = analyserCampagnes([
		event(1, { title: "CVE-2026-114938 - template injection in Acme", sourceId: "nvd_cve" }),
		event(2, {
			title: "Qualys advisory: CVE-2026-114938 affects Acme",
			sourceId: "cat-qualys-blog",
			observedAt: "2026-11-19T10:00:00.000Z",
		}),
	]);

	assert.equal(analyse.rapport.campagnes, 1);
	const campagne = analyse.campagnes[0];
	assert.deepEqual(campagne?.incidents, [1, 2]);
	assert.equal(campagne?.label, "CVE-2026-114938");
	assert.equal(campagne?.preuve.liens[0]?.motif, "cve:CVE-2026-114938");
	assert.deepEqual(campagne?.sourceIds, ["cat-qualys-blog", "nvd_cve"]);
});

test("an explicit CVE in evidence is an anchor even when the title has none", () => {
	const analyse = analyserCampagnes([
		event(3, { title: "Vendor bulletin 41", evidence: { cve: "CVE-2026-124194" } }),
		event(4, {
			title: "Vendor bulletin 42",
			sourceId: "cisa_kev",
			evidence: { cveId: "cve-2026-124194" },
		}),
	]);

	assert.deepEqual(analyse.campagnes[0]?.incidents, [3, 4]);
	assert.equal(analyse.campagnes[0]?.preuve.liens[0]?.motif, "cve:CVE-2026-124194");
});

test("different CVEs never create a link", () => {
	const analyse = analyserCampagnes([
		event(5, { title: "CVE-2026-114938 in Acme", sourceId: "nvd_cve" }),
		event(6, { title: "CVE-2026-121652 in Beta", sourceId: "cisa_kev" }),
	]);

	assert.equal(analyse.rapport.campagnes, 0);
	assert.deepEqual(analyse.isoles.map((i) => i.id), [5, 6]);
});

test("an identical advisory headline from two sources is a campaign", () => {
	const titre = "Multiples vulnerabilites dans le noyau linux de suse (13 novembre 2026)";
	const analyse = analyserCampagnes([
		event(7, { title: titre, sourceId: "cert-fr-avis" }),
		event(8, { title: titre, sourceId: "cert-eu-page", observedAt: "2026-11-18T10:00:00.000Z" }),
	]);

	assert.equal(analyse.rapport.campagnes, 1);
	assert.deepEqual(analyse.campagnes[0]?.incidents, [7, 8]);
	assert.equal(analyse.campagnes[0]?.preuve.liens[0]?.motif, `headline:${normalizeHeadline(titre)}`);
});

test("one source alone cannot create a headline campaign", () => {
	const titre = "Multiples vulnerabilites dans le noyau linux de suse (13 novembre 2026)";
	const analyse = analyserCampagnes([
		event(9, { title: titre, sourceId: "cert-fr-avis" }),
		event(10, { title: titre, sourceId: "cert-fr-avis", observedAt: "2026-11-18T10:00:00.000Z" }),
	]);

	assert.equal(analyse.rapport.campagnes, 0);
	assert.deepEqual(analyse.isoles.map((i) => i.raison), ["sans_ancre", "sans_ancre"]);
});

test("short generic headlines are not treated as campaigns", () => {
	const analyse = analyserCampagnes([
		event(11, { title: "Attack Map", sourceId: "ransom-ransomwarelive" }),
		event(12, { title: "Attack Map", sourceId: "ransom-binaryresponse" }),
	]);

	assert.equal(analyse.rapport.campagnes, 0);
	assert.deepEqual(analyse.isoles.map((i) => i.raison), ["sans_ancre", "sans_ancre"]);
});

test("a CVE anchor never merges two event families", () => {
	const analyse = analyserCampagnes([
		event(13, { family: "vuln", title: "CVE-2026-114938 in Acme" }),
		event(14, { family: "cti", title: "CVE-2026-114938 in Acme", sourceId: "cat-qualys-blog" }),
	]);

	assert.equal(analyse.rapport.campagnes, 0);
});

test("CVE anchors respect the thirty-day window", () => {
	const analyse = analyserCampagnes([
		event(15, { title: "CVE-2026-114938 in Acme" }),
		event(16, {
			title: "CVE-2026-114938 in Acme",
			sourceId: "cat-qualys-blog",
			observedAt: "2026-12-20T10:00:00.000Z",
		}),
	]);

	assert.equal(analyse.rapport.campagnes, 0);
});

test("victim contact details are stripped from anchors and labels", () => {
	const first = "Security advisory about contact jean.dupont@example.com at Acme Corporation";
	const second = "Security advisory about contact other.person@example.net at Acme Corporation";
	const signaux = extractScaleSignals(event(17, { title: first }));
	assert.ok(!JSON.stringify(signaux).includes("jean.dupont"));

	const analyse = analyserCampagnes([
		event(18, { title: first, sourceId: "cert-fr-avis" }),
		event(19, { title: second, sourceId: "cert-eu-page" }),
	]);

	assert.equal(analyse.rapport.campagnes, 1);
	const label = analyse.campagnes[0]?.label ?? "";
	assert.ok(!label.includes("@"), `label must not contain an e-mail address: ${label}`);
	assert.ok(!label.includes("jean"), `label must not contain a victim name: ${label}`);
});

test("a lone CVE event is isolated for lack of a neighbour, not for lack of an anchor", () => {
	const analyse = analyserCampagnes([event(20, { title: "CVE-2026-114938 in Acme" })]);

	assert.deepEqual(analyse.isoles, [{ id: 20, raison: "sans_voisin" }]);
});
