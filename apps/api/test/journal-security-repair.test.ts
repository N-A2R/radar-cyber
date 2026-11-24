/** Régressions locales des correctifs journal/export/scoring : aucune base requise. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { empreinteRacine, fournisseurRfc3161, verifierJeton } from "../src/journal/rfc3161.js";
import { celluleCsv } from "../src/export/violations-rgpd.js";
import { groupFacts, type EventForScore } from "../src/analyse/confidence-service.js";
import { prospectiveRiskScore, type OrgRiskParams } from "../src/risk/org-prospective.js";
import { fitRiskModel, riskFeatures, type RiskPopulation, type RiskSample, type RiskSignals } from "../src/analyse/organisation-risk.js";

const fixture = JSON.parse(
	readFileSync(new URL("./fixtures/jeton-rfc3161.json", import.meta.url), "utf8"),
) as { racine: string; token: string };
const empreinte = empreinteRacine(fixture.racine);

test("un vrai jeton TSA est vérifié, une signature altérée est rejetée", () => {
	const verifie = verifierJeton(fixture.token, empreinte);
	assert.equal(verifie.signatureVerifiee, true);
	assert.ok(verifie.certificat.length > 0);
	const octets = Buffer.from(fixture.token, "base64");
	const index = octets.indexOf(empreinte);
	assert.ok(index > 0, "empreinte trouvée dans le jeton");
	const altere = Buffer.from(octets);
	altere[index] ^= 0x01;
	assert.throws(
		() => verifierJeton(altere.toString("base64"), empreinte),
		/messageDigest CMS incorrect|signature CMS invalide|ne couvre pas cette racine/,
	);
	assert.throws(() => verifierJeton(Buffer.from("pas un jeton").toString("base64"), empreinte));
});

test("le nonce envoyé doit être retourné identique", () => {
	assert.throws(
		() => verifierJeton(fixture.token, empreinte, { nonceAttendu: 0x1234n }),
		/nonce retourné différent/,
	);
});

test("le fournisseur TSA envoie un nonce, borne genTime et réessaie 3 fois", async () => {
	const appels: number[] = [];
	const attentes: number[] = [];
	const fournisseur = fournisseurRfc3161({
		url: "https://tsa.test.invalid/tsr",
		tentatives: 3,
		delaiBaseMs: 100,
		alea: () => 0,
		attente: async (ms) => { attentes.push(ms); },
		fetchImpl: async (_url, init) => {
			appels.push(1);
			const corps = init?.body;
			assert.ok(corps instanceof Uint8Array || typeof corps === "string" || corps instanceof ArrayBuffer);
			// Un jeton sans nonce ne peut pas répondre à la requête : le rejet
			// est vérifié avant publication, puis le retry s'arrête à 3.
			const jeton = Buffer.from(fixture.token, "base64");
			const statut = Buffer.from([0x30, 0x03, 0x02, 0x01, 0x00]);
			const enveloppe = Buffer.concat([statut, Buffer.from([0x04]), jeton]);
			const corpsReponse = Buffer.concat([Buffer.from([0x30, 0x00]), enveloppe]);
			corpsReponse[1] = corpsReponse.length - 2;
			return new Response(corpsReponse, { status: 200 });
		},
	});
	await assert.rejects(fournisseur(fixture.racine), /échec après 3 tentatives/);
	assert.equal(appels.length, 3);
	assert.deepEqual(attentes, [100, 200]);
});

test("une clé de fait distingue deux titres de même préfixe de 120 caractères", () => {
	const prefix = "x".repeat(120);
	const commun = {
		summary: null, observedAt: "2026-11-24T10:00:00Z", at: "2026-11-24T10:00:00Z",
		collectedAt: "2026-11-24T10:00:00Z", confidence: null, sourceFamily: "cti",
		sourceName: "test", sourceUrl: null, orgId: null, regional: false,
	};
	const evenements: EventForScore[] = [
		{ ...commun, id: 1, family: "cert", assertionType: "confirmed_incident", title: `${prefix} alpha`, sourceId: "a" },
		{ ...commun, id: 2, family: "cert", assertionType: "confirmed_incident", title: `${prefix} beta`, sourceId: "b" },
	];
	const faits = groupFacts(evenements, new Date("2026-11-24T12:00:00Z"));
	assert.equal(faits.length, 2);
	assert.deepEqual(faits.map((fait) => fait.sources.length), [1, 1]);
});

test("les scores prospectifs restent dans [0,1] même avec des signaux extrêmes", () => {
	const params = JSON.parse(
		readFileSync(new URL("../../../bench/org-risk/params.json", import.meta.url), "utf8"),
	) as OrgRiskParams;
	const breakdown = prospectiveRiskScore({
		id: 1,
		confirmations: Array.from({ length: 500 }, (_, i) => ({ day: 0, severity: 5 + i })),
		claims: Array.from({ length: 500 }, () => ({ day: 0, corroborated: true })),
		ambient: 10_000,
		services: 1_000,
		epssMax: 4,
		kev: true,
		sector: 9,
		domain: true,
	}, params);
	assert.ok(breakdown.score >= 0 && breakdown.score <= 1, `score=${breakdown.score}`);
	assert.ok(Object.values(breakdown).filter((v) => typeof v === "number").every(
		(v) => typeof v !== "number" || v <= 1 || v === breakdown.volume,
	));
});

test("le fit ridge-logistique reste fini et sépare les labels", () => {
	const signaux: RiskSignals = {
		ambientEvents: 2, ambientSources: 2, maxSeverity: 3, lastObservedDaysAgo: 30,
		hasPublicDomain: 1, isServices: 1, isCommerce: 0, isConstruction: 0, isSante: 0, isIndustrie: 0,
	};
	const echantillons: RiskSample[] = [
		{ id: 1, signals: { ...signaux, ambientEvents: 4 }, label: 1 },
		{ id: 2, signals: { ...signaux, ambientEvents: 1 }, label: 0 },
		{ id: 3, signals: { ...signaux, maxSeverity: 5 }, label: 1 },
		{ id: 4, signals: { ...signaux, hasPublicDomain: 0 }, label: 0 },
	];
	const population: RiskPopulation = { totalOrganisations: 1000, incidentOrganisations: 4 };
	const modele = fitRiskModel(echantillons, population, { iterations: 40 });
	const scores = (label: number) => echantillons
		.filter((echantillon) => echantillon.label === label)
		.map((echantillon) => modele.weights.reduce(
			(total, poids, index) => total + poids * riskFeatures(echantillon.signals)[index]!, 0,
		));
	assert.ok(Math.min(...scores(1)) > Math.max(...scores(0)), "le fit sépare les labels");
	assert.ok(modele.weights.every((poids) => Number.isFinite(poids)));
});

test("les préfixes de formule CSV sont neutralisés", () => {
	assert.equal(celluleCsv("=1+1"), "'=1+1");
	assert.equal(celluleCsv("+cmd"), "'+cmd");
	assert.equal(celluleCsv("@ref"), "'@ref");
	assert.equal(celluleCsv("-2"), "'-2");
	assert.equal(celluleCsv("texte"), "texte");
	assert.equal(celluleCsv('=a,"b"'), `"'=a,""b"""`);
	assert.equal(celluleCsv(null), "");
});
