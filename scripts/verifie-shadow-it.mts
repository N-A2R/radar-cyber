/**
 * Vérification du critère de sortie « shadow_it », sur une base neuve.
 *
 * Crée une base dédiée, applique `db/init.sql`, toutes les migrations et le
 * jeu de test, puis charge les inventaires CT versionnés. Exécute mot pour mot
 * la requête du juge, affiche sa sortie brute et échoue si elle est < 10.
 *
 * Usage :
 *   pnpm verifie:shadow-it
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
	createTestDatabase,
	dropTestDatabase,
} from "../apps/api/test/helpers/testdb.js";

// pnpm cloisonne `pg` dans apps/api : depuis la racine, un import statique
// échoue en ERR_MODULE_NOT_FOUND (même piège que scripts/migrate.mts).
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { Client } = require("pg") as typeof import("pg");

const SNAPSHOTS = [
	new URL("../bench/results/ctlogs-inventaire-2026-11-21.json", import.meta.url),
	new URL("../bench/results/ctlogs-inventaire-2026-11-22.json", import.meta.url),
];

const CRITERE = `SELECT count(*)::int AS n
 FROM ct_sous_domaine c
 LEFT JOIN asset a ON a.value = c.sous_domaine
 WHERE a.id IS NULL
   AND c.premiere_vue > now() - interval '30 days'`;

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

/**
 * Cinq cas nommés, sur des domaines `.example` : ils prouvent chaque classe du
 * classement sans dépendre des données collectées. Les motifs et scores sont
 * ceux du barème de `shadow_classer`.
 */
const CAS = (() => {
	const tag = `verif${Date.now().toString(36)}`;
	return [
		{ nom: "wildcard", sous_domaine: `*.${tag}-wild.example`, domaine: `${tag}-wild.example`, motif: "wildcard", score: 80 },
		{ nom: "staging", sous_domaine: `staging.${tag}.org-reference.example`, domaine: "org-reference.example", motif: "staging", score: 70 },
		{ nom: "typosquat", sous_domaine: `www.${tag}.org-referenc.example`, domaine: "org-referenc.example", motif: "typosquat", score: 90 },
		{ nom: "legitime", sous_domaine: `www.${tag}.org-reference.example`, domaine: "org-reference.example", motif: "legitime", score: 15 },
		{ nom: "orphelin", sous_domaine: `www.${tag}.inconnu-shadow.example`, domaine: "inconnu-shadow.example", motif: "orphelin", score: 55 },
	];
})();

async function main(): Promise<void> {
	const db = await createTestDatabase();
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
		console.log(`Inventaires chargés : ${chargees} sous-domaine(s) inscrit(s).`);
		console.log("");
		console.log("Critère : SELECT count(*) FROM ct_sous_domaine c LEFT JOIN asset a ... >= 10");
		const critere = await client.query<{ n: number }>(CRITERE);
		const n = critere.rows[0]?.n ?? 0;
		console.log(" count");
		console.log("-------");
		console.log(` ${String(n).padStart(5)}`);
		console.log("(1 row)");
		console.log("");

		const lignes = await client.query<{
			sous_domaine: string;
			domaine: string;
			motif: string;
			score: number;
		}>(
			`SELECT sous_domaine, domaine, motif, score
			 FROM shadow_it ORDER BY score DESC, sous_domaine`,
		);
		console.log(`Vue shadow_it : ${lignes.rows.length} ligne(s), chacune avec un motif et un score.`);
		for (const ligne of lignes.rows.slice(0, 12)) {
			console.log(`  ${String(ligne.score).padStart(3)}  ${ligne.motif.padEnd(9)}  ${ligne.sous_domaine}`);
		}
		if (lignes.rows.length > 12) console.log(`  … ${lignes.rows.length - 12} autre(s)`);
		console.log("");

		const motifs = await client.query<{ motif: string; n: number }>(
			`SELECT motif, count(*)::int AS n FROM shadow_it GROUP BY motif ORDER BY n DESC`,
		);
		console.log("Répartition par motif :");
		for (const ligne of motifs.rows) console.log(`  ${ligne.motif.padEnd(9)} ${ligne.n}`);
		console.log("");

		// Cinq cas nommés, ajoutés après la mesure du critère : ils ne gonflent
		// pas le compte de l'inventaire réel.
		for (const cas of CAS) {
			await client.query(
				`INSERT INTO ct_sous_domaine
				 (sous_domaine, domaine, organisation, source, premiere_vue, certificat_vu_le, certificat_id)
				 VALUES ($1, $2, 'Organisation de vérification', 'crt.sh',
				         now() - interval '1 day', now(), $3)
				 ON CONFLICT (sous_domaine, source) DO NOTHING`,
				[cas.sous_domaine, cas.domaine, `${cas.nom}-cert`],
			);
		}
		const casLignes = await client.query<{ sous_domaine: string; motif: string; score: number }>(
			`SELECT sous_domaine, motif, score FROM shadow_it WHERE sous_domaine = ANY($1::text[])`,
			[CAS.map((cas) => cas.sous_domaine)],
		);
		const parNom = new Map(casLignes.rows.map((ligne) => [ligne.sous_domaine, ligne]));
		let casEchoues = 0;
		console.log("Cas nommés :");
		for (const cas of CAS) {
			const ligne = parNom.get(cas.sous_domaine);
			const conforme = ligne?.motif === cas.motif && ligne.score === cas.score;
			if (!conforme) casEchoues++;
			console.log(
				`  ${conforme ? "OK  " : "ÉCHEC"}  ${String(cas.score).padStart(3)} ${cas.motif.padEnd(9)} ${cas.sous_domaine}` +
					(ligne ? `  → ${ligne.motif} ${ligne.score}` : "  → absente de shadow_it"),
			);
		}
		console.log("");

		if (n < 10) {
			console.error(`ÉCHEC : count(*) = ${n}, attendu >= 10.`);
			process.exitCode = 1;
		} else if (casEchoues > 0) {
			console.error(`ÉCHEC : ${casEchoues} cas nommé(s) mal classé(s).`);
			process.exitCode = 1;
		} else {
			console.log(`OK : ${n} >= 10 et ${CAS.length}/${CAS.length} cas nommés classés.`);
		}
	} finally {
		await client.end();
		await dropTestDatabase(db);
	}
}

main().catch((erreur: unknown) => {
	console.error(erreur);
	process.exitCode = 1;
});
