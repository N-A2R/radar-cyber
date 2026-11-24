/**
 * Mesure de détection par injection contrôlée en préproduction.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-injection.mts
 *
 * Écrit 30 scénarios synthétiques et 30 jours de contrôle, exécute le moteur
 * d'alertes réel, puis publie les résultats dans `injection_eval` et
 * `injection_control_eval`. Le rapport JSON est un artefact d'audit ; la base
 * reste la source du critère.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { closePools } from "../apps/api/src/db.js";
import {
	EVAL_RUN_ID,
	SCENARIO_COUNT,
	CONTROL_DAYS,
	LATENCY_CIBLE_S,
	mesurerInjection,
	lireCritereInjection,
} from "../apps/api/src/eval/injection.js";

function parseArgs(): { sortie: string; stdout: boolean } {
	let sortie = "bench/results/injection-eval.json";
	let stdout = false;
	for (const arg of process.argv.slice(2)) {
		if (arg.startsWith("--json=")) sortie = arg.slice("--json=".length);
		else if (arg === "--stdout") stdout = true;
		else throw new Error(`Option inconnue : ${arg}`);
	}
	return { sortie, stdout };
}

async function main(): Promise<void> {
	const opts = parseArgs();
	const rapport = await mesurerInjection();
	const critere = await lireCritereInjection();
	const contenu = `${JSON.stringify({ ...rapport, critere }, null, 2)}\n`;

	if (!opts.stdout) {
		const cible = resolve(opts.sortie);
		mkdirSync(dirname(cible), { recursive: true });
		writeFileSync(cible, contenu, "utf8");
	}

	console.log(`run : ${EVAL_RUN_ID} (tentative ${rapport.attempt})`);
	console.log(`scénarios injectés : ${rapport.scenarios.length}/${SCENARIO_COUNT}`);
	console.log(
		`alertes en <= ${LATENCY_CIBLE_S} s : ${rapport.detected}/${rapport.scenarios.length}` +
			` — latence max ${rapport.latencyMaxS} s`,
	);
	console.log(
		`contrôle : ${rapport.control.length}/${CONTROL_DAYS} jours,` +
			` ${rapport.controlAlerts} alerte(s), ${critere.jours_controle} jour(s) en base`,
	);
	console.log("--- critère (sortie brute SQL) ---");
	console.log(JSON.stringify(critere));
	if (!opts.stdout) console.log(`rapport : ${opts.sortie}`);
}

try {
	await main();
} finally {
	await closePools();
}
