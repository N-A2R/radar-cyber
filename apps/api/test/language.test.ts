import { test } from "node:test";
import assert from "node:assert/strict";
import {
	detectLanguage,
	languageFilterFromEnv,
	parseLanguageFilter,
	type EventLanguage,
} from "../src/collectors/filter.js";

/** 20 dépêches courtes, moitié françaises, moitié anglaises. */
const SAMPLES: readonly { text: string; expected: "fr" | "en" }[] = [
	{ text: "Une cyberattaque a touché le réseau informatique de la commune de Bordeaux cette semaine.", expected: "fr" },
	{ text: "Les données des employés ont été exposées à la suite d'une faille de sécurité.", expected: "fr" },
	{ text: "La gendarmerie enquête sur un piratage de données dans une entreprise.", expected: "fr" },
	{ text: "Cette vulnérabilité permet aux attaquants d'exécuter du code sur les serveurs.", expected: "fr" },
	{ text: "Le rancongiciel a chiffré les fichiers de la collectivité locale.", expected: "fr" },
	{ text: "Selon l'ANSSI, plusieurs failles ont été corrigées dans le logiciel.", expected: "fr" },
	{ text: "L'incident a perturbé le système de réseau de l'hôpital.", expected: "fr" },
	{ text: "Les utilisateurs doivent changer leur mot de passe après la fuite de données.", expected: "fr" },
	{ text: "En Nouvelle-Aquitaine, une attaque informatique vise les services de la commune.", expected: "fr" },
	{ text: "Le signalement d'une escroquerie en ligne a donné lieu à une enquête.", expected: "fr" },
	{ text: "A new cyberattack has disrupted the network of several hospitals in France.", expected: "en" },
	{ text: "The vulnerability allows attackers to execute code on affected servers.", expected: "en" },
	{ text: "Researchers disclosed a data breach affecting millions of user accounts.", expected: "en" },
	{ text: "The ransomware encrypted files on the company's systems last night.", expected: "en" },
	{ text: "Security experts warn that phishing campaigns are targeting government employees.", expected: "en" },
	{ text: "This flaw was patched after the security advisory was published by the vendor.", expected: "en" },
	{ text: "Hackers compromised a server and leaked credentials from the database.", expected: "en" },
	{ text: "The report says the malware spread through the network without detection.", expected: "en" },
	{ text: "Users should update their devices after the critical software patch was released.", expected: "en" },
	{ text: "A threat actor exploited an unpatched system to steal sensitive data.", expected: "en" },
];

test("détection fr/en : 20 textes, taux de réussite affiché", () => {
	const echecs = SAMPLES.flatMap(({ text, expected }) => {
		const obtenu = detectLanguage(text);
		return obtenu === expected ? [] : [{ expected, obtenu, text }];
	});
	const reussis = SAMPLES.length - echecs.length;
	console.log(
		`[langue] ${reussis}/${SAMPLES.length} textes bien classés ` +
		`(${(reussis / SAMPLES.length * 100).toFixed(0)} %)`,
	);
	for (const echec of echecs) {
		console.log(`[langue] échec : attendu ${echec.expected}, obtenu ${echec.obtenu} — ${echec.text}`);
	}
	assert.deepEqual(echecs, []);
});

test("texte sans indice : und", () => {
	assert.equal(detectLanguage("CVE-2024-1234"), "und");
	assert.equal(detectLanguage(""), "und");
});

test("filtre de langue configurable", () => {
	assert.equal(parseLanguageFilter(undefined), null);
	assert.equal(parseLanguageFilter(""), null);
	assert.equal(parseLanguageFilter(" * "), null);
	assert.equal(parseLanguageFilter("all"), null);
	assert.deepEqual([...parseLanguageFilter("fr, en")!], ["fr", "en"]);
	assert.deepEqual([...parseLanguageFilter("FR")!], ["fr"]);
	assert.deepEqual([...parseLanguageFilter("und")!], ["und"]);
	assert.throws(() => parseLanguageFilter("de"), /langue inconnue/);
	assert.deepEqual(
		[...languageFilterFromEnv({ RADAR_EVENT_LANGUAGES: " en " }).values()],
		["en"] satisfies EventLanguage[],
	);
	assert.equal(languageFilterFromEnv({}), null);
});
