/**
 * Admission des événements — le contrat appliqué.
 *
 * Deux exigences opposées à tenir ensemble :
 *  - ne jamais laisser passer une famille ou une assertion inventée ;
 *  - ne jamais jeter un incident réel pour une broutille réparable.
 * Chaque cas tranche explicitement d'un côté ou de l'autre. Fonction pure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AdmissionTally, admitEvent } from "../src/contract/admit.js";

const valid = {
	dedupKey: "feed:exemple:abcdef123456",
	family: "vuln",
	assertionType: "technical_indicator",
	title: "CVE-2026-1234 — élévation de privilèges",
	sourceId: "nvd",
};

test("un événement conforme passe et reçoit les défauts du contrat", () => {
	const result = admitEvent({ ...valid });
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.event.severity, 3);
	assert.equal(result.event.geoType, "unknown");
	assert.deepEqual(result.event.evidence, {});
	assert.deepEqual(result.repairs, []);
});

test("famille hors contrat : rejet, jamais de passe-plat", () => {
	for (const family of ["darkweb", "presse-libre", "", null, undefined]) {
		const result = admitEvent({ ...valid, family });
		assert.equal(result.ok, false, `famille ${String(family)} doit être refusée`);
		if (!result.ok) assert.ok(result.rejections.includes("famille-inconnue"));
	}
});

test("les familles élargies passent l'admission", () => {
	// Arbitrage utilisateur : leaks, paste, presse_cyber et presse_locale entrent au contrat.
	// Les 8 sources actives qui les déclarent ne doivent pas être réduites au silence.
	for (const family of ["leaks", "paste", "presse_cyber", "presse_locale"]) {
		const result = admitEvent({ ...valid, family });
		assert.equal(result.ok, true, `${family} doit être admis`);
		if (result.ok) assert.equal(result.event.family, family);
	}
});

test("assertion inconnue : rejet — le sens ne se devine pas", () => {
	const result = admitEvent({ ...valid, assertionType: "probably_an_incident" });
	assert.equal(result.ok, false);
	if (!result.ok) assert.ok(result.rejections.includes("assertion-inconnue"));
});

test("clé de déduplication absente ou trop courte : rejet", () => {
	for (const dedupKey of ["", "   ", "court", null, undefined]) {
		assert.equal(admitEvent({ ...valid, dedupKey }).ok, false, `clé ${String(dedupKey)}`);
	}
	assert.equal(admitEvent({ ...valid, dedupKey: "12345678" }).ok, true, "huit caractères : borne acceptée");
});

test("source absente : rejet — sans provenance, pas d'audit possible", () => {
	const result = admitEvent({ ...valid, sourceId: "  " });
	assert.equal(result.ok, false);
	if (!result.ok) assert.ok(result.rejections.includes("source-absente"));
});

test("titre : absent ou trop court rejeté, espaces et longueur réparés", () => {
	assert.equal(admitEvent({ ...valid, title: "" }).ok, false);
	assert.equal(admitEvent({ ...valid, title: "ab" }).ok, false);

	const spaced = admitEvent({ ...valid, title: "  Alerte   multiple\tsur  une ligne  " });
	assert.equal(spaced.ok, true);
	if (!spaced.ok) return;
	assert.equal(spaced.event.title, "Alerte multiple sur une ligne");
	assert.ok(spaced.repairs.includes("titre-espaces"));

	const long = admitEvent({ ...valid, title: "x".repeat(600) });
	assert.equal(long.ok, true);
	if (!long.ok) return;
	assert.equal(long.event.title.length, 400);
	assert.ok(long.repairs.includes("titre-tronque"));
});

test("sévérité : bornée et arrondie, jamais inventée si illisible", () => {
	const cases: Array<[unknown, number, string | null]> = [
		[9, 5, "severite-bornes"], [0, 1, "severite-bornes"], [-4, 1, "severite-bornes"],
		[4.7, 4, "severite-arrondie"], ["4", 4, null], ["high", 3, "severite-illisible"],
	];
	for (const [input, expected, repair] of cases) {
		const result = admitEvent({ ...valid, severity: input });
		assert.equal(result.ok, true, `sévérité ${String(input)} ne doit pas faire perdre l'événement`);
		if (!result.ok) continue;
		assert.equal(result.event.severity, expected, `sévérité ${String(input)}`);
		if (repair) assert.ok(result.repairs.includes(repair as never), `trace attendue : ${repair}`);
	}
});

test("confidence : casse réparée, code invalide écarté sans jeter l'événement", () => {
	const lower = admitEvent({ ...valid, confidence: "b2" });
	assert.equal(lower.ok, true);
	if (!lower.ok) return;
	assert.equal(lower.event.confidence, "B2");
	assert.ok(lower.repairs.includes("confidence-casse"));

	const junk = admitEvent({ ...valid, confidence: "haute" });
	assert.equal(junk.ok, true);
	if (!junk.ok) return;
	assert.equal(junk.event.confidence, undefined);
	assert.ok(junk.repairs.includes("confidence-illisible"));

	for (const code of ["A1", "F6"]) assert.equal(admitEvent({ ...valid, confidence: code }).ok, true);
	for (const code of ["G1", "A7", "A0"]) {
		const result = admitEvent({ ...valid, confidence: code });
		assert.equal(result.ok, true);
		if (result.ok) assert.equal(result.event.confidence, undefined, `${code} n'est pas Admiralty`);
	}
});

test("date : normalisée en ISO, illisible écartée sans rejet", () => {
	const iso = admitEvent({ ...valid, observedAt: "2026-03-01T10:00:00Z" });
	assert.equal(iso.ok, true);
	if (iso.ok) assert.equal(iso.event.observedAt, "2026-03-01T10:00:00.000Z");

	const rfc = admitEvent({ ...valid, observedAt: "Tue, 03 Mar 2026 08:30:00 GMT" });
	assert.equal(rfc.ok, true);
	if (rfc.ok) assert.equal(rfc.event.observedAt, "2026-03-03T08:30:00.000Z");

	const junk = admitEvent({ ...valid, observedAt: "hier matin" });
	assert.equal(junk.ok, true);
	if (!junk.ok) return;
	assert.equal(junk.event.observedAt, undefined);
	assert.ok(junk.repairs.includes("date-illisible"));
});

test("date : format numérique français lu jour avant mois", () => {
	const result = admitEvent({ ...valid, observedAt: "09/11/2026" });
	assert.equal(result.ok, true);
	if (result.ok) assert.equal(result.event.observedAt, "2026-11-09T00:00:00.000Z");
});

test("URL de provenance illisible : écartée, événement conservé", () => {
	const result = admitEvent({ ...valid, sourceUrl: "pas une url" });
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.event.sourceUrl, undefined);
	assert.ok(result.repairs.includes("url-illisible"));

	const ok = admitEvent({ ...valid, sourceUrl: "https://exemple.test/avis" });
	assert.equal(ok.ok, true);
	if (ok.ok) assert.equal(ok.event.sourceUrl, "https://exemple.test/avis");
});

test("coordonnées : couple incomplet ou hors bornes écarté, pas de point fantôme", () => {
	const lonely = admitEvent({ ...valid, lat: 44.8 });
	assert.equal(lonely.ok, true);
	if (!lonely.ok) return;
	assert.equal(lonely.event.lat, undefined);
	assert.equal(lonely.event.lon, undefined);
	assert.ok(lonely.repairs.includes("coordonnees-incompletes"));

	const out = admitEvent({ ...valid, lat: 95, lon: 200 });
	assert.equal(out.ok, true);
	if (!out.ok) return;
	assert.equal(out.event.lat, undefined);
	assert.ok(out.repairs.includes("coordonnees-hors-bornes"));

	const good = admitEvent({ ...valid, lat: 44.804, lon: -0.633, geoType: "entity_location" });
	assert.equal(good.ok, true);
	if (!good.ok) return;
	assert.equal(good.event.lat, 44.804);
	assert.equal(good.event.geoType, "entity_location");
});

test("geoType inconnu et evidence non-objet : réparés", () => {
	const result = admitEvent({ ...valid, geoType: "approximate", evidence: "du texte" });
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.event.geoType, "unknown");
	assert.deepEqual(result.event.evidence, {});
	assert.ok(result.repairs.includes("geo-type-inconnu"));
	assert.ok(result.repairs.includes("evidence-non-objet"));

	const array = admitEvent({ ...valid, evidence: [1, 2] });
	assert.equal(array.ok, true);
	if (array.ok) assert.deepEqual(array.event.evidence, {});
});

test("les champs hors contrat sont ignorés, pas rejetés", () => {
	const result = admitEvent({ ...valid, org_id: 42, date_source: "feed", admission_rule: "org" });
	assert.equal(result.ok, true);
	if (result.ok) assert.equal("org_id" in result.event, false);
});

test("rejets cumulés : tous les motifs sont rendus", () => {
	const result = admitEvent({ dedupKey: "x", family: "darkweb", assertionType: "???", title: "", sourceId: "" });
	assert.equal(result.ok, false);
	if (result.ok) return;
	for (const reason of ["cle-dedup-trop-courte", "famille-inconnue", "assertion-inconnue", "titre-absent", "source-absente"]) {
		assert.ok(result.rejections.includes(reason as never), `motif attendu : ${reason}`);
	}
	assert.ok(result.hint.length > 0);
});

test("compteurs : rejets et réparations restent visibles", () => {
	const tally = new AdmissionTally();
	tally.record(admitEvent({ ...valid }));
	tally.record(admitEvent({ ...valid, severity: 9 }));
	tally.record(admitEvent({ ...valid, family: "darkweb" }));
	tally.record(admitEvent({ ...valid, family: "pastes" }));

	assert.equal(tally.admittedCount, 2);
	assert.equal(tally.rejectedCount, 2);
	const detail = tally.detail();
	assert.equal(detail.rejections[0].reason, "famille-inconnue");
	assert.equal(detail.rejections[0].count, 2);
	assert.equal(detail.repairs.find((r) => r.code === "severite-bornes")?.count, 1);
	assert.match(tally.logLine(), /famille-inconnue=2/);
	assert.match(tally.logLine(), /severite-bornes=1/);
});

test("compteurs vides : log muet", () => {
	const tally = new AdmissionTally();
	tally.record(admitEvent({ ...valid }));
	assert.equal(tally.logLine(), "");
	assert.equal(tally.rejectedCount, 0);
});
