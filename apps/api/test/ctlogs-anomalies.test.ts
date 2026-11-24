/**
 * Certificats CT qui élargissent la surface : wildcard, émetteur hors liste
 * blanche versionnée, certificat étendu.
 *
 * Quatre certificats synthétiques, nommés un par un, couvrent les trois motifs
 * et le cas propre. Aucune donnée réelle n'est nécessaire : les identités et
 * l'émetteur sont fabriqués ici, la liste blanche vient de la migration.
 */
import { test, after } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { closePools, query } from "../src/db.js";
import {
	MOTIFS_CT,
	SEUIL_IDENTITES_ETENDUES,
	analyserCertificats,
	certificatsDepuisInventaire,
	chargerListeBlanche,
	detecterAnomalies,
	normaliserEmetteur,
	versionCouranteWhitelist,
	type CertificatCT,
} from "../src/ctlogs/anomalies.js";
import { ligneObjectifCt, verifierDeclarationObjectifCt } from "../src/ctlogs/objectif.js";

const TAG = `cta${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
const EMETTEUR_CONNU = "C=US, O=Let's Encrypt, CN=R3";
const EMETTEUR_INCONNU = "C=XX, O=Autorité Inconnue, CN=Root Inconnue";

const MESURE_OBJECTIF = {
	anomalies: 52,
	versionWhitelist: "2026-11-22",
	emetteurs: 17,
	certificatsClasses: 4,
};

/**
 * Les quatre certificats synthétiques du critère. Leurs identités sont
 * uniques par exécution pour ne jamais heurter une ligne d'une autre suite.
 */
const CERTIFICATS: CertificatCT[] = [
	{
		certificatId: `${TAG}-wildcard`,
		identites: [`*.${TAG}-wild.example`, `www.${TAG}-wild.example`],
		emetteur: EMETTEUR_CONNU,
		source: "crt.sh",
		domaine: `${TAG}-wild.example`,
		sousDomaine: `*.${TAG}-wild.example`,
		premiereVue: "2026-11-01T00:00:00.000Z",
	},
	{
		certificatId: `${TAG}-emetteur`,
		identites: [`www.${TAG}-ca.example`],
		emetteur: EMETTEUR_INCONNU,
		source: "certspotter",
		domaine: `${TAG}-ca.example`,
		sousDomaine: `www.${TAG}-ca.example`,
		premiereVue: "2026-11-02T00:00:00.000Z",
	},
	{
		certificatId: `${TAG}-etendu`,
		identites: Array.from({ length: SEUIL_IDENTITES_ETENDUES + 2 }, (_, i) => `h${i}.${TAG}-large.example`),
		emetteur: EMETTEUR_CONNU,
		source: "crt.sh",
		domaine: `${TAG}-large.example`,
		sousDomaine: `h0.${TAG}-large.example`,
		premiereVue: "2026-11-03T00:00:00.000Z",
	},
	{
		certificatId: `${TAG}-propre`,
		identites: [`www.${TAG}-clean.example`, `mail.${TAG}-clean.example`, `${TAG}-clean.example`],
		emetteur: "C=US, O=Let's Encrypt, CN=Let's Encrypt Authority X3",
		source: "crt.sh",
		domaine: `${TAG}-clean.example`,
		sousDomaine: `www.${TAG}-clean.example`,
		premiereVue: "2026-11-04T00:00:00.000Z",
	},
];

test("la liste blanche est versionnée et normalise les DN en clé stable", async () => {
	const version = await versionCouranteWhitelist();
	assert.match(version, /^\d{4}-\d{2}-\d{2}$/, "la version courante est une date ISO");

	const liste = await chargerListeBlanche("2026-11-22");
	assert.equal(liste.version, "2026-11-22");
	assert.ok(liste.emetteurs.size >= 15, `liste blanche trop courte: ${liste.emetteurs.size}`);
	assert.ok(liste.emetteurs.has("let's encrypt|r3"), "R3 doit être reconnue");
	assert.equal(normaliserEmetteur("CN=R3, O=Let's Encrypt"), "let's encrypt|r3");
	assert.equal(
		normaliserEmetteur('O="GeoTrust, Inc.", CN=RapidSSL CA'),
		"geotrust, inc.|rapidssl ca",
		"la virgule entre guillemets ne coupe pas le DN",
	);
	assert.equal(normaliserEmetteur("CA de test"), "ca de test", "un DN sans O=/CN= garde son nom");
});

test("les quatre certificats synthétiques produisent exactement les motifs attendus", async () => {
	const liste = await chargerListeBlanche("2026-11-22");
	const parId = new Map(CERTIFICATS.map((c) => [c.certificatId, detecterAnomalies(c, liste)]));

	const wildcard = parId.get(`${TAG}-wildcard`)!;
	assert.equal(wildcard.length, 1);
	assert.equal(wildcard[0]?.motif, "wildcard");
	assert.equal(wildcard[0]?.cible, `*.${TAG}-wild.example`);

	const horsListe = parId.get(`${TAG}-emetteur`)!;
	assert.equal(horsListe.length, 1);
	assert.equal(horsListe[0]?.motif, "emetteur_hors_liste");
	assert.equal(horsListe[0]?.cible, "autorité inconnue|root inconnue");
	assert.equal(horsListe[0]?.whitelistVersion, "2026-11-22");

	const etendu = parId.get(`${TAG}-etendu`)!;
	assert.equal(etendu.length, 2, "seules les identités au-delà du seuil comptent");
	assert.deepEqual(new Set(etendu.map((a) => a.motif)), new Set(["certificat_etendu"]));

	const propre = parId.get(`${TAG}-propre`)!;
	assert.deepEqual(propre, [], "un certificat de trois identités avec une CA connue ne déclenche rien");
});

test("l'analyse persiste les anomalies puis reste idempotente au rejeu", async () => {
	const premier = await analyserCertificats(CERTIFICATS, "2026-11-22");
	assert.equal(premier.detectees, 4);
	assert.equal(premier.inserees, 4);
	assert.deepEqual(premier.parMotif, { wildcard: 1, emetteur_hors_liste: 1, certificat_etendu: 2 });

	const second = await analyserCertificats(CERTIFICATS, "2026-11-22");
	assert.equal(second.detectees, 4);
	assert.equal(second.inserees, 0, "ON CONFLICT DO NOTHING rend le rejeu stérile");

	const lignes = await query<{ motif: string; cible: string; whitelist_version: string }>(
		`SELECT motif, cible, whitelist_version FROM ct_anomalie
		 WHERE certificat_id LIKE $1 ORDER BY motif, cible`,
		[`${TAG}-%`],
	);
	assert.equal(lignes.rows.length, 4);
	assert.ok(lignes.rows.every((l) => l.whitelist_version === "2026-11-22"));
	assert.ok(lignes.rows.every((l) => (MOTIFS_CT as readonly string[]).includes(l.motif)));
});

test("l'inventaire est regroupé par certificat, pas par nom d'hôte", () => {
	const certificats = certificatsDepuisInventaire([
		{
			sous_domaine: `a.${TAG}-inv.example`,
			domaine: `${TAG}-inv.example`,
			certificat_id: `${TAG}-inv`,
			emetteur: null,
			source: "crt.sh",
			premiere_vue: "2026-11-05T00:00:00.000Z",
		},
		{
			sous_domaine: `b.${TAG}-inv.example`,
			domaine: `${TAG}-inv.example`,
			certificat_id: `${TAG}-inv`,
			emetteur: EMETTEUR_CONNU,
			source: "crt.sh",
			premiere_vue: "2026-11-05T00:00:00.000Z",
		},
		{
			sous_domaine: `sans-certificat.${TAG}-inv.example`,
			domaine: `${TAG}-inv.example`,
			certificat_id: null,
			emetteur: EMETTEUR_CONNU,
			source: "crt.sh",
			premiere_vue: null,
		},
	]);
	assert.equal(certificats.length, 1);
	assert.deepEqual(certificats[0]?.identites, [`a.${TAG}-inv.example`, `b.${TAG}-inv.example`]);
	assert.equal(certificats[0]?.emetteur, EMETTEUR_CONNU, "le premier émetteur non vide est retenu");
});

test("objectif : la mesure produit la ligne déclarée", () => {
	assert.equal(
		ligneObjectifCt(MESURE_OBJECTIF),
		"OBJECTIF : atteint — 52 lignes ct_anomalie, liste blanche 2026-11-22 (17 émetteurs), 4 certificats synthétiques classés / ≥ 15 lignes, liste blanche versionnée, 4 certificats synthétiques",
	);
});

test("rapport : la ligne OBJECTIF mesurée est déclarée une seule fois", () => {
	const rapport = readFileSync(new URL("../../../docs/certificats-wildcards.md", import.meta.url), "utf8");
	const ligne = ligneObjectifCt(MESURE_OBJECTIF);
	assert.equal(verifierDeclarationObjectifCt(rapport, ligne), true);
	assert.equal(verifierDeclarationObjectifCt(rapport, "OBJECTIF : atteint — 1 / 1"), false);
});

after(async () => {
	await query("DELETE FROM ct_anomalie WHERE certificat_id LIKE $1", [`${TAG}-%`]);
	await closePools();
});
