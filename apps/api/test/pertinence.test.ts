/**
 * Filtre de pertinence cyber : tarte aux 30 textes et mesures reproductibles.
 *
 * Les dix derniers textes sont des pièges observés dans la base (presse
 * régionale, vocabulaire ambigu) : c'est là que l'ancien filtre se trompait.
 * Le corpus gelé de 100 items réels est mesuré par `scripts/mesure-pertinence.mts`.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
	evaluatePertinence,
	loadRelevanceConfig,
	scoreEventPertinence,
} from "../src/collectors/filter.js";
import { ingestQuery } from "../src/db.js";

const CORPUS: ReadonlyArray<{ text: string; attendu: boolean }> = [
	{ text: "Cyberattaque majeure en Nouvelle-Aquitaine", attendu: true },
	{ text: "Une vulnérabilité critique dans Apache Struts", attendu: true },
	{ text: "Ransomware : la mairie de Pau paralysée", attendu: true },
	{ text: "Fuite de données chez un assureur", attendu: true },
	{ text: "CVE-2026-115758 : SumatraPDF est un lecteur Windows", attendu: true },
	{ text: "Phishing campaign targets French banks", attendu: true },
	{ text: "Security researchers disclose a new malware family", attendu: true },
	{ text: "ANSSI : plusieurs failles dans Citrix XenServer", attendu: true },
	{ text: "Des identifiants volés en circulation", attendu: true },
	{ text: "L'attaque par ransomware vise une entreprise française", attendu: true },
	{ text: "Intrusion dans le réseau de la commune", attendu: true },
	{ text: "Zero-day exploit detected in the wild", attendu: true },
	{ text: "Une plateforme de streaming victime d'un DDoS", attendu: true },
	{ text: "La CNIL sanctionne une entreprise pour ses données personnelles", attendu: true },
	{ text: "Compromission d'un serveur chez un hébergeur", attendu: true },
	{ text: "Hackers exploited a vulnerability to steal data", attendu: true },
	{ text: "Revendication d'un groupe ransomware", attendu: true },
	{ text: "Des données volées après un piratage", attendu: true },
	{ text: "Le BHV ferme ses portes", attendu: false },
	{ text: "Rugby : contre l'Argentine, le XV de France rêve de grandeur", attendu: false },
	{ text: "Un virus mortel pour les lièvres inquiète les chasseurs du Lot-et-Garonne", attendu: false },
	{ text: "L'Iran menace de frapper des bases américaines si elles servent à lancer des attaques", attendu: false },
	{ text: "Sécurité en Europe : des pays signent une charte face aux menaces hybrides", attendu: false },
	{ text: "Grippe, Covid, bronchiolite : comment lutter contre les virus hivernaux", attendu: false },
	{ text: "Deux individus interpellés après avoir volé une voiture sous la menace d'un couteau", attendu: false },
	{ text: "Attaques de loup : préfet et agriculteurs toujours en quête de solutions", attendu: false },
	{ text: "L'IA menace de plus en plus d'emplois : les métiers exposés", attendu: false },
	{ text: "La résistance aux antibiotiques devient une menace croissante pour la santé", attendu: false },
	{ text: "Un marché de Noël au milieu des ânes près de Marmande", attendu: false },
	{ text: "Incendie dans le centre-ville : 70.000 forces de l'ordre mobilisées", attendu: false },
];

test("score de pertinence sur 30 textes", () => {
	const config = loadRelevanceConfig({});
	let ok = 0;
	const erreurs: string[] = [];
	const scores: number[] = [];
	for (const [i, sample] of CORPUS.entries()) {
		const verdict = evaluatePertinence({ title: sample.text }, { config });
		scores.push(verdict.score);
		if (verdict.relevant === sample.attendu) ok++;
		else {
			erreurs.push(`#${i + 1} « ${sample.text} » : attendu ${sample.attendu}, obtenu ${verdict.relevant} (score ${verdict.score}, ${verdict.matches.map((m) => m.term).join(",")})`);
		}
	}
	console.log(`Pertinence : ${ok}/${CORPUS.length} (${Math.round(ok / CORPUS.length * 100)} %), scores ${scores.join(",")}`);
	assert.equal(ok, CORPUS.length, erreurs.join("\n"));
});

test("termes faibles : jamais admis seuls, même accumulés", () => {
	const config = loadRelevanceConfig({});
	const verdict = evaluatePertinence(
		{ title: "L'Iran menace de frapper des bases américaines si elles servent à lancer des attaques" },
		{ config },
	);
	assert.equal(verdict.relevant, false);
	assert.equal(verdict.score, 0);
	assert.equal(verdict.reason, "none");
});

test("configuration : ajout de termes, exclusions et seuil", () => {
	const config = loadRelevanceConfig({
		RADAR_CYBER_KEYWORDS: "supply chain, scada",
		RADAR_CYBER_EXCLUSIONS: "virus hivernaux, attaques de loup",
		RADAR_CYBER_MIN_SCORE: "4",
	});
	assert.equal(config.warnings.length, 0);
	assert.ok(config.keywords.includes("supply chain"));
	assert.ok(config.keywords.includes("scada"));
	assert.equal(config.minScore, 4);
	const ajout = evaluatePertinence({ title: "Ransomware supply chain chez un éditeur" }, { config });
	assert.equal(ajout.relevant, true);
	assert.ok(ajout.matches.some((m) => m.term === "supply chain"));
	const exclusion = evaluatePertinence({ title: "Grippe : les virus hivernaux progressent" }, { config });
	assert.equal(exclusion.relevant, false);
	assert.equal(exclusion.reason, "excluded");
	assert.equal(exclusion.exclusion, "virus hivernaux");
});

test("configuration invalide : repli sûr et avertissements", () => {
	const long = "x".repeat(100);
	const config = loadRelevanceConfig({
		RADAR_CYBER_KEYWORDS: `scada,${long}`,
		RADAR_CYBER_MIN_SCORE: "11",
	});
	assert.equal(config.minScore, 2);
	assert.ok(config.keywords.includes("scada"));
	assert.ok(!config.keywords.includes(long));
	assert.equal([...new Set(config.keywords)].length, config.keywords.length);
	assert.ok(config.warnings.some((w) => w.includes("MIN_SCORE")));
	assert.ok(config.warnings.some((w) => w.includes("terme ignoré")));
});

test("organisation et règles de couverture montent le score", () => {
	const base = evaluatePertinence({ title: "Incident signalé dans la commune" }, { config: loadRelevanceConfig({}) });
	assert.equal(base.relevant, false);
	const org = evaluatePertinence(
		{ title: "Incident chez Acme Industries", url: "https://acme-industries.fr/actu" },
		{
			orgs: [{ name: "Acme Industries", domain: "acme-industries.fr" }],
			ignoreDomains: ["acme-industries.fr"],
		},
	);
	assert.equal(org.reason, "org");
	assert.equal(org.rule, "org");
	assert.ok(org.score >= base.score + 3);
	const couverte = evaluatePertinence(
		{ title: "Incident signalé dans la commune" },
		{ epss: { cve: "CVE-2026-1234", score: 0.8 }, department: true },
	);
	assert.equal(couverte.relevant, true);
	assert.equal(couverte.rule, "epss");
	assert.ok(couverte.score > base.score);
});

test("score d'événement admis : même moteur, sans porte", () => {
	const verdict = scoreEventPertinence({ title: "Ransomware chez un hébergeur" });
	assert.equal(verdict.score, 4);
	assert.equal(verdict.rule, null);
});

test("migration : langue et score stockés sur l'événement", async () => {
	const dedupKey = `test-pertinence-${randomUUID()}`;
	await ingestQuery(
		`INSERT INTO event (dedup_key, family, assertion_type, title, langue, pertinence_score, pertinence_rule, source_id)
		 VALUES ($1, 'cyber', 'ambient_signal', $2, 'en', 7, 'epss', 'ransomlook')`,
		[dedupKey, "Ransomware attack"],
	);
	const { rows } = await ingestQuery<{ langue: string; score: number; rule: string }>(
		`SELECT langue, pertinence_score AS score, pertinence_rule AS rule FROM event WHERE dedup_key = $1`,
		[dedupKey],
	);
	assert.deepEqual(rows[0], { langue: "en", score: 7, rule: "epss" });
});
