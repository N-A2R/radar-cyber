import assert from "node:assert/strict";
import { test } from "node:test";
import {
	classifyIncident,
	classifyMode,
	classifySector,
	normaliseText,
	scorePairs,
	type ScoredPair,
} from "../src/classification/sector-mode.js";

test("public bodies are classified as public", () => {
	for (const organisation of ["Ville de Floirac", "Mairie de Niort", "Commissariat de police de Royan", "SDIS des Landes"]) {
		assert.equal(classifySector({ organisation }).label, "public", organisation);
	}
});

test("schools and universities are classified as education", () => {
	for (const organisation of ["Collège privé de Brive", "Groupe scolaire Stella-Maris", "Université de Limoges", "École de commerce Eklore"]) {
		assert.equal(classifySector({ organisation }).label, "education", organisation);
	}
});

test("health establishments are classified as health", () => {
	for (const organisation of ["Centre hospitalier d'Angoulême", "EHPAD Résidence du Parc", "ARS Nouvelle-Aquitaine", "Service de prévention et de santé au travail"]) {
		assert.equal(classifySector({ organisation }).label, "health", organisation);
	}
});

test("farms and food production are classified as agro-food", () => {
	for (const text of ["Éleveurs de Dordogne", "Service d'identification des bovins", "Hennessy à Cognac"]) {
		assert.equal(classifySector({ title: text }).label, "agro-food", text);
	}
});

test("retail chains are classified as commerce", () => {
	for (const organisation of ["Intermarché d'Altillac", "Super U de Morcenx", "E.Leclerc de Surgères"]) {
		assert.equal(classifySector({ organisation }).label, "commerce", organisation);
	}
});

test("building trades are classified as construction", () => {
	for (const text of ["Entreprise de maçonnerie", "Fabricant de volets sur mesure"]) {
		assert.equal(classifySector({ title: text }).label, "construction", text);
	}
});

test("culture, transport and software are classified as services", () => {
	for (const organisation of ["Théâtre de la Coursive", "Réseau de transports du Grand Périgueux", "Vivaticket France"]) {
		assert.equal(classifySector({ organisation }).label, "services", organisation);
	}
});

test("manufacturing without a trade signal is classified as industry", () => {
	assert.equal(classifySector({ title: "Une usine de production frappée" }).label, "industry");
});

test("unmatched text falls back to other without guessing", () => {
	const result = classifySector({ organisation: "Euskal Moneta", title: "Association locale" });
	assert.deepEqual(result, { label: "other", rule: "default" });
});

test("accent and case variants reach the same rule", () => {
	assert.equal(normaliseText("ÉCOLE"), "ecole");
	assert.equal(classifySector({ organisation: "École" }).label, classifySector({ organisation: "ecole" }).label);
});

test("classification output contains only a label and a rule id", () => {
	const prediction = classifyIncident({
		organisation: "Ville de Niort",
		title: "Des SMS frauduleux usurpent le nom de la Ville de Niort",
	});
	assert.deepEqual(prediction.sector, { label: "public", rule: "public-terms" });
	assert.deepEqual(prediction.mode, { label: "phishing", rule: "credential-phishing" });
	assert.ok(!JSON.stringify(prediction).includes("Niort"));
});

test("ransom demands win over generic cyberattack wording", () => {
	const result = classifyMode({ title: "Cyberattaque contre une mairie avec demande de rançon" });
	assert.deepEqual(result, { label: "ransomware", rule: "ransom-demand" });
});

test("data exposures are detected from leak and darkweb signals", () => {
	for (const text of ["Fuite de données chez un prestataire", "151 000 profils en vente sur le darkweb", "Des données dérobées lors d'une attaque"]) {
		assert.equal(classifyMode({ title: text }).label, "data-leak", text);
	}
});

test("phishing lures are detected from SMS and fake-mail signals", () => {
	for (const text of ["Des SMS frauduleux usurpent le nom de la ville", "Gare aux faux mails de la mairie", "QR codes d'horodateurs piratés"]) {
		assert.equal(classifyMode({ title: text }).label, "phishing", text);
	}
});

test("payment fraud is distinct from phishing", () => {
	assert.equal(classifyMode({ title: "Une arnaque bancaire de 5 000 euros" }).label, "fraud");
	assert.equal(classifyMode({ title: "Vigilance : on vous demande votre RIB par téléphone, c'est une arnaque" }).label, "fraud");
	assert.equal(classifyMode({ title: "Fraude au faux RIB par courriel contre la commune" }).label, "fraud");
});

test("website replacement is classified as defacement", () => {
	assert.equal(classifyMode({ title: "Le site du camping vante les services d'une escort-girl" }).label, "defacement");
});

test("availability attacks are classified as service disruption", () => {
	for (const text of ["Attaque par déni de service contre le site de la ville", "Le site de la ville est rendu inaccessible", "Une attaque DDoS"]) {
		assert.equal(classifyMode({ title: text }).label, "service-disruption", text);
	}
});

test("generic intrusion is classified as compromise", () => {
	assert.equal(classifyMode({ title: "Piratage de la messagerie municipale", summary: "Un hacker a pris le contrôle du serveur" }).label, "compromise");
});

test("unrelated text is unknown rather than forced into a mode", () => {
	assert.deepEqual(classifyMode({ title: "Le festival annonce sa programmation" }), { label: "unknown", rule: "default" });
});

test("summary text contributes to the mode when the headline is vague", () => {
	assert.equal(classifyMode({ title: "Incident de sécurité", summary: "Des données personnelles ont été extraites" }).label, "data-leak");
});

function pair(sectorGold: string, sectorPred: string, modeGold: string, modePred: string): ScoredPair {
	return {
		gold: { id: "x", sector: sectorGold as ScoredPair["gold"]["sector"], mode: modeGold as ScoredPair["gold"]["mode"] },
		prediction: {
			sector: { label: sectorPred as ScoredPair["prediction"]["sector"]["label"], rule: "test" },
			mode: { label: modePred as ScoredPair["prediction"]["mode"]["label"], rule: "test" },
		},
	};
}

test("perfect predictions give F1 1 on both axes", () => {
	const score = scorePairs([
		pair("public", "public", "ransomware", "ransomware"),
		pair("health", "health", "data-leak", "data-leak"),
	]);
	assert.equal(score.macroF1, 1);
	assert.equal(score.weightedF1, 1);
	assert.equal(score.exactMatch, 1);
});

test("a wrong sector is a false negative and a false positive", () => {
	const score = scorePairs([pair("public", "services", "compromise", "compromise")]);
	assert.equal(score.sector.perClass.public.recall, 0);
	assert.equal(score.sector.perClass.services.precision, 0);
	assert.equal(score.sector.f1, 0);
	assert.equal(score.mode.f1, 1);
	assert.equal(score.macroF1, 0.5);
	assert.equal(score.exactMatch, 0);
});

test("a single miss keeps precision and lowers recall", () => {
	const score = scorePairs([
		pair("public", "public", "compromise", "compromise"),
		pair("public", "services", "compromise", "compromise"),
	]);
	assert.equal(score.sector.perClass.public.precision, 1);
	assert.equal(score.sector.perClass.public.recall, 0.5);
	assert.ok(Math.abs(score.macroF1 - 0.8333) < 0.001);
	assert.equal(score.exactMatch, 0.5);
});

test("macro averaging ignores classes with no gold example", () => {
	const score = scorePairs([
		pair("public", "public", "ransomware", "ransomware"),
		pair("public", "public", "ransomware", "ransomware"),
	]);
	assert.equal(Object.keys(score.sector.perClass).length, 1);
	assert.equal(score.sector.f1, 1);
});

test("darknet publication is treated as a data exposure", () => {
	assert.equal(classifyMode({ title: "Attaque", summary: "Des documents et données de salariés sont publiés sur un site darknet" }).label, "data-leak");
});

test("a negated leak does not produce a data-exposure label", () => {
	const prediction = classifyMode({
		title: "Le site de la ville est attaqué, aucune fuite de données",
		summary: "Le site est rendu inaccessible par un déni de service, sans fuite de données",
	});
	assert.equal(prediction.label, "service-disruption");
});

test("health wins over a school mention in the same text", () => {
	assert.equal(classifySector({ organisation: "ARS Nouvelle-Aquitaine", summary: "vaccination au collège" }).label, "health");
});
