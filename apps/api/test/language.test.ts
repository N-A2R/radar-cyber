/**
 * Détection de langue des événements : 20 textes représentatifs des flux
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
	{ text: "La mairie de Limoges a signalé une intrusion dans son réseau informatique", expected: "fr" },
	{ text: "Les données des clients ont été exposées après une cyberattaque", expected: "fr" },
	{ text: "Cette faille de sécurité affecte plusieurs serveurs de l'entreprise", expected: "fr" },
	{ text: "Le ministère annonce une vague de cyberattaques contre des hôpitaux", expected: "fr" },
	{ text: "Nous avons détecté une anomalie sur le réseau de la commune", expected: "fr" },
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
	{ text: "A critical vulnerability in the company's network was disclosed", expected: "en" },
	{ text: "The attackers exploited a flaw to steal sensitive data", expected: "en" },
	{ text: "Security researchers say the ransomware gang leaked customer records", expected: "en" },
	{ text: "Microsoft has released a patch for the critical flaw", expected: "en" },
	{ text: "Officials said the incident affected several government systems", expected: "en" },
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
