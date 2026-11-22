/**
 * Tests du cœur de rattachement, sans base de données.
 *
 * Ces cas sont des garde-fous produit : chacun correspond à une façon connue
 * de rattacher un événement à la mauvaise organisation. Ils ne nécessitent
 * pas PostgreSQL et tournent donc aussi vite hors ligne.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	MIN_ALIAS_LENGTH,
	SINGLE_TOKEN_CAP,
	analyzeAliasIndex,
	buildAliasIndex,
	deriveAliases,
	hasInstitutionalContext,
	normalize,
	selectUnambiguousAliases,
	tokenize,
	type AliasRow,
} from "../src/match/core.js";

function index(rows: AliasRow[]) {
	return buildAliasIndex(rows);
}

const ROWS: AliasRow[] = [
	{ org_id: 1, name: "CHU de Bordeaux", alias: "CHU de Bordeaux" },
	{ org_id: 1, name: "CHU de Bordeaux", alias: "Centre Hospitalier Universitaire de Bordeaux" },
	{ org_id: 2, name: "Université de Bordeaux", alias: "Université de Bordeaux" },
	{ org_id: 3, name: "Mairie de Poitiers", alias: "Mairie de Poitiers" },
	{ org_id: 4, name: "Lectra", alias: "Lectra" },
	{ org_id: 5, name: "Cdiscount", alias: "Cdiscount" },
	{ org_id: 6, name: "Région Nouvelle-Aquitaine", alias: "nouvelle-aquitaine.fr" },
];

// ── Normalisation ────────────────────────────────────────────────────────

test("normalize retire accents, ligatures et ponctuation", () => {
	assert.equal(normalize("  CHU de Bordeaux ! "), "chu de bordeaux");
	assert.equal(normalize("Cœur ÆrOpole"), "coeur aeropole");
	assert.equal(normalize("Nouvelle-Aquitaine.fr"), "nouvelle aquitaine fr");
	assert.equal(normalize("!!!"), "");
});

test("tokenize rend une liste vide pour un texte sans lettre ni chiffre", () => {
	assert.deepEqual(tokenize("— /* —"), []);
	assert.deepEqual(tokenize("CHU de Bordeaux"), ["chu", "de", "bordeaux"]);
});

// ── Contexte institutionnel ──────────────────────────────────────────────

test("hasInstitutionalContext reconnaît mots, locutions et formes juridiques", () => {
	assert.equal(hasInstitutionalContext("l'université a été touchée"), true);
	assert.equal(hasInstitutionalContext("le centre hospitalier confirme"), true);
	assert.equal(hasInstitutionalContext("la société Lectra SA dépose plainte"), true);
	assert.equal(hasInstitutionalContext("une attaque à Bordeaux"), false);
});

test("une forme juridique n'est un marqueur qu'en capitales", () => {
	assert.equal(hasInstitutionalContext("sa direction refuse de répondre"), false);
	assert.equal(hasInstitutionalContext("la SA visée refuse de répondre"), true);
});

// ── Construction de l'index ──────────────────────────────────────────────

test("buildAliasIndex écarte les domaines et les alias trop courts", () => {
	const idx = index(ROWS);
	assert.equal(idx.byKey.has("nouvelle aquitaine fr"), false, "un domaine ne doit pas devenir un alias texte");
	assert.equal(idx.byKey.has("chu"), false, "sigle de 3 caractères sous le minimum");
	assert.equal(idx.byKey.has("chu de bordeaux"), true);
	assert.ok(MIN_ALIAS_LENGTH >= 4);
});

test("un alias mono-jeton reste sous le seuil d'application automatique", () => {
	const idx = index([{ org_id: 9, name: "Cdiscount", alias: "Cdiscount" }]);
	const entry = idx.byKey.get("cdiscount")?.[0];
	assert.ok(entry);
	assert.equal(entry.tokens, 1);
	assert.equal(entry.short, true);
	assert.ok(entry.confidence <= SINGLE_TOKEN_CAP, "confiance plafonnée");
	assert.ok(entry.confidence < 0.7, "reste sous le seuil --min-confidence du script");
});

// ── Rattachement ─────────────────────────────────────────────────────────

test("un alias long rattache sans contexte institutionnel", () => {
	const { match, reason } = analyzeAliasIndex(index(ROWS), "Rançongiciel : le CHU de Bordeaux hors ligne");
	assert.equal(reason, "matched");
	assert.equal(match?.orgId, 1);
});

test("pas de sous-chaîne nue : un alias ne matche pas à l'intérieur d'un mot", () => {
	const idx = index([{ org_id: 7, name: "Société Orizon", alias: "Orizon" }]);
	const { match, reason } = analyzeAliasIndex(idx, "l'horizon économique se dégrade");
	assert.equal(match, null);
	assert.equal(reason, "no-alias");
});

test("un alias court sans contexte institutionnel est refusé et signalé", () => {
	const { match, reason } = analyzeAliasIndex(index(ROWS), "coupure de courant à Lectra mardi");
	assert.equal(match, null);
	assert.equal(reason, "short-only");
});

test("un alias court avec contexte institutionnel est accepté", () => {
	const { match, reason } = analyzeAliasIndex(index(ROWS), "la société Lectra victime d'une fuite");
	assert.equal(reason, "matched");
	assert.equal(match?.orgId, 4);
});

test("l'alias le plus long l'emporte sur un alias plus court d'une autre org", () => {
	const idx = index([
		{ org_id: 1, name: "CHU de Bordeaux", alias: "CHU de Bordeaux" },
		{ org_id: 2, name: "Université de Bordeaux", alias: "Université de Bordeaux" },
	]);
	const { match } = analyzeAliasIndex(idx, "l'Université de Bordeaux signale une intrusion");
	assert.equal(match?.orgId, 2);
});

test("deux organisations à force égale : aucune décision, candidats exposés", () => {
	const idx = index([
		{ org_id: 10, name: "Clinique Saint-Jean", alias: "Clinique Saint-Jean" },
		{ org_id: 11, name: "Clinique Saint-Jean (Lot)", alias: "Clinique Saint-Jean" },
	]);
	const { match, reason, tied } = analyzeAliasIndex(idx, "la Clinique Saint-Jean visée");
	assert.equal(match, null);
	assert.equal(reason, "ambiguous");
	assert.deepEqual(tied.map((t) => t.id).sort((a, b) => a - b), [10, 11]);
});

test("texte vide : motif explicite", () => {
	assert.equal(analyzeAliasIndex(index(ROWS), "   ").reason, "empty-text");
});

test("index vide : jamais de correspondance", () => {
	const { match, reason } = analyzeAliasIndex(index([]), "le CHU de Bordeaux est touché");
	assert.equal(match, null);
	assert.equal(reason, "no-alias");
});

// ── Désambiguïsation géographique (communes homonymes de NA) ─────────────

const MAZEROLLES: AliasRow[] = [
	{ org_id: 1, name: "Commune de Mazerolles", alias: "Mairie de Mazerolles", dept: "16" },
	{ org_id: 2, name: "Commune de Mazerolles", alias: "Mairie de Mazerolles", dept: "17" },
	{ org_id: 3, name: "Commune de Mazerolles", alias: "Mairie de Mazerolles", dept: "40" },
	{ org_id: 4, name: "Commune de Mazerolles", alias: "Mairie de Mazerolles", dept: "64" },
	{ org_id: 5, name: "Commune de Mazerolles", alias: "Mairie de Mazerolles", dept: "86" },
];

test("un département cité départage des communes homonymes", () => {
	const { match, reason } = analyzeAliasIndex(
		index(MAZEROLLES),
		"La mairie de Mazerolles (Pyrénées-Atlantiques) a été visée",
	);
	assert.equal(reason, "matched");
	assert.equal(match?.orgId, 4);
});

test("sans indice géographique, l'homonymie reste ambiguë", () => {
	const { match, reason, tied } = analyzeAliasIndex(
		index(MAZEROLLES),
		"La mairie de Mazerolles a été visée",
	);
	assert.equal(match, null);
	assert.equal(reason, "ambiguous");
	assert.equal(tied.length, 5);
});

test("un département cité qui ne désigne aucun candidat ne rattache rien", () => {
	const { match, reason } = analyzeAliasIndex(
		index(MAZEROLLES),
		"La mairie de Mazerolles (Creuse) a été visée",
	);
	assert.equal(match, null);
	assert.equal(reason, "ambiguous");
});

test("Charente-Maritime ne départage pas vers la Charente", () => {
	const idx = index([
		{ org_id: 1, name: "Commune de Berneuil", alias: "Mairie de Berneuil", dept: "16" },
		{ org_id: 2, name: "Commune de Berneuil", alias: "Mairie de Berneuil", dept: "17" },
	]);
	const { match } = analyzeAliasIndex(idx, "La mairie de Berneuil (Charente-Maritime) a été visée");
	assert.equal(match?.orgId, 2);
});

test("un nom de département cité ne vole pas la mairie nommée", () => {
	const idx = index([
		{ org_id: 1, name: "Commune de Boé", alias: "Mairie de Boé", dept: "47" },
		{ org_id: 2, name: "Département du Lot-et-Garonne", alias: "Lot-et-Garonne", dept: "47" },
	]);
	const { match } = analyzeAliasIndex(idx, "La mairie de Boé (Lot-et-Garonne) a été visée");
	assert.equal(match?.orgId, 1);
});

// ── Dérivation d'alias ───────────────────────────────────────────────────

test("deriveAliases produit nom nettoyé, nom sans forme juridique et sigle", () => {
	const aliases = deriveAliases("Centre Hospitalier Universitaire de Bordeaux");
	assert.ok(aliases.includes("Centre Hospitalier Universitaire de Bordeaux"));
	assert.ok(aliases.includes("CHUB"), `sigle attendu, obtenu: ${aliases.join(", ")}`);
});

test("deriveAliases retire la forme juridique et le segment entre parenthèses", () => {
	const aliases = deriveAliases("Lectra SA (siège social)");
	// La dérivation produit des *candidats* : le nom débarrassé des
	// parenthèses (« Lectra SA ») et sa variante sans forme juridique
	// (« Lectra »). C'est la sélection sans ambiguïté qui tranchera ensuite.
	assert.ok(aliases.includes("Lectra"), `variante sans forme juridique attendue: ${aliases.join(", ")}`);
	assert.ok(aliases.every((a) => !a.includes("(")));
});

test("deriveAliases ne fabrique pas de sigle à partir de deux mots", () => {
	assert.ok(!deriveAliases("Mairie Poitiers").includes("MP"));
	assert.deepEqual(deriveAliases("   "), []);
});

// ── Sélection sans ambiguïté ─────────────────────────────────────────────

test("selectUnambiguousAliases écarte un alias partagé des deux côtés", () => {
	const kept = selectUnambiguousAliases(
		[
			{ orgId: 1, alias: "CHU Bordeaux" },
			{ orgId: 2, alias: "CHU Bordeaux" },
			{ orgId: 3, alias: "Lectra" },
		],
		[],
	);
	assert.deepEqual(kept, [{ orgId: 3, alias: "Lectra" }]);
});

test("selectUnambiguousAliases refuse un candidat déjà possédé par une autre org", () => {
	const kept = selectUnambiguousAliases(
		[{ orgId: 2, alias: "Cdiscount" }],
		[{ orgId: 1, alias: "Cdiscount" }],
	);
	assert.deepEqual(kept, []);
});

test("selectUnambiguousAliases compare les alias normalisés", () => {
	const kept = selectUnambiguousAliases(
		[{ orgId: 2, alias: "Université de Bordeaux" }],
		[{ orgId: 1, alias: "universite de bordeaux" }],
	);
	assert.deepEqual(kept, [], "accents/casse ne doivent pas créer deux propriétaires");
});

test("selectUnambiguousAliases garde un alias déjà possédé par la même org", () => {
	const kept = selectUnambiguousAliases(
		[{ orgId: 1, alias: "Lectra" }],
		[{ orgId: 1, alias: "Lectra" }],
	);
	assert.deepEqual(kept, [{ orgId: 1, alias: "Lectra" }]);
});
