/**
 * Vérification du critère d'injection : exécute les requêtes du juge et échoue
 * si le taux ou la période de contrôle ne satisfont pas la cible.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/verifie-injection.mts
 */
import { closePools, query } from "../apps/api/src/db.js";
import { CONTROL_DAYS, LATENCY_CIBLE_S, SCENARIO_COUNT } from "../apps/api/src/eval/injection.js";

async function main(): Promise<void> {
	const taux = await query<{ taux: number; total: number }>(
		`SELECT count(*) FILTER (WHERE detected AND latency_s<=60)::float/count(*) AS taux,
		        count(*)::int AS total FROM injection_eval;`,
	);
	const controle = await query<{ nb: number }>(
		"SELECT count(*)::int AS nb FROM injection_eval WHERE control_period AND alerted;",
	);
	const jours = await query<{ jours: number; alertes: number }>(
		"SELECT count(*)::int AS jours, COALESCE(sum(alerts), 0)::int AS alertes FROM injection_control_eval;",
	);

	console.log("SELECT count(*) FILTER (WHERE detected AND latency_s<=60)::float/count(*) FROM injection_eval;");
	console.log(JSON.stringify(taux.rows));
	console.log("SELECT count(*) FROM injection_eval WHERE control_period AND alerted;");
	console.log(JSON.stringify(controle.rows));
	console.log("SELECT count(*), COALESCE(sum(alerts),0) FROM injection_control_eval;");
	console.log(JSON.stringify(jours.rows));

	const tauxValeur = taux.rows[0]?.taux ?? 0;
	const total = taux.rows[0]?.total ?? 0;
	const alertesControle = controle.rows[0]?.nb ?? 0;
	const alertesJours = jours.rows[0]?.alertes ?? 0;
	const echecs: string[] = [];
	if (total !== SCENARIO_COUNT) echecs.push(`${total} scénarios au lieu de ${SCENARIO_COUNT}`);
	if (tauxValeur < 0.9)
		echecs.push(`taux ${tauxValeur} < 0,90 (alerte requise en <= ${LATENCY_CIBLE_S} s)`);
	if (alertesControle !== 0) echecs.push(`${alertesControle} alerte(s) en période de contrôle`);
	if ((jours.rows[0]?.jours ?? 0) !== CONTROL_DAYS)
		echecs.push(`${jours.rows[0]?.jours ?? 0} jours de contrôle au lieu de ${CONTROL_DAYS}`);
	if (alertesJours !== 0) echecs.push(`${alertesJours} alerte(s) sur les ${CONTROL_DAYS} jours de contrôle`);

	if (echecs.length > 0) throw new Error(`critère non atteint : ${echecs.join(" ; ")}`);
	console.log(
		`critère atteint : ${tauxValeur} (${Math.round(tauxValeur * total)}/${total}),` +
			` 0 alerte sur ${CONTROL_DAYS} jours de contrôle`,
	);
}

try {
	await main();
} finally {
	await closePools();
}
