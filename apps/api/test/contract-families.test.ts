/**
 * Alignement du contrat sur le catalogue — et ses effets de bord.
 *
 * `FAMILIES` est passé de 10 à 13 valeurs (leaks, paste, presse_cyber) sur
 * arbitrage utilisateur. Ces trois valeurs circulaient déjà en base sans que
 * le contrat les connaisse. L'élargissement a un effet non voulu qu'il faut
 * surveiller : dans generic.ts, `isFamily(source.family)` devient vrai pour
 * ces 8 sources, donc elles passent désormais par la porte cyber qu'elles
 * contournaient. Une fuite indexée au titre non technique pourrait être
 * rétrogradée en `presse` puis rejetée.
 *
 * Ce fichier fige le comportement attendu, source par source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILIES } from "@radar/shared";
import { classifyFamily, isFamily, type Family } from "../src/collectors/classify.js";

test("le contrat connaît les familles du catalogue et de migrate-019", () => {
	for (const family of ["leaks", "paste", "presse_cyber", "presse_locale"]) {
		assert.ok(FAMILIES.includes(family as Family), `${family} doit être au contrat`);
		assert.equal(isFamily(family), true);
	}
	assert.equal(FAMILIES.length, 14);
	assert.equal(isFamily("nimportequoi"), false);
});

test("les 8 sources leaks/paste gardent leur famille sur un titre de fuite", () => {
	// Titres réels ou représentatifs des flux déclarés dans
	// db/sources-paste-leaks.sql (sondés HTTP 200 le 2026-11-10).
	const cases: Array<{ name: string; family: Family; title: string }> = [
		{ name: "Have I Been Pwned — dernières violations (RSS)", family: "leaks", title: "Breach added: 2,3M compromised accounts" },
		{ name: "DataBreaches.net — flux des fuites de données", family: "leaks", title: "Healthcare provider reports data breach affecting 40,000 patients" },
		{ name: "RansomLook Leaks", family: "leaks", title: "New victim posted by lockbit3" },
		{ name: "GitHub Gists public feed", family: "paste", title: "Leaked credentials and API tokens found in public gist" },
	];
	for (const item of cases) {
		const got = classifyFamily({ title: item.title, summary: null, sourceFamily: item.family, sourceName: item.name });
		assert.equal(got, item.family, `« ${item.title} » (${item.name}) ne doit pas être rétrogradé`);
	}
});

test("une famille inconnue reste refusée par isFamily", () => {
	// Le contrat élargi n'est pas une porte ouverte : seules les 14 valeurs
	// passent. C'est ce qui manquait à generic.ts.
	for (const bad of ["leak", "pastes", "darkweb", "", "LEAKS"]) {
		assert.equal(isFamily(bad), false, `${bad} ne doit pas passer`);
	}
});

test("ransomware et cert_fr traversent la porte sans être reclassés", () => {
	for (const family of ["ransomware", "cert_fr"] as Family[]) {
		const got = classifyFamily({
			title: "Événement sans terme technique",
			summary: null,
			sourceFamily: family,
			sourceName: "Source quelconque",
		});
		assert.equal(got, family);
	}
});
