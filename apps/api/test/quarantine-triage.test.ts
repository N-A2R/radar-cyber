/**
 * Priorisation de la file de revue — contrôles sans base.
 *
 * Les cas viennent du vrai corpus `bench/fixtures/claims-sample.json` : titres
 * structurés des sites de fuite, domaines seuls, revendications étrangères.
 * On verrouille surtout deux choses : un pays déclaré hors France ne doit
 * jamais être suggéré à la promotion, et un désaccord entre moteurs doit
 * toujours finir en revue humaine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareQueueEntries, declaredCountryOf, triageClaim, type ClaimInput } from "../src/quarantine/triage.js";

const NOW = new Date("2026-11-12T00:00:00Z");

function claim(overrides: Partial<ClaimInput> = {}): ClaimInput {
	return {
		orgHint: "Commune de Pessac",
		groupe: "lockbit3",
		claimedAt: "2026-11-01",
		receivedAt: "2026-11-10",
		hasDescription: true,
		tlp: "RED",
		...overrides,
	};
}

test("titre structuré : le pays déclaré est extrait", () => {
	assert.equal(declaredCountryOf("millimages.com\\$12.6M\\France\\147GB\\100% DISCLOSED"), "France");
	assert.equal(declaredCountryOf("acme.com\\$5M\\United States\\20GB\\<1% DISCLOSED"), "United States");
	assert.equal(declaredCountryOf("Commune de Pessac"), null);
	// Un état de divulgation n'est pas un pays, même sans chiffre.
	assert.equal(declaredCountryOf("acme.com\\$5M\\DISCLOSED"), null);
	assert.equal(declaredCountryOf("acme.com\\$5M\\100% DISCLOSED"), null);
});

test("rattachement fort et récent : chaud, suggestion de promotion", () => {
	const result = triageClaim(claim(), { orgId: 1, confidence: 0.95 }, { orgId: 1, confidence: 1 }, NOW);
	assert.equal(result.bucket, "chaud");
	assert.equal(result.suggested, "promote");
	assert.equal(result.disagreement, false);
	assert.ok(result.score >= 70);
	assert.ok(result.reasons.some((r) => r.label.includes("concordent")));
});

test("pays déclaré hors France : jamais suggéré à la promotion", () => {
	const result = triageClaim(
		claim({ orgHint: "acme.com\\$5M\\United States\\20GB\\100% DISCLOSED" }),
		{ orgId: 7, confidence: 0.95 },
		{ orgId: 7, confidence: 1 },
		NOW,
	);
	assert.equal(result.declaredCountry, "United States");
	assert.equal(result.suggested, "reject");
	assert.ok(result.reasons.some((r) => r.label.includes("hors France")));
});

test("pays déclaré France : remonte nettement", () => {
	const withCountry = triageClaim(
		claim({ orgHint: "millimages.com\\$12.6M\\France\\147GB\\100% DISCLOSED" }),
		null, null, NOW,
	);
	const without = triageClaim(claim({ orgHint: "millimages.com" }), null, null, NOW);
	assert.ok(withCountry.score > without.score, "le pays déclaré France doit peser");
	assert.equal(withCountry.declaredCountry, "France");
});

test("désaccord entre moteurs : revue obligatoire, même avec un score élevé", () => {
	const result = triageClaim(claim(), { orgId: 1, confidence: 0.95 }, { orgId: 2, confidence: 0.9 }, NOW);
	assert.equal(result.disagreement, true);
	assert.equal(result.suggested, "review");
	assert.ok(result.reasons.some((r) => r.label.includes("divergent")));
});

test("moteur fort muet sur l'autre : désaccord aussi", () => {
	const result = triageClaim(claim(), { orgId: 1, confidence: 0.9 }, null, NOW);
	assert.equal(result.disagreement, true);
	assert.equal(result.suggested, "review");
});

test("indice vide : rejet, score plancher", () => {
	const result = triageClaim(claim({ orgHint: "" }), null, null, NOW);
	assert.equal(result.suggested, "reject");
	assert.equal(result.bucket, "froid");
	assert.ok(result.reasons.some((r) => r.label.includes("aucun indice")));
});

test("domaine seul : signalé comme tel", () => {
	const result = triageClaim(claim({ orgHint: "powertestdyno.com" }), null, null, NOW);
	assert.equal(result.domainOnly, true);
	assert.ok(result.reasons.some((r) => r.label.includes("domaine")));
	assert.equal(declaredCountryOf("powertestdyno.com"), null);
});

test("fraîcheur : c'est l'arrivée dans la file qui compte, pas la publication", () => {
	// Stock rejoué : revendication de 2024, mais entrée aujourd'hui dans la
	// file. Elle doit rester traitable, sinon tout le stock est « froid ».
	const replayed = triageClaim(
		claim({ claimedAt: "2024-06-01", receivedAt: "2026-11-11" }), null, null, NOW,
	);
	const stale = triageClaim(
		claim({ claimedAt: "2024-06-01", receivedAt: "2024-06-02" }), null, null, NOW,
	);
	assert.ok(replayed.score > stale.score, "le stock rejoué ne doit pas être écrasé");
	assert.ok(replayed.reasons.some((r) => r.label.includes("arrivé dans la file")));
	assert.ok(stale.reasons.some((r) => r.label.includes("en attente depuis")));
	assert.ok(replayed.reasons.some((r) => r.label.includes("stock ancien")));
	const unknown = triageClaim(claim({ claimedAt: null, receivedAt: null }), null, null, NOW);
	assert.ok(unknown.reasons.some((r) => r.label.includes("inconnue")));
});

test("trou du référentiel : indice français sans correspondance, à ajouter", () => {
	const gap = triageClaim(claim({ orgHint: "Groupe Bayard" }), null, null, NOW);
	assert.equal(gap.referentialGap, true);
	assert.equal(gap.suggested, "review");
	assert.ok(gap.reasons.some((r) => r.label.includes("absente du référentiel")));
	const foreign = triageClaim(claim({ orgHint: "Ohio Power Tools" }), null, null, NOW);
	assert.equal(foreign.referentialGap, false);
});

test("score borné entre 0 et 100", () => {
	const worst = triageClaim(claim({ orgHint: "", claimedAt: null, hasDescription: false }), null, null, NOW);
	const best = triageClaim(
		claim({ orgHint: "x.fr\\$1M\\France\\1GB\\etat", hasDescription: true }),
		{ orgId: 1, confidence: 1 }, { orgId: 1, confidence: 1 }, NOW,
	);
	assert.ok(worst.score >= 0 && worst.score <= 100);
	assert.ok(best.score >= 0 && best.score <= 100);
});

test("ordre de file : score, puis date, puis identifiant", () => {
	const entries = [
		{ id: 1, score: 50, claimedAt: "2026-01-01" },
		{ id: 2, score: 80, claimedAt: "2025-01-01" },
		{ id: 3, score: 50, claimedAt: "2026-06-01" },
		{ id: 4, score: 50, claimedAt: "2026-06-01" },
	];
	assert.deepEqual([...entries].sort(compareQueueEntries).map((e) => e.id), [2, 4, 3, 1]);
});

test("corpus réel : aucune revendication étrangère déclarée n'est promue", () => {
	const fixture = JSON.parse(
		readFileSync(new URL("../../../bench/fixtures/claims-sample.json", import.meta.url), "utf8"),
	) as { claims: Array<{ title: string; group: string; discovered: string }> };
	assert.equal(fixture.claims.length, 500);

	let foreign = 0;
	let french = 0;
	for (const item of fixture.claims) {
		const result = triageClaim(
			{ orgHint: item.title, groupe: item.group, claimedAt: item.discovered, hasDescription: false },
			null, null, NOW,
		);
		if (result.declaredCountry && result.declaredCountry.toLowerCase() !== "france") {
			foreign++;
			assert.equal(result.suggested, "reject", `« ${item.title} » ne doit pas être promu`);
		}
		if (result.declaredCountry?.toLowerCase() === "france") french++;
		assert.ok(result.score >= 0 && result.score <= 100);
		assert.ok(result.reasons.length > 0, "chaque décision porte sa trace");
	}
	assert.ok(foreign > 50, `le corpus doit contenir des pays étrangers déclarés (${foreign})`);
	assert.ok(french > 0, `le corpus doit contenir des revendications déclarées France (${french})`);
});
