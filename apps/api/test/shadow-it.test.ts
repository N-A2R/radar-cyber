/**
 * Classement des sous-domaines CT par risque d'ombre (vue `shadow_it`).
 *
 * Cinq cas nommés couvrent les classes du classement : wildcard, staging,
 * typosquat, légitime, orphelin. Un lot de douze sous-domaines récents sans
 * actif vérifie le critère de sortie : la requête du juge renvoie au moins
 * dix lignes. Toutes les lignes portent l'étiquette `TAG` et sont supprimées
 * en fin de fichier ; aucun test ne touche une autre collecte.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";

const TAG = `shadow${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const ORG_CONNUE = "org-reference.example"; // domaine de l'organisation du jeu de test

type Cas = {
	nom: string;
	sous_domaine: string;
	domaine: string;
	motif: string;
	score: number;
};

const CAS: Cas[] = [
	{
		nom: "wildcard",
		sous_domaine: `*.${TAG}-wild.example`,
		domaine: `${TAG}-wild.example`,
		motif: "wildcard",
		score: 80,
	},
	{
		nom: "staging",
		sous_domaine: `staging.${TAG}.${ORG_CONNUE}`,
		domaine: ORG_CONNUE,
		motif: "staging",
		score: 70,
	},
	{
		nom: "typosquat",
		sous_domaine: `www.${TAG}.org-referenc.example`,
		domaine: "org-referenc.example",
		motif: "typosquat",
		score: 90,
	},
	{
		nom: "legitime",
		sous_domaine: `www.${TAG}.${ORG_CONNUE}`,
		domaine: ORG_CONNUE,
		motif: "legitime",
		score: 15,
	},
	{
		nom: "orphelin",
		sous_domaine: `www.${TAG}.inconnu-shadow.example`,
		domaine: "inconnu-shadow.example",
		motif: "orphelin",
		score: 55,
	},
];

const LOT = Array.from({ length: 12 }, (_, i) => ({
	sous_domaine: `h${String(i + 1).padStart(2, "0")}.${TAG}.lot-shadow.example`,
	domaine: "lot-shadow.example",
}));

async function inserer(lignes: { sous_domaine: string; domaine: string }[]): Promise<void> {
	for (const ligne of lignes) {
		await query(
			`INSERT INTO ct_sous_domaine
			 (sous_domaine, domaine, organisation, source, premiere_vue, certificat_id)
			 VALUES ($1, $2, 'Organisation de test', 'crt.sh', now() - interval '1 day', $3)
			 ON CONFLICT (sous_domaine, source) DO NOTHING`,
			[ligne.sous_domaine, ligne.domaine, `${TAG}-cert`],
		);
	}
}

test("shadow_it classe les cinq cas nommés avec un motif et un score", async () => {
	await inserer(CAS);
	const resultat = await query<{ sous_domaine: string; motif: string; score: number; motif_detail: string }>(
		`SELECT sous_domaine, motif, score, motif_detail FROM shadow_it
		 WHERE sous_domaine LIKE '%' || $1 || '%'`,
		[TAG],
	);
	const parNom = new Map(resultat.rows.map((r) => [r.sous_domaine, r]));
	for (const cas of CAS) {
		const ligne = parNom.get(cas.sous_domaine);
		assert.ok(ligne, `ligne absente de shadow_it : ${cas.nom} (${cas.sous_domaine})`);
		assert.equal(ligne.motif, cas.motif, `motif de ${cas.nom}`);
		assert.equal(ligne.score, cas.score, `score de ${cas.nom}`);
		assert.ok(ligne.motif_detail.length > 0, `motif_detail de ${cas.nom}`);
	}
});

test("le critère de sortie du juge renvoie au moins dix sous-domaines récents sans actif", async () => {
	await inserer(LOT);
	const brute = await query<{ n: number }>(
		`SELECT count(*)::int AS n
		 FROM ct_sous_domaine c
		 LEFT JOIN asset a ON a.value = c.sous_domaine
		 WHERE a.id IS NULL
		   AND c.premiere_vue > now() - interval '30 days'`,
	);
	assert.ok(brute.rows[0]!.n >= 10, `count(*) = ${brute.rows[0]!.n}, attendu >= 10`);
});

test("chaque ligne de shadow_it porte un score borné et un motif", async () => {
	const resultat = await query<{ n: number }>(
		`SELECT count(*)::int AS n FROM shadow_it
		 WHERE motif IS NULL OR motif = '' OR score IS NULL OR score NOT BETWEEN 0 AND 100`,
	);
	assert.equal(resultat.rows[0]!.n, 0);
});

test("un sous-domaine rattaché à un actif sort de shadow_it", async () => {
	await inserer(CAS);
	const org = await query<{ id: number }>("SELECT id FROM org WHERE domain = $1", [ORG_CONNUE]);
	const cible = CAS.find((cas) => cas.motif === "legitime")!;
	await query(
		`INSERT INTO asset (org_id, kind, value)
		 SELECT $1, 'subdomain', $2
		 WHERE NOT EXISTS (SELECT 1 FROM asset WHERE org_id = $1 AND kind = 'subdomain' AND value = $2)`,
		[org.rows[0]!.id, cible.sous_domaine],
	);
	const resultat = await query<{ n: number }>(
		"SELECT count(*)::int AS n FROM shadow_it WHERE sous_domaine = $1",
		[cible.sous_domaine],
	);
	assert.equal(resultat.rows[0]!.n, 0);
});

test("une distance 2 sur une étiquette courte n'est pas un typosquat", async () => {
	await query(
		`INSERT INTO org (name, slug, kind, city, domain, status)
		 VALUES ('Organisation spac test', $1, 'entreprise', 'Bordeaux', 'spac.example', 'confirme')
		 ON CONFLICT DO NOTHING`,
		[`org-spac-${TAG}`],
	);
	await inserer([{ sous_domaine: `www.${TAG}.pau.example`, domaine: "pau.example" }]);
	const resultat = await query<{ motif: string; score: number }>(
		"SELECT motif, score FROM shadow_it WHERE sous_domaine = $1",
		[`www.${TAG}.pau.example`],
	);
	assert.equal(resultat.rows[0]?.motif, "orphelin", "pau/spac à distance 2 mais étiquette trop courte");
	assert.equal(resultat.rows[0]?.score, 55);
});

after(async () => {
	await query("DELETE FROM org WHERE domain = 'spac.example'");
	await query("DELETE FROM asset WHERE value LIKE '%' || $1 || '%'", [TAG]);
	await query("DELETE FROM ct_sous_domaine WHERE sous_domaine LIKE '%' || $1 || '%'", [TAG]);
	await closePools();
});
