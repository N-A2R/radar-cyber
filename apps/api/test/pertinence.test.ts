/**
 * Filtre de pertinence : 30 textes réels ou représentatifs des flux, avec
 * verdict attendu. Les dix derniers sont des pièges observés dans la base
 * (presse régionale, vocabulaire ambigu) : c'est là que le filtre se trompait.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	evaluatePertinence,
	loadRelevanceConfig,
	scoreEventPertinence,
	type RelevanceConfig,
} from "../src/collectors/pertinence.js";

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
	const echantillon: number[] = [];
	for (const [i, sample] of CORPUS.entries()) {
		const verdict = evaluatePertinence({ title: sample.text }, { config });
		echantillon.push(verdict.score);
		if (verdict.relevant === sample.attendu) ok++;
		else erreurs.push(`#${i + 1} « ${sample.text} » : attendu ${sample.attendu}, obtenu ${verdict.relevant} (score ${verdict.score}, ${verdict.matches.map((m) => m.term).join(",")})`);
	}
	console.log(`Pertinence : ${ok}/${CORPUS.length} (${Math.round(ok / CORPUS.length * 100)} %), scores ${echantillon.join(",")}`);
	assert.equal(ok, CORPUS.length, erreurs.join("\n"));
});

test("le score est borné et expliqué", () => {
	const v = evaluatePertinence({ title: "Cyberattaque", summary: "ransomware, breach, vulnérabilité, exploit, phishing, DDoS, malware et fuite de données" });
	assert.ok(v.score >= 0 && v.score <= 10);
	assert.ok(v.matches.length >= 2);
	assert.equal(v.relevant, true);
	assert.equal(v.threshold, 2);
});

test("nouveaux mots-clés et exclusions configurables", () => {
	const config: RelevanceConfig = {
		keywords: ["supply chain", "ransomware"],
		exclusions: ["virus hivernaux", "coupes du monde"],
		minScore: 2,
		warnings: [],
	};
	const ajoute = evaluatePertinence({ title: "Supply chain attaquée chez un fournisseur" }, { config });
	assert.equal(ajoute.relevant, true);
	assert.ok(ajoute.matches.some((m) => m.term === "supply chain"));

	const exclus = evaluatePertinence({ title: "Grippe et virus hivernaux", summary: "bilan sanitaire" }, { config });
	assert.equal(exclus.relevant, false);
	assert.equal(exclus.reason, "excluded");
	assert.equal(exclus.score, 0);
	assert.equal(exclus.exclusion, "virus hivernaux");

	// Une exclusion ne masque jamais un signal fort.
	const fort = evaluatePertinence({ title: "Virus hivernaux et ransomware chez un hôpital" }, { config });
	assert.equal(fort.relevant, true);
	assert.equal(fort.score >= 4, true);
});

test("seuil configurable et valeurs invalides", () => {
	const strict = loadRelevanceConfig({ RADAR_CYBER_MIN_SCORE: "7" });
	assert.equal(strict.minScore, 7);
	assert.equal(evaluatePertinence({ title: "Vulnérabilité dans un logiciel" }, { config: strict }).relevant, false);
	assert.equal(evaluatePertinence({ title: "CVE-2026-1234 dans un logiciel" }, { config: strict }).relevant, false);
	assert.equal(evaluatePertinence({ title: "CVE-2026-1234 dans un logiciel" }, { config: loadRelevanceConfig({}) }).relevant, true);

	const invalide = loadRelevanceConfig({ RADAR_CYBER_MIN_SCORE: "beaucoup" });
	assert.equal(invalide.minScore, 2);
	assert.equal(invalide.warnings.length, 1);
	assert.match(invalide.warnings[0], /MIN_SCORE/);
});

test("états vides, champs nuls et configuration excessive", () => {
	const vide = evaluatePertinence({});
	assert.equal(vide.score, 0);
	assert.equal(vide.relevant, false);
	assert.equal(vide.reason, "none");
	assert.deepEqual(vide.matches, []);
	assert.equal(evaluatePertinence(null as unknown as Record<string, never>).relevant, false);
	assert.equal(scoreEventPertinence({ title: null, summary: undefined }).score, 0);

	const long = "x".repeat(120);
	const config = loadRelevanceConfig({
		RADAR_CYBER_KEYWORDS: ` , , ${long}, supply chain,supply chain`,
		RADAR_CYBER_EXCLUSIONS: "",
	});
	assert.ok(config.warnings.length >= 1);
	assert.ok(!config.keywords.includes(long));
	assert.equal([...new Set(config.keywords)].length, config.keywords.length);
});

test("organisation, EPSS et département montent le score sans lever", () => {
	const base = evaluatePertinence({ title: "Incident signalé dans la commune" });
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

test("les caches bornés ne changent pas les verdicts au-delà de 512 entrées", () => {
	// Organisations : un nouvel index par item, donc éviction FIFO de l'index
	// précédent. Le rattachement doit rester juste après 512 index.
	for (let i = 0; i < 520; i++) {
		const nom = `Etablissement ${i} Aquitaine`;
		const verdict = evaluatePertinence(
			{ title: `Incident chez ${nom}` },
			{ orgs: [{ name: nom }] },
		);
		assert.equal(verdict.reason, "org", `index ${i}`);
	}
	// Termes : 600 clés distinctes forcent l'éviction du cache de regex.
	const keywords = Array.from({ length: 600 }, (_, i) => `motcle${i}specialite`);
	const config: RelevanceConfig = { keywords, exclusions: [], minScore: 2, warnings: [] };
	const dernier = evaluatePertinence({ title: `Annonce : ${keywords[599]}` }, { config });
	assert.ok(dernier.matches.some((m) => m.term === keywords[599]));
});
