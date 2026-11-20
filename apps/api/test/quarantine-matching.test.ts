/**
 * Rapprochement de revendication — chemins de score, test sans base.
 *
 * Le cas qui a motivé ce fichier : une revendication qui ne donne qu'un
 * domaine (« black-star.fr ») ne pouvait rencontrer aucune organisation dont on
 * connaît le nom mais pas le site, alors que `org.domain` n'est renseigné que
 * pour 12 organisations sur 1 244 048. Le domaine est désormais un indice de
 * nom, scoré par les mêmes règles — donc **jamais** au niveau d'une clé.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTO_MIN_CONFIDENCE, matchOrgInIndex, normalizeName, type OrgIndexEntry } from "../src/quarantine/promote.js";

/** Entrée d'index telle que `loadOrgIndex` la produit. */
function entry(
	id: number,
	name: string,
	extra: { city?: string | null; domain?: string | null; website?: string | null } = {},
): OrgIndexEntry {
	const domain = extra.domain ?? null;
	const website = extra.website ?? null;
	const city = extra.city ?? null;
	const nameNorm = normalizeName(name);
	return {
		id,
		name,
		slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
		kind: "entreprise",
		city,
		domain,
		website,
		nameNorm,
		domainNorm: domain ? domain.toLowerCase().replace(/^www\./, "") : null,
		websiteDomain: website ? website.toLowerCase().replace(/^www\./, "").replace(/^https?:\/\//, "") : null,
		cityNorm: city ? normalizeName(city) : null,
		nameTokens: [...new Set(nameNorm.split(" ").filter((t) => t.length >= 4))],
	};
}

test("un domaine nu rencontre une organisation connue par son nom seul", () => {
	const index = [entry(7, "EARL BLACK STAR", { city: "Poitiers" })];
	const match = matchOrgInIndex("black-star.fr", index);
	assert.ok(match, "le domaine doit rencontrer le nom");
	assert.equal(match.orgId, 7);
	assert.equal(match.confidence, 0.75);
});

test("le chemin domaine→nom ne peut jamais déclencher une promotion automatique", () => {
	const index = [entry(7, "EARL BLACK STAR")];
	const match = matchOrgInIndex("black-star.fr", index);
	assert.ok(match);
	assert.ok(
		match.confidence < AUTO_MIN_CONFIDENCE,
		`${match.confidence} ne doit pas atteindre le seuil automatique ${AUTO_MIN_CONFIDENCE}`,
	);
});

test("une forme juridique seule ne fonde aucun rapprochement", () => {
	const index = [entry(9, "SARL DUPONT")];
	assert.equal(matchOrgInIndex("sarl.fr", index), null);
});

test("le jeton générique « com » ne rattache pas tout un domaine", () => {
	const index = [entry(11, "N-COM")];
	assert.equal(matchOrgInIndex("conecuhsausage.com", index), null);
});

test("l'égalité de domaine reste une clé : 0,95, au-dessus du seuil automatique", () => {
	const index = [entry(3, "SIDES", { domain: "sides.fr" })];
	const match = matchOrgInIndex("sides.fr", index);
	assert.ok(match);
	assert.equal(match.via, "domain");
	assert.equal(match.confidence, 0.95);
	assert.ok(match.confidence >= AUTO_MIN_CONFIDENCE);
});

test("le domaine ne rachète pas un nom à jeton unique", () => {
	// Cas mesuré par la suite existante : `advelo-<tag>.com` se rattachait à
	// « N-COM (N-COM) <tag> » dès que le domaine était compté comme un indice
	// court, le seul jeton restant étant le tag commun aux deux.
	const index = [entry(12, "N-COM (N-COM) xyz123", { domain: "ncom-xyz123.example" })];
	assert.equal(matchOrgInIndex("advelo-xyz123.com", index), null);
});
