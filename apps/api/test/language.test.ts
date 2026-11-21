/**
 * Détection de langue des événements : 30 textes représentatifs des flux
 * (dépêches locales françaises, avis et bulletins techniques anglais).
 * Le taux de réussite est affiché pour que la mesure reste lisible en CI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	configuredLanguages,
	detectLanguage,
	languageVerdict,
	type Language,
} from "../src/collectors/filter.js";

const CORPUS: ReadonlyArray<{ text: string; expected: Language }> = [
	{ text: "Une cyberattaque touche la mairie de Bordeaux", expected: "fr" },
	{ text: "Vulnérabilité critique dans un logiciel de sécurité", expected: "fr" },
	{ text: "Le gouvernement publie un rapport sur les failles de réseau", expected: "fr" },
	{ text: "Des chercheurs ont découvert une faille dans Apache Struts", expected: "fr" },
	{ text: "L'attaque par ransomware vise une entreprise française", expected: "fr" },
	{ text: "La CNIL sanctionne une entreprise pour ses données personnelles", expected: "fr" },
	{ text: "Après l'incident, les systèmes de l'hôpital sont restaurés", expected: "fr" },
	{ text: "Cette vulnérabilité est exploitée par des pirates", expected: "fr" },
	{ text: "Les clients de l'entreprise ont été prévenus du risque", expected: "fr" },
	{ text: "Selon le ministère, aucune donnée n'a été volée", expected: "fr" },
	{ text: "Critical vulnerability in Apache Struts exploited in the wild", expected: "en" },
	{ text: "The ransomware attack targeted a city in France", expected: "en" },
	{ text: "Researchers disclose new flaw in widely used software", expected: "en" },
	{ text: "Security researchers say the breach compromised user data", expected: "en" },
	{ text: "A critical flaw was found in the company's network", expected: "en" },
	{ text: "Hackers exploited a vulnerability to steal sensitive data", expected: "en" },
	{ text: "The government has warned about increasing cyber threats", expected: "en" },
	{ text: "Officials said the incident affected several systems", expected: "en" },
	{ text: "Microsoft releases patch for vulnerability in Windows", expected: "en" },
	{ text: "New report details how attackers targeted the agency", expected: "en" },
	{ text: "La commune de Niort a été victime d'un rançongiciel", expected: "fr" },
	{ text: "Des données personnelles ont été exposées lors d'une fuite", expected: "fr" },
	{ text: "Le syslog a détecté une intrusion sur le réseau interne", expected: "fr" },
	{ text: "Les experts français ont publié une étude sur les menaces", expected: "fr" },
	{ text: "D'après l'ANSSI, la faille a été corrigée dans la journée", expected: "fr" },
	{ text: "Patch disponible pour la vulnérabilité critique de Windows", expected: "fr" },
	{ text: "A new vulnerability has been disclosed in the widely used library", expected: "en" },
	{ text: "The company confirmed that user credentials were stolen in the breach", expected: "en" },
	{ text: "Security researchers warn of an active exploit campaign targeting servers", expected: "en" },
	{ text: "Officials said the incident did not affect personal data", expected: "en" },
];

test("détection fr/en sur 30 textes", () => {
	let ok = 0;
	const erreurs: string[] = [];
	for (const [i, sample] of CORPUS.entries()) {
		const { language, scores } = detectLanguage(sample.text);
		if (language === sample.expected) ok++;
		else {
			erreurs.push(
				`#${i + 1} : attendu ${sample.expected}, obtenu ${language} (fr=${scores.fr}, en=${scores.en}) — ${sample.text}`,
			);
		}
	}
	const taux = Math.round((ok / CORPUS.length) * 100);
	console.log(`Taux de réussite détection de langue : ${ok}/${CORPUS.length} (${taux} %)`);
	assert.equal(ok, CORPUS.length, erreurs.join("\n"));
});

test("RADAR_LANGUAGES restreint l'ingestion", () => {
	const frSeul = configuredLanguages({ RADAR_LANGUAGES: "fr" });
	assert.deepEqual([...frSeul], ["fr"]);
	assert.equal(languageVerdict("Critical vulnerability in the software", null, frSeul).keep, false);
	assert.equal(languageVerdict("Une faille est exploitée dans le logiciel", null, frSeul).keep, true);
});

test("RADAR_LANGUAGES vide ou inconnu garde les deux langues", () => {
	assert.deepEqual([...configuredLanguages({})], ["fr", "en"]);
	assert.deepEqual([...configuredLanguages({ RADAR_LANGUAGES: "de" })], ["fr", "en"]);
	assert.deepEqual([...configuredLanguages({ RADAR_LANGUAGES: "EN, fr" })], ["en", "fr"]);
});

test("états vides et textes sans indice", () => {
	const vide = detectLanguage("");
	assert.equal(vide.confidence, 0);
	assert.deepEqual(vide.scores, { fr: 0, en: 0 });
	assert.equal(detectLanguage("12345 🚨 🔒").confidence, 0);
	// null / undefined arrivent des parseurs : aucun ne doit lever.
	assert.equal(detectLanguage(null as unknown as string).confidence, 0);
	assert.equal(detectLanguage(undefined as unknown as string).language, "en");
});

test("la confiance reflète la marge entre les deux scores", () => {
	const francais = detectLanguage("La faille a été exploitée par des pirates");
	const anglais = detectLanguage("The vulnerability was exploited by attackers");
	assert.ok(francais.scores.fr > francais.scores.en);
	assert.ok(anglais.scores.en > anglais.scores.fr);
	assert.ok(francais.confidence > 0 && francais.confidence <= 1);
	assert.ok(anglais.confidence > 0 && anglais.confidence <= 1);
});
