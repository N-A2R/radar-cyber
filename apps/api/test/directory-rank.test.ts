/**
 * Classement de la recherche d'annuaire — contrôles sans base.
 *
 * Ce qu'on verrouille : l'exact ne se fait jamais doubler par le flou, un alias
 * institutionnel retrouve l'organisation, une faute de frappe reste rattrapée,
 * et deux homonymes se départagent par l'activité plutôt que par le hasard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankOrgs, searchTokens, type RankCandidate } from "../src/directory/rank.js";

function org(overrides: Partial<RankCandidate> & { id: number; name: string }): RankCandidate {
	return {
		kind: "collectivite",
		sector: "commune",
		city: null,
		dept: "33",
		domain: null,
		eventCount: 0,
		aliases: [],
		...overrides,
	};
}

const pessac = org({
	id: 1,
	name: "Commune de Pessac",
	city: "Pessac",
	aliases: ["Pessac", "Mairie de Pessac", "Ville de Pessac", "Commune de Pessac"],
});
const pessacLeognan = org({ id: 2, name: "Commune de Pessac-léognan", city: "Pessac-léognan" });
const mazerolles33 = org({ id: 3, name: "Commune de Mazerolles", city: "Mazerolles", dept: "33", eventCount: 4 });
const mazerolles16 = org({ id: 4, name: "Commune de Mazerolles", city: "Mazerolles", dept: "16", eventCount: 0 });
const pool = [pessacLeognan, mazerolles16, pessac, mazerolles33];

test("requête vide : l'ordre du serveur est conservé", () => {
	const ranked = rankOrgs(pool, "");
	assert.deepEqual(ranked.map((o) => o.id), pool.map((o) => o.id));
});

test("égalité exacte en tête, avant la sous-chaîne", () => {
	const ranked = rankOrgs(pool, "Pessac");
	assert.equal(ranked[0].id, 1);
	// La ville porte le nom exact : c'est une égalité pleine, pas un alias.
	assert.equal(ranked[0].reason, "exact");
	const withoutCity = rankOrgs([{ ...pessac, city: null }], "Pessac");
	assert.equal(withoutCity[0].reason, "exact-alias");
	assert.equal(withoutCity[0].matchedAlias, "Pessac");
	assert.ok(ranked.some((o) => o.id === 2), "la commune plus longue reste proposée, plus bas");
	assert.ok(ranked[0].score > (ranked.find((o) => o.id === 2)?.score ?? 0));
});

test("recherche par alias institutionnel : le nom diffère, l'alias porte", () => {
	const ranked = rankOrgs(pool, "mairie de pessac");
	assert.equal(ranked[0].id, 1);
	assert.equal(ranked[0].reason, "exact-alias");
	assert.equal(ranked[0].matchedAlias, "Mairie de Pessac");
});

test("faute de frappe : une lettre rattrapée, deux lettres non", () => {
	// Le filet est volontairement serré (seuil 88) : « Pesssac » passe,
	// « Pesssak » (deux écarts) non. Mieux vaut manquer qu'inventer.
	const typo = rankOrgs([pessac], "Pesssac");
	assert.equal(typo.length, 1);
	assert.equal(typo[0].reason, "fuzzy");
	assert.equal(rankOrgs([pessac], "Pesssak").length, 0, "deux écarts : pas de proposition");
	const mixed = rankOrgs([pessac, org({ id: 9, name: "Pesssac" })], "Pesssac");
	assert.equal(mixed[0].id, 9, "l'exact gagne même quand le flou est proche");
	assert.equal(mixed[0].reason, "exact");
});

test("homonymes : l'activité départage, pas l'ordre d'insertion", () => {
	const ranked = rankOrgs([mazerolles16, mazerolles33], "Mazerolles");
	assert.equal(ranked.length, 2);
	assert.equal(ranked[0].id, 3, "la commune avec événements passe devant");
	assert.equal(ranked[0].score, ranked[1].score, "à force égale, c'est le départage qui tranche");
});

test("mots institutionnels seuls : pas de plantage, pas de jetons vides", () => {
	// Requête entièrement institutionnelle : on retombe sur les jetons bruts.
	assert.deepEqual(searchTokens("mairie de"), ["mairie", "de"]);
	const ranked = rankOrgs(pool, "mairie de");
	assert.ok(Array.isArray(ranked));
	assert.deepEqual(searchTokens(""), []);
});

test("jetons de présélection : le mot discriminant survit, les liaisons tombent", () => {
	assert.deepEqual(searchTokens("Commune de Saint-Médard-en-Jalles"), ["saint", "medard", "jalles"]);
	assert.deepEqual(searchTokens("du"), ["du"]);
});

test("sans correspondance : rien n'est proposé plutôt qu'un résultat douteux", () => {
	const ranked = rankOrgs(pool, "zzzzzzzzzz");
	assert.equal(ranked.length, 0);
});

test("domaine et ville sont cherchés aussi", () => {
	const withDomain = org({ id: 7, name: "CHU de Bordeaux", domain: "chu-bordeaux.fr", city: "Bordeaux" });
	assert.equal(rankOrgs([withDomain], "chu-bordeaux.fr")[0].id, 7);
	assert.equal(rankOrgs([withDomain], "Bordeaux")[0].id, 7);
});
