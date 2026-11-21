/**
 * Tests de régression des règles de précision (vague précision, S5.1).
 *
 * Deux niveaux :
 *   1. les prédicats, un cas unitaire par comportement attendu — y compris
 *      les cas limites analysés en S3.2 (sigles multi-jetons conservés,
 *      homonymes d'État par le chemin domaine, étrangères citées en
 *      français conservées puis hors_sujet au verdict) ;
 *   2. le jeu d'or : les 50 cas de bench/precision/gold-v1.json (verdicts
 *      posés avec preuve sur le corpus gelé) doivent garder leur verdict et
 *      leur comportement de règles — quoi qu'il arrive.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	ecarteeParRegles,
	elimineCommentaire,
	elimineHomonyme,
	elimineMasquage,
	elimineSigle,
	elimineVille,
} from "../src/match/regles-precision.js";

// ── Règle 3 — masquage ───────────────────────────────────────────────────

test("règle 3 : un indice masqué ne fonde jamais de rattachement", () => {
	assert.equal(ecarteeParRegles({ indice: "F*****H", via: "name", confidence: 0.9, orgName: "F.H" }), "3-masquage");
	assert.equal(ecarteeParRegles({ indice: "C***e?????", via: "name", confidence: 0.9, orgName: "ACME" }), "3-masquage");
	assert.equal(ecarteeParRegles({ indice: "ACME", via: "name", confidence: 0.9, orgName: "ACME" }), null);
});

// ── Règle 1 — sigle / jeton unique ───────────────────────────────────────

test("règle 1 : un seul jeton ne fonde pas un rattachement", () => {
	assert.equal(ecarteeParRegles({ indice: "harbingerconcrete.build", via: "name", confidence: 0.7, orgName: "BUILD" }), "1-sigle");
	assert.equal(ecarteeParRegles({ indice: "chevron.com", via: "name", confidence: 0.7, orgName: "SCI CHEVRON" }), "1-sigle");
	// Le chemin domaine n'est pas touché : le domaine est une clé, pas une
	// ressemblance.
	assert.equal(ecarteeParRegles({ indice: "chevron.com", via: "domain", confidence: 0.95, orgName: "CHEVRON" }), null);
});

// ── Règle 4 — commentaire de fuite ───────────────────────────────────────

test("règle 4 : les indices à marqueur de fuite ne matchent que par le domaine", () => {
	assert.equal(
		ecarteeParRegles({ indice: "STTLK - HACKED AND MORE THEN 200GB DATA LEAKED", via: "name", confidence: 0.75, orgName: "MORE AND MORE..." }),
		"4-commentaire",
	);
	assert.equal(
		ecarteeParRegles({ indice: "[File Tree Full Data Dump]VOP CZ", via: "name", confidence: 0.75, orgName: "FULL PACK" }),
		"4-commentaire",
	);
	// Les indices cactus (domaine + chiffres de la fuite) passent : leur
	// rattachement est fondé par le domaine.
	assert.equal(
		ecarteeParRegles({ indice: "demos.fr\\$37.5M\\France\\870GB\\100% DISCLOSED", via: "domain", confidence: 0.95, orgName: "DEMOS" }),
		null,
	);
});

// ── Règle 6 — ville+nom ──────────────────────────────────────────────────

test("règle 6 : le chemin ville+nom est retiré", () => {
	assert.equal(ecarteeParRegles({ indice: "Saint-Bar (saintbar.be)", via: "name", confidence: 0.6, orgName: "SAINT EUGENE" }), "6-ville");
	assert.equal(ecarteeParRegles({ indice: "ACME", via: "name", confidence: 0.75, orgName: "ACME" }), null);
});

// ── Règle 2 — homonyme : l'indice doit être couvert par le nom ───────────

test("règle 2 : à 0,75 l'indice ne peut pas être plus précis que le nom", () => {
	assert.equal(
		ecarteeParRegles({ indice: "Detroit Stoker", via: "name", confidence: 0.75, orgName: "DETROIT" }),
		"2-homonyme",
	);
	assert.equal(
		ecarteeParRegles({ indice: "Mission Locale Montpellier", via: "name", confidence: 0.75, orgName: "MISSION LOCALE" }),
		"2-homonyme",
	);
	// Cas limite S3.2 : l'indice couvert par le nom est conservé — la ville
	// citée fait partie du nom de l'organisation.
	assert.equal(
		ecarteeParRegles({ indice: "CHU DE BORDEAUX", via: "name", confidence: 0.75, orgName: "CHU BORDEAUX" }),
		null,
	);
	// Cas limite : les accents et formes juridiques ne comptent pas comme
	// des jetons manquants.
	assert.equal(
		ecarteeParRegles({ indice: "Groupe Delcourt", via: "name", confidence: 0.75, orgName: "SAS Groupe Delcourt" }),
		null,
	);
});

// ── Cas limites S3.2 — conservés par le jeu de règles ────────────────────

test("cas limites : ce qui doit rester juste après les règles", () => {
	// L'égalité de nom (0,9) sans site reste produite : c'est la voie de
	// revue humaine (les indécidables), pas une règle.
	assert.equal(ecarteeParRegles({ indice: "ALRO", via: "name", confidence: 0.9, orgName: "ALRO" }), null);
	// Un ministère étranger homonyme ne matche pas (jetons différents).
	assert.equal(
		ecarteeParRegles({ indice: "Ministerio de Justicia", via: "name", confidence: 0.75, orgName: "MINISTERE DE LA JUSTICE" }),
		"2-homonyme",
	);
	// Les noms à un seul mot au-delà du jeton unique (0,9) restent produits.
	assert.equal(ecarteeParRegles({ indice: "SAPROS", via: "name", confidence: 0.9, orgName: "SAPROS" }), null);
});

// ── Prédicats individuels ────────────────────────────────────────────────

test("prédicats individuels", () => {
	assert.equal(elimineMasquage("K*****S"), true);
	assert.equal(elimineMasquage("ACME"), false);
	assert.equal(elimineSigle({ via: "name", confidence: 0.7 }), true);
	assert.equal(elimineSigle({ via: "name", confidence: 0.75 }), false);
	assert.equal(elimineCommentaire("foo - HACKED", "name"), true);
	assert.equal(elimineCommentaire("foo - HACKED", "domain"), false);
	assert.equal(elimineVille(0.6), true);
	assert.equal(elimineVille(0.75), false);
	assert.equal(elimineHomonyme("Detroit Stoker", "DETROIT"), true);
	assert.equal(elimineHomonyme("DETROIT", "DETROIT"), false);
});

// Le jeu d'or (50 cas pièges, verdicts avec preuve sur le corpus gelé) est
// vérifié par scripts/precision-gold.mts --verifier, branché dans
// verify-all.sh (S5.2) : il rejoue les règles sur les champs complets du
// corpus (via, confiance) que la suite API ne porte pas.
