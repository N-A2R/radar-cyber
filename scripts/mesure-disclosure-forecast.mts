#!/usr/bin/env -S npx tsx
/**
 * Producteur de la fenêtre de publication d'incidents déjà survenus.
 *
 * Rejoue la règle SQL versionnée (migrations 217/218) sur la vérité terrain
 * datée des corpora, puis affiche le critère du chantier en sortie brute :
 *
 *   SELECT count(*) FROM disclosure_forecast
 *    WHERE issued_at<first_public_at
 *      AND first_public_at BETWEEN window_start AND window_end;
 *
 * Écriture : bench/results/disclosure-forecast.json (émises, réussies, taux).
 * Aucune donnée personnelle, aucun secret, aucun appel réseau.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-disclosure-forecast.mts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools } from "../apps/api/src/db.js";
import {
	DISCLOSURE_CRITERION_SQL,
	DISCLOSURE_MODEL,
	emitDisclosureForecasts,
	readDisclosureCriterion,
	readDisclosureScore,
} from "../apps/api/src/forecast/disclosure-forecast.js";

const OUTPUT_PATH = fileURLToPath(new URL("../bench/results/disclosure-forecast.json", import.meta.url));

async function main(): Promise<void> {
	const emittedByRule = await emitDisclosureForecasts(DISCLOSURE_MODEL);
	const inWindow = await readDisclosureCriterion();
	const score = await readDisclosureScore();

	const report = {
		model: DISCLOSURE_MODEL,
		criterion: DISCLOSURE_CRITERION_SQL,
		emitted: score.emitted,
		in_window: inWindow,
		hit_rate: score.hit_rate,
		recomputed_rows: emittedByRule,
		measured_at: new Date().toISOString(),
	};

	console.log(DISCLOSURE_CRITERION_SQL + ";");
	console.log(String(inWindow));
	console.log(`émises=${score.emitted} dans_la_fenêtre=${score.in_window} part=${score.hit_rate}`);

	writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
	console.log(`rapport: ${OUTPUT_PATH}`);
}

await main().finally(() => closePools());
