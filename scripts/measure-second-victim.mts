#!/usr/bin/env -S npx tsx
/**
 * Recalcule les secondes victimes et affiche le critère de sortie brut.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-second-victim.mts --check
 *
 * `--check` échoue si moins de 20 paires qualifiantes sont présentes ou si
 * moins de 50 % des secondes victimes ont été prédites avant leur `at`.
 * La règle est portée par `refresh_second_victim_predictions()` dans
 * `db/migrate-228-second-victim.sql` : ce script ne la duplique pas.
 */
import { closePools } from "../apps/api/src/db.js";
import {
	CRITERE_SECONDE_VICTIME,
	OBJECTIF_PAIRES,
	OBJECTIF_TAUX,
	lireCritereSecondesVictimes,
	lirePairesSecondesVictimes,
	rafraichirSecondesVictimes,
} from "../apps/api/src/analyse/second-victim.js";

async function principal(): Promise<void> {
	const ecrits = await rafraichirSecondesVictimes();
	const critere = await lireCritereSecondesVictimes();
	const paires = await lirePairesSecondesVictimes();

	console.log(`SQL> ${CRITERE_SECONDE_VICTIME};`);
	console.log(" paires | predites_avant | pourcentage");
	console.log("--------+----------------+-------------");
	console.log(
		` ${String(critere.paires).padStart(6)} | ${String(critere.predites_avant).padStart(14)} | ${String(critere.pourcentage).padStart(11)}`,
	);
	console.log("(1 row)");
	console.log(
		JSON.stringify(
			{
				pairesEcrites: ecrits,
				objectifPaires: OBJECTIF_PAIRES,
				objectifTaux: OBJECTIF_TAUX,
				exemples: paires.slice(0, 3).map((p) => ({
					campagne: p.campaign_key,
					ioc: p.ioc,
					ecartJours: Number(p.gap_days).toFixed(2),
					prediteAvant: p.predicted_before,
				})),
			},
			null,
			2,
		),
	);

	if (process.argv.includes("--check")) {
		const taux = critere.paires > 0 ? critere.predites_avant / critere.paires : 0;
		if (critere.paires < OBJECTIF_PAIRES || taux < OBJECTIF_TAUX) {
			throw new Error(
				`Objectif non atteint : ${critere.paires}/${OBJECTIF_PAIRES} paires, ` +
					`${(taux * 100).toFixed(1)} %/${OBJECTIF_TAUX * 100} % prédites avant l'événement`,
			);
		}
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
