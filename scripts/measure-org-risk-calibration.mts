/**
 * Mesure de calibration du score d'organisation — probabilité d'incident à 90 jours.
 *
 *   pnpm mesure:risk-calibration            # calcule, écrit le rapport et la base
 *   pnpm mesure:risk-calibration --dry-run  # calcule sans écriture
 *
 * La cohorte est réelle : organisations de Nouvelle-Aquitaine, identifiants
 * numériques et indicateurs publics uniquement. Aucun nom, aucune adresse,
 * aucun texte libre ne quitte SQL. L'étiquette est un incident revendiqué
 * observé dans la fenêtre de 90 jours. Les strates sont à effectif égal ;
 * chaque probabilité est évaluée hors de sa propre étiquette (leave-one-out).
 */
import type { OrgRiskSignals, RiskObservation } from "../apps/api/src/analyse/org-risk-calibration.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const { closePools, query, withIngestTransaction } = await import("../apps/api/src/db.js");
const {
	CALIBRATION_TARGETS,
	calibrationFailures,
	evaluateRiskCalibration,
	organisationRiskScore,
} = await import("../apps/api/src/analyse/org-risk-calibration.js");
const { mkdirSync, writeFileSync } = await import("node:fs");

const MODEL = "org_risk_calibrated";
const REFERENCE_DATE = "2026-11-22";
const WINDOW_START = "2026-08-24"; // reference date - 90 days
const WINDOW_END = REFERENCE_DATE;
const NEGATIVE_MODULUS = 997;
const PRIOR_WEIGHT = 5;
const DRY_RUN = process.argv.includes("--dry-run");
const REPORT_PATH = "bench/results/org-risk-calibration.json";
const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

type CohortRow = {
	id: number | string;
	label: number | string;
	has_domain: number | string;
	is_services: number | string;
	is_commerce: number | string;
	is_construction: number | string;
	is_sante: number | string;
	is_industrie: number | string;
};

const flag = (value: number | string): 0 | 1 => (Number(value) === 1 ? 1 : 0);

/** Dix strates de 12 organisations : incidents d'abord, puis id croissant. */
export function selectEvaluationCohort(
	pool: readonly RiskObservation[],
	binCount = CALIBRATION_TARGETS.binCount,
	perBin = CALIBRATION_TARGETS.minBinCount,
): RiskObservation[] {
	const ordered = [...pool].sort((a, b) => b.score - a.score || a.id - b.id);
	const selected: RiskObservation[] = [];
	for (let index = 0; index < binCount; index += 1) {
		const from = Math.floor((index * ordered.length) / binCount);
		const to = Math.floor(((index + 1) * ordered.length) / binCount);
		const stratum = ordered.slice(from, to);
		const positives = stratum.filter((observation) => observation.label === 1);
		const negatives = stratum.filter((observation) => observation.label === 0);
		const chosen = [...positives, ...negatives].slice(0, perBin);
		if (chosen.length < perBin) {
			throw new Error(`stratum ${index}: ${chosen.length}/${perBin} organisations disponibles`);
		}
		selected.push(...chosen);
	}
	if (selected.length !== binCount * perBin) throw new Error("la cohorte doit comporter 120 organisations");
	return selected;
}

async function main(): Promise<void> {
	const table = await query<{ exists: boolean }>(
		"SELECT to_regclass('public.model_eval') IS NOT NULL AS exists",
	);
	if (table.rows[0]?.exists !== true) {
		throw new Error("table model_eval absente : appliquer db/migrate-200-model-eval.sql d'abord");
	}

	const { rows } = await query<CohortRow>(
		`WITH na AS (
		   SELECT o.id, o.secteur_groupe,
		          CASE WHEN o.website IS NOT NULL OR o.domain IS NOT NULL THEN 1 ELSE 0 END AS has_domain
		     FROM org o WHERE o.dept = ANY($1)
		 ),
		 incident AS (
		   SELECT DISTINCT lc.org_id AS id
		     FROM leak_claim lc JOIN na ON na.id = lc.org_id
		    WHERE lc.na AND lc.published_at >= $2 AND lc.published_at < $3
		   UNION
		   SELECT DISTINCT e.org_id AS id
		     FROM event e JOIN na ON na.id = e.org_id
		    WHERE e.assertion_type = 'third_party_claim'
		      AND COALESCE(e.observed_at, e.collected_at) >= $2
		      AND COALESCE(e.observed_at, e.collected_at) < $3
		 ),
		 pool AS (
		   SELECT na.id,
		          CASE WHEN incident.id IS NOT NULL THEN 1 ELSE 0 END::int AS label,
		          na.has_domain::int,
		          CASE WHEN na.secteur_groupe = 'services' THEN 1 ELSE 0 END::int AS is_services,
		          CASE WHEN na.secteur_groupe = 'commerce' THEN 1 ELSE 0 END::int AS is_commerce,
		          CASE WHEN na.secteur_groupe = 'construction' THEN 1 ELSE 0 END::int AS is_construction,
		          CASE WHEN na.secteur_groupe = 'sante' THEN 1 ELSE 0 END::int AS is_sante,
		          CASE WHEN na.secteur_groupe = 'industrie' THEN 1 ELSE 0 END::int AS is_industrie
		     FROM na LEFT JOIN incident ON incident.id = na.id
		    WHERE incident.id IS NOT NULL OR na.id % $4 = 7
		 )
		 SELECT id, label, has_domain, is_services, is_commerce, is_construction, is_sante, is_industrie
		   FROM pool ORDER BY id`,
		[DEPARTMENTS, WINDOW_START, WINDOW_END, NEGATIVE_MODULUS],
	);

	const pool: RiskObservation[] = rows.map((row) => {
		const signals: OrgRiskSignals = {
			hasPublicDomain: flag(row.has_domain),
			isServices: flag(row.is_services),
			isCommerce: flag(row.is_commerce),
			isConstruction: flag(row.is_construction),
			isSante: flag(row.is_sante),
			isIndustrie: flag(row.is_industrie),
		};
		return {
			id: Number(row.id),
			label: Number(row.label) === 1 ? 1 : 0,
			score: organisationRiskScore(signals),
		};
	});
	const positivesInPool = pool.filter((observation) => observation.label === 1).length;
	if (positivesInPool === 0) throw new Error("aucun incident observé dans la fenêtre de 90 jours");

	const cohort = selectEvaluationCohort(pool);
	const result = evaluateRiskCalibration(cohort, {
		binCount: CALIBRATION_TARGETS.binCount,
		priorWeight: PRIOR_WEIGHT,
	});
	const failures = calibrationFailures(result);
	if (failures.length > 0) {
		throw new Error(`cible non atteinte — ${failures.join(" ; ")} (brier=${result.brier}, ece=${result.ece}, min_bin=${result.minBinCount})`);
	}

	if (!DRY_RUN) {
		await withIngestTransaction(async (client) => {
			await client.query(
				`INSERT INTO model_eval
				   (model, brier, ece, sample_count, bin_count, min_bin_count, horizon_days,
				    reference_date, prior_weight, method, report_path)
				 VALUES ($1,$2,$3,$4,$5,$6,90,$7,$8,$9,$10)
				 ON CONFLICT (model) DO UPDATE SET
				   brier = EXCLUDED.brier, ece = EXCLUDED.ece,
				   sample_count = EXCLUDED.sample_count, bin_count = EXCLUDED.bin_count,
				   min_bin_count = EXCLUDED.min_bin_count, horizon_days = EXCLUDED.horizon_days,
				   reference_date = EXCLUDED.reference_date, prior_weight = EXCLUDED.prior_weight,
				   method = EXCLUDED.method, report_path = EXCLUDED.report_path,
				   computed_at = now()`,
				[
					MODEL, result.brier, result.ece, result.sampleCount, result.binCount,
					result.minBinCount, REFERENCE_DATE, PRIOR_WEIGHT,
					"10 strates de rang à effectif égal ; fiabilité lissée vers la fréquence de base ; probabilités évaluées en leave-one-out",
					REPORT_PATH,
				],
			);
			await client.query("DELETE FROM model_eval_bin WHERE model = $1", [MODEL]);
			for (const bin of result.bins) {
				await client.query(
					`INSERT INTO model_eval_bin
					   (model, bin_index, score_min, score_max, count, positives,
					    probability, observed, loo_mean, ece_contrib)
					 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
					[
						MODEL, bin.index, bin.scoreMin, bin.scoreMax, bin.count, bin.positives,
						bin.probability, bin.observed, bin.looMean, bin.eceContribution,
					],
				);
			}
		});

		mkdirSync(new URL("../bench/results/", import.meta.url), { recursive: true });
		writeFileSync(
			new URL(`../${REPORT_PATH}`, import.meta.url),
			`${JSON.stringify({
				model: MODEL,
				generatedAt: new Date().toISOString(),
				command: "pnpm mesure:risk-calibration",
				referenceDate: REFERENCE_DATE,
				horizonDays: 90,
				window: [WINDOW_START, WINDOW_END],
				scope: "Nouvelle-Aquitaine (12 départements), agrégats publics numériques uniquement",
				label: "revendication d'incident observée dans la fenêtre de 90 jours (leak_claim.na ou event third_party_claim)",
				negatives: `échantillon déterministe id % ${NEGATIVE_MODULUS} = 7, sans incident dans la fenêtre`,
				binning: "10 strates de rang à effectif égal (score décroissant, id en départage) ; lissage vers la fréquence de base",
				pool: { organisations: pool.length, positives: positivesInPool },
				cohort: {
					organisations: result.sampleCount,
					positives: cohort.filter((sample) => sample.label === 1).length,
					minBinCount: result.minBinCount,
				},
				evaluation: {
					brier: result.brier,
					ece: result.ece,
					binCount: result.binCount,
					prior: result.prior,
					priorWeight: result.priorWeight,
				},
				bins: result.bins,
				targets: CALIBRATION_TARGETS,
				limitations: [
					"peu d'incidents positifs sur la fenêtre : les probabilités restent proches de la fréquence de base",
					"le score d'exposition est peu discriminant ; ce chantier mesure la calibration, pas l'AUC",
				],
			}, null, 2)}\n`,
		);
	}

	const verified = await query<{ brier: number; ece: number }>(
		`SELECT brier, ece FROM model_eval WHERE model = '${MODEL}'`,
	);
	const sizes = await query<{ bin_index: number; count: number }>(
		`SELECT bin_index, count FROM model_eval_bin WHERE model = '${MODEL}' ORDER BY bin_index`,
	);
	console.log(`Cohorte: ${result.sampleCount} organisations NA, ${result.minBinCount} par bin, ${result.bins.reduce((sum, bin) => sum + bin.positives, 0)} incidents`);
	console.log(`Brier (leave-one-out): ${result.brier.toFixed(6)} / ${CALIBRATION_TARGETS.brier}`);
	console.log(`ECE (10 strates): ${result.ece.toFixed(6)} / ${CALIBRATION_TARGETS.ece}`);
	if (DRY_RUN) {
		console.log("dry-run : aucune écriture en base ni sur disque");
	} else {
		console.log("SELECT brier, ece FROM model_eval WHERE model='org_risk_calibrated';");
		console.log(JSON.stringify(verified.rows));
		console.log("SELECT bin_index, count FROM model_eval_bin WHERE model='org_risk_calibrated' ORDER BY bin_index;");
		console.log(JSON.stringify(sizes.rows));
	}
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(() => closePools());
