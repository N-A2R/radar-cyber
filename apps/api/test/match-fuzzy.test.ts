/**
 * Tests du filet flou, sans base de données.
 *
 * Le filet ne doit jamais défaire ce qui fait la précision du cœur : ces cas
 * verrouillent les trois garde-fous (seuil, alias court sans contexte,
 * égalité) et le plafond de confiance qui envoie ces rattachements en revue.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeAliasIndex, buildAliasIndex, type AliasRow } from "../src/match/core.js";
import { FUZZY_CONFIDENCE_CAP, FUZZY_THRESHOLD, fuzzyMatchAlias } from "../src/match/fuzzy.js";

const ROWS: AliasRow[] = [
	{ org_id: 1, name: "CHU de Bordeaux", alias: "CHU de Bordeaux" },
	{ org_id: 2, name: "Université de Poitiers", alias: "Université de Poitiers" },
	{ org_id: 3, name: "Bordeaux Métropole", alias: "Bordeaux Métropole" },
	{ org_id: 4, name: "Lectra", alias: "Lectra" },
	{ org_id: 5, name: "Clinique Saint-Jean", alias: "Clinique Saint-Jean" },
	{ org_id: 6, name: "Clinique Saint-Jean (Lot)", alias: "Clinique Saint-Jean" },
];

const index = buildAliasIndex(ROWS);

test("le filet rattrape une faute de frappe que le cœur manque", () => {
	const text = "Le CHU de Bordeau confirme une attaque par rançongiciel.";
	assert.equal(analyzeAliasIndex(index, text).reason, "no-alias", "le cœur doit bien échouer ici");
	const { match } = fuzzyMatchAlias(index, text);
	assert.equal(match?.orgId, 1);
});

test("le filet rattrape un accent ou un pluriel égaré", () => {
	assert.equal(fuzzyMatchAlias(index, "Bordeaux Metropôle renforce ses accès.").match?.orgId, 3);
	assert.equal(fuzzyMatchAlias(index, "L'université de Poitier signale des comptes compromis.").match?.orgId, 2);
});

test("la confiance reste sous le seuil d'application automatique", () => {
	const { match } = fuzzyMatchAlias(index, "Le CHU de Bordeau confirme une attaque.");
	assert.ok(match);
	assert.ok(match.confidence <= FUZZY_CONFIDENCE_CAP);
	assert.ok(match.confidence < 0.7, "doit rester sous --min-confidence=0.7 : revue obligatoire");
});

test("un alias mono-jeton approchant exige un contexte institutionnel", () => {
	// « Lectraa » sans marqueur d'organisation : même refus que le cœur.
	assert.equal(fuzzyMatchAlias(index, "Coupure de courant à Lectraa mardi soir.").match, null);
	// Avec le marqueur, le rattachement est permis — et plafonné plus bas.
	const { match } = fuzzyMatchAlias(index, "La société Lectraa indique avoir contenu l'incident.");
	assert.equal(match?.orgId, 4);
	assert.ok(match!.confidence <= 0.4, "alias mono-jeton : plafond le plus bas");
});

test("deux organisations à égalité : le filet ne choisit pas", () => {
	const text = "La clinique Saint-Jeanl visée par une exfiltration.";
	const { match, tied } = fuzzyMatchAlias(index, text);
	assert.equal(match, null);
	assert.deepEqual([...tied].sort((a, b) => a - b), [5, 6]);
});

test("sous le seuil, aucune correspondance n'est proposée", () => {
	const { match, bestScore } = fuzzyMatchAlias(index, "Une vulnérabilité critique touche un serveur de messagerie.");
	assert.equal(match, null);
	assert.ok(bestScore < FUZZY_THRESHOLD, `meilleur score ${bestScore} sous le seuil`);
});

test("le seuil est réglable et durci sans effet de bord", () => {
	const text = "Le CHU de Bordeau confirme une attaque.";
	assert.ok(fuzzyMatchAlias(index, text, { threshold: 90 }).match);
	assert.equal(fuzzyMatchAlias(index, text, { threshold: 99 }).match, null);
});

test("texte vide et index vide : jamais de correspondance", () => {
	assert.equal(fuzzyMatchAlias(index, "   ").match, null);
	assert.equal(fuzzyMatchAlias(buildAliasIndex([]), "Le CHU de Bordeau est touché.").match, null);
});

test("un alias exact reste du ressort du cœur, pas du filet", () => {
	// Le filet ne doit pas être appelé dans ce cas ; s'il l'est, il ne doit
	// pas produire une confiance supérieure à celle du cœur.
	const text = "Le CHU de Bordeaux confirme une interruption.";
	const core = analyzeAliasIndex(index, text);
	assert.equal(core.reason, "matched");
	assert.equal(core.match?.confidence, 1);
	const fuzzy = fuzzyMatchAlias(index, text);
	assert.ok(fuzzy.match === null || fuzzy.match.confidence < core.match!.confidence);
});
