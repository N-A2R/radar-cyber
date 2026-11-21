/**
 * Préfiltre SQL des candidats — test différentiel.
 *
 * `promoteMatches` ne charge plus les 1,24 M d'organisations : il demande à
 * SQL les organisations dont le nom porte un jeton de l'indice (index
 * trigramme) ou dont le domaine peut correspondre, puis applique le moteur.
 *
 * Ce test vérifie la propriété qui rend le raccourci légitime : sur le même
 * jeu d'indices, le moteur appliqué aux candidats rend **exactement** le même
 * résultat que le moteur appliqué à l'index complet.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closePools, query } from "../src/db.js";
import { loadCandidateIndex, loadOrgIndex, matchOrgInIndex } from "../src/quarantine/promote.js";

const created: number[] = [];

async function insertOrg(name: string, opts: { domain?: string | null; city?: string | null } = {}): Promise<number> {
	const r = await query<{ id: number }>(
		"INSERT INTO org (name, slug, kind, domain, city) VALUES ($1,$2,'entreprise',$3,$4) RETURNING id",
		[name, `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${created.length}-${Date.now()}`, opts.domain ?? null, opts.city ?? null],
	);
	created.push(r.rows[0].id);
	return r.rows[0].id;
}

after(async () => {
	if (created.length > 0) await query("DELETE FROM org WHERE id = ANY($1::int[])", [created]).catch(() => {});
	await closePools();
});

test("le préfiltre SQL rend le même rattachement que l'index complet", async () => {
	const blackStar = await insertOrg("EARL BLACK STAR", { city: "Poitiers" });
	const sadeco = await insertOrg("SADECO", { domain: "sadeco.example" });
	const unrelated = await insertOrg("BOULANGERIE DU COIN", { domain: "boulangerie-coin.example" });
	// Nom accentué : le préfiltre d'origine (migration 041 non appliquée)
	// cherchait « %epicerie% » dans un nom qui porte « Épicerie » et ne le
	// trouvait jamais — l'organisation était invisible du préfiltre alors que
	// le moteur, lui, normalise les accents des deux côtés.
	const epicerie = await insertOrg("Épicerie Régionale d'Espérance", { city: "Niort" });

	const hints = [
		"black-star.fr",
		"sadeco.example",
		"blackstar.example",
		"boulangerie-coin.example",
		"conecuhsausage.com",
		"SADECO",
		"Poitiers",
		"epicerie-regionale-esperance.fr",
	];

	const full = await loadOrgIndex();
	for (const hint of hints) {
		const candidates = await loadCandidateIndex(hint);
		assert.deepEqual(
			matchOrgInIndex(hint, candidates),
			matchOrgInIndex(hint, full),
			`divergence sur « ${hint} » (${candidates.length} candidats pour ${full.length} organisations)`,
		);
	}

	const byDomain = matchOrgInIndex("sadeco.example", await loadCandidateIndex("sadeco.example"));
	assert.equal(byDomain?.orgId, sadeco);
	const byName = matchOrgInIndex("black-star.fr", await loadCandidateIndex("black-star.fr"));
	assert.equal(byName?.orgId, blackStar);
	assert.equal(byName?.confidence, 0.75);
	assert.notEqual(matchOrgInIndex("conecuhsausage.com", full)?.orgId, unrelated);
	// Le nom accentué est trouvé par le préfiltre déaccentué (name_norm) et
	// rattaché par le moteur à 0,75 — tous les jetons distinctifs sont
	// présents dans l'indice.
	const byAccent = matchOrgInIndex("epicerie-regionale-esperance.fr", await loadCandidateIndex("epicerie-regionale-esperance.fr"));
	assert.equal(byAccent?.orgId, epicerie);
	assert.equal(byAccent?.confidence, 0.75);
});
