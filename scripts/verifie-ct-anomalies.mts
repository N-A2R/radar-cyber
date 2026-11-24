/**
 * Vérification du critère de sortie « wildcards et émetteurs inhabités ».
 *
 * Crée une base dédiée, applique `db/init.sql`, toutes les migrations et le
 * jeu de test, charge les inventaires CT versionnés, détecte puis persiste les
 * anomalies, exécute mot pour mot la requête du juge et affiche sa sortie
 * brute. Échoue si le compte est < 15, si l'un des quatre certificats
 * synthétiques n'est pas classé comme attendu, ou si le rapport ne déclare
 * pas exactement une fois la ligne OBJECTIF mesurée.
 *
 * Les quatre certificats synthétiques passent par la détection pure : ils ne
 * sont pas insérés et ne gonflent donc jamais le compte de l'inventaire réel.
 *
 * Usage :
 *   pnpm verifie:ct-anomalies
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
	createTestDatabase,
	dropTestDatabase,
} from "../apps/api/test/helpers/testdb.js";
import { ligneObjectifCt, verifierDeclarationObjectifCt } from "../apps/api/src/ctlogs/objectif.js";

// pnpm cloisonne `pg` dans apps/api : depuis la racine, un import statique
// échoue en ERR_MODULE_NOT_FOUND (même piège que scripts/migrate.mts).
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const SNAPSHOTS = [
	new URL("../bench/results/ctlogs-inventaire-2026-11-21.json", import.meta.url),
	new URL("../bench/results/ctlogs-inventaire-2026-11-22.json", import.meta.url),
];

const RAPPORT = new URL("../docs/certificats-wildcards.md", import.meta.url);

/** Requête du juge, reprise mot pour mot. */
const CRITERE = `SELECT count(*)::int AS n
 FROM ct_anomalie
 WHERE motif IN ('wildcard', 'emetteur_hors_liste', 'certificat_etendu')`;

const SEUIL = 15;

type Snapshot = {
	sous_domaines: {
		sous_domaine: string;
		domaine: string;
		organisation: string;
		source: string;
		premiere_vue: string;
		certificat_id: string | null;
		emetteur: string | null;
	}[];
};

/** Quatre cas nommés sur `.example`, un par classe du critère. */
const CAS = (() => {
	const tag = `verif${Date.now().toString(36)}`;
	const connu = "C=US, O=Let's Encrypt, CN=R3";
	return [
		{
			nom: "wildcard",
			certificat: {
				certificatId: `${tag}-wildcard`,
				identites: [`*.${tag}-wild.example`, `www.${tag}-wild.example`],
				emetteur: connu,
			},
			attendu: { motif: "wildcard", lignes: 1 },
		},
		{
			nom: "emetteur_inconnu",
			certificat: {
				certificatId: `${tag}-emetteur`,
				identites: [`www.${tag}-ca.example`],
				emetteur: "C=XX, O=Autorité Inconnue, CN=Root Inconnue",
			},
			attendu: { motif: "emetteur_hors_liste", lignes: 1 },
		},
		{
			nom: "certificat_etendu",
			certificat: {
				certificatId: `${tag}-etendu`,
				identites: Array.from({ length: 7 }, (_, i) => `h${i}.${tag}-large.example`),
				emetteur: connu,
			},
			attendu: { motif: "certificat_etendu", lignes: 2 },
		},
		{
			nom: "certificat_propre",
			certificat: {
				certificatId: `${tag}-propre`,
				identites: [`www.${tag}-clean.example`, `${tag}-clean.example`],
				emetteur: "C=US, O=Let's Encrypt, CN=Let's Encrypt Authority X3",
			},
			attendu: { motif: null, lignes: 0 },
		},
	] as const;
})();

async function main(): Promise<void> {
	const db = await createTestDatabase();
	// Doit précéder le premier import de src/db.ts : les pools lisent
	// DATABASE_URL à l'évaluation du module.
	process.env.DATABASE_URL = db.url;
	const { analyserCertificats, certificatsDepuisInventaire, chargerListeBlanche, detecterAnomalies } =
		await import("../apps/api/src/ctlogs/anomalies.js");
	const { closePools } = await import("../apps/api/src/db.js");

	const client = new Client({ connectionString: db.url });
	await client.connect();
	try {
		let chargees = 0;
		for (const chemin of SNAPSHOTS) {
			const snapshot = JSON.parse(readFileSync(chemin, "utf8")) as Snapshot;
			for (const ligne of snapshot.sous_domaines) {
				const resultat = await client.query(
					`INSERT INTO ct_sous_domaine
					 (sous_domaine, domaine, organisation, source, premiere_vue, certificat_vu_le, certificat_id, emetteur)
					 VALUES ($1, $2, $3, $4, now(), $5::timestamptz, $6, $7)
					 ON CONFLICT (sous_domaine, source) DO NOTHING`,
					[
						ligne.sous_domaine,
						ligne.domaine,
						ligne.organisation,
						ligne.source,
						ligne.premiere_vue,
						ligne.certificat_id,
						ligne.emetteur,
					],
				);
				chargees += resultat.rowCount ?? 0;
			}
		}

		const inventaire = await client.query<{
			sous_domaine: string;
			domaine: string | null;
			certificat_id: string | null;
			emetteur: string | null;
			source: string | null;
			premiere_vue: Date | null;
		}>(
			`SELECT sous_domaine, domaine, certificat_id, emetteur, source, premiere_vue
			 FROM ct_sous_domaine
			 WHERE certificat_id IS NOT NULL AND certificat_id <> ''`,
		);
		const certificats = certificatsDepuisInventaire(inventaire.rows);
		const liste = await chargerListeBlanche();
		console.log(
			`Inventaires chargés : ${chargees} sous-domaine(s), ${certificats.length} certificat(s) distinct(s).`,
		);
		console.log(`Liste blanche : version ${liste.version}, ${liste.emetteurs.size} émetteur(s).`);
		console.log("");

		const analyse = await analyserCertificats(certificats, liste.version);
		console.log(
			`Détection : ${analyse.detectees} anomalie(s), ${analyse.inserees} ligne(s) persistée(s) ` +
				`(wildcard ${analyse.parMotif.wildcard}, hors liste ${analyse.parMotif.emetteur_hors_liste}, ` +
				`étendu ${analyse.parMotif.certificat_etendu}).`,
		);
		console.log("");

		console.log("Critère : SELECT count(*) FROM ct_anomalie WHERE motif IN ('wildcard','emetteur_hors_liste','certificat_etendu') >= 15");
		const critere = await client.query<{ n: number }>(CRITERE);
		const n = critere.rows[0]?.n ?? 0;
		console.log(" count");
		console.log("-------");
		console.log(` ${String(n).padStart(5)}`);
		console.log("(1 row)");
		console.log("");

		const motifs = await client.query<{ motif: string; n: number }>(
			`SELECT motif, count(*)::int AS n FROM ct_anomalie GROUP BY motif ORDER BY n DESC, motif`,
		);
		console.log("Répartition par motif :");
		for (const ligne of motifs.rows) console.log(`  ${ligne.motif.padEnd(19)} ${ligne.n}`);
		console.log("");

		const versions = await client.query<{ version: string; n: number }>(
			`SELECT version, count(*)::int AS n FROM ct_emetteur_whitelist GROUP BY version ORDER BY version DESC`,
		);
		console.log("Liste blanche versionnée :");
		for (const ligne of versions.rows) console.log(`  ${ligne.version}  ${ligne.n} émetteur(s)`);
		console.log("");

		console.log("Certificats synthétiques (détection pure, non insérés) :");
		let casEchoues = 0;
		for (const cas of CAS) {
			const anomalies = detecterAnomalies(cas.certificat, liste);
			const conforme =
				anomalies.length === cas.attendu.lignes &&
				(cas.attendu.motif === null || anomalies.every((a) => a.motif === cas.attendu.motif));
			if (!conforme) casEchoues++;
			const motifsObtenus = anomalies.map((a) => a.motif).join(",") || "aucune";
			console.log(
				`  ${conforme ? "OK  " : "ÉCHEC"}  ${cas.nom.padEnd(20)} ` +
					`attendu ${cas.attendu.lignes} ligne(s) ${cas.attendu.motif ?? "aucune"} → ${motifsObtenus}`,
			);
		}
		console.log("");

		if (n < SEUIL) {
			console.error(`ÉCHEC : count(*) = ${n}, attendu >= ${SEUIL}.`);
			process.exitCode = 1;
		} else if (casEchoues > 0) {
			console.error(`ÉCHEC : ${casEchoues} certificat(s) synthétique(s) mal classé(s).`);
			process.exitCode = 1;
		} else {
			console.log(`OK : ${n} >= ${SEUIL} et ${CAS.length}/${CAS.length} certificats synthétiques classés.`);
		}

		const ligne = ligneObjectifCt({
			anomalies: n,
			versionWhitelist: liste.version,
			emetteurs: liste.emetteurs.size,
			certificatsClasses: CAS.length - casEchoues,
		});
		const declaree = verifierDeclarationObjectifCt(readFileSync(RAPPORT, "utf8"), ligne);
		console.log("");
		console.log(ligne);
		console.log(`report declaration : ${declaree ? "ok" : "missing"}`);
		if (!declaree) process.exitCode = 1;
	} finally {
		await client.end();
		await closePools();
		await dropTestDatabase(db);
	}
}

main().catch((erreur: unknown) => {
	console.error(erreur);
	process.exitCode = 1;
});
