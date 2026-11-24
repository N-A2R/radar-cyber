#!/usr/bin/env -S npx tsx
/**
 * Recalcule les campagnes multi-victimes et affiche le critère de sortie.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/build-campaign-clusters.mts --check
 *
 * `--check` échoue si moins de 10 campagnes qualifiantes sont présentes.
 * La règle de clustering est portée par `refresh_campaign_clusters()` dans
 * `db/migrate-225-campaign-cluster.sql` : ce script ne la duplique pas.
 */
import { closePools, query } from "../apps/api/src/db.js";
import {
	CRITERE_CAMPAGNES_MV,
	OBJECTIF_CLUSTERS,
	lireCampagnesClusters,
	lireCritereCampagnesClusters,
	rafraichirCampagnesClusters,
} from "../apps/api/src/analyse/campaign-cluster.js";

/** Forme littérale annoncée : le `>=10` ne peut pas s'appliquer à un booléen. */
const CRITERE_LITTERAL =
	"SELECT count(*) FROM campaign_cluster WHERE org_count>=3 AND (shared_ioc>=2 OR shared_text_hash>=2) >=10";

async function principal(): Promise<void> {
	const ecrits = await rafraichirCampagnesClusters();
	const clusters = await lireCampagnesClusters();
	const qualifiants = await lireCritereCampagnesClusters();

	console.log(`SQL> ${CRITERE_LITTERAL}`);
	try {
		const brut = await query<{ count: string }>(CRITERE_LITTERAL);
		console.log(` count\n-------\n${brut.rows[0]?.count ?? "0"}\n(1 row)`);
	} catch (erreur) {
		console.log(`ERREUR: ${erreur instanceof Error ? erreur.message : String(erreur)}`);
		console.log("(le seuil >=10 porte sur le count, pas sur le prédicat WHERE)");
	}

	console.log(`SQL> ${CRITERE_CAMPAGNES_MV};`);
	console.log(` count\n-------\n${String(qualifiants).padStart(5)}\n(1 row)`);
	console.log(
		JSON.stringify(
			{
				clustersEcrits: ecrits,
				qualifiants,
				objectif: OBJECTIF_CLUSTERS,
				exemples: clusters.slice(0, 3).map((c) => ({
					cle: c.cle,
					org_count: c.org_count,
					shared_ioc: c.shared_ioc,
					shared_text_hash: c.shared_text_hash,
				})),
			},
			null,
			2,
		),
	);

	if (process.argv.includes("--check") && qualifiants < OBJECTIF_CLUSTERS) {
		throw new Error(`Objectif non atteint : ${qualifiants}/${OBJECTIF_CLUSTERS}`);
	}
}

principal()
	.catch((erreur: unknown) => {
		console.error(erreur);
		process.exitCode = 1;
	})
	.finally(() => {
		void closePools();
	});
