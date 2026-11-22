/**
 * Reproducible measurement of the Nouvelle-Aquitaine organisation risk index.
 *
 *   pnpm mesure:risk
 *
 * Reads the live database only. No victim names, claim descriptions, titles,
 * summaries or free text leave SQL; the cohort is a list of organisation ids
 * and numeric public aggregates. Grey sources are included like any other
 * public source. Out-of-fold scores are used for ROC/AUC so that an
 * organisation never contributes to the model that scores it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import {
	crossValidatedRiskScores,
	fitRiskModel,
	type RiskPopulation,
	type RiskSample,
	type RiskSignals,
} from "../apps/api/src/analyse/organisation-risk.js";
import { auc, areaUnderCurve, rocCurve } from "../apps/api/src/analyse/risk-metrics.js";
import { RISK_NA_DEPARTMENTS, RISK_REFERENCE_DATE } from "../apps/api/src/analyse/organisation-risk-report.js";

const OUTPUT = new URL("../bench/results/organisation-risk.json", import.meta.url);
const REFERENCE_DATE = RISK_REFERENCE_DATE;
const NA_DEPARTMENTS = [...RISK_NA_DEPARTMENTS];
const NEGATIVE_MODULUS = 997;
const NEGATIVE_REMAINDER = 7;
const FOLDS = 5;

type CohortRow = {
	id: number;
	label: 0 | 1;
	ambient_events: number;
	ambient_sources: number;
	max_severity: number;
	days_ago: number | null;
	has_public_domain: 0 | 1;
	is_services: 0 | 1;
	is_commerce: 0 | 1;
	is_construction: 0 | 1;
	is_sante: 0 | 1;
	is_industrie: 0 | 1;
};

function round(value: number, digits = 6): number {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
}

async function main(): Promise<void> {
	const counts = await query<Record<string, number>>(
		`SELECT
		   (SELECT count(*)::int FROM org) AS total_organisations,
		   (SELECT count(*)::int FROM org WHERE dept = ANY($1)) AS na_organisations,
		   (SELECT count(*)::int FROM event) AS events,
		   (SELECT count(*)::int FROM source) AS sources,
		   (SELECT count(*)::int FROM source WHERE enabled) AS enabled_sources,
		   (SELECT count(*)::int FROM leak_claim WHERE na) AS na_claim_rows`,
		[NA_DEPARTMENTS],
	);
	const snapshot = counts.rows[0]!;

	const { rows } = await query<CohortRow>(
		`WITH na AS (
		   SELECT id FROM org WHERE dept = ANY($1)
		 ),
		 observed AS (
		   SELECT DISTINCT org_id AS id FROM leak_claim
		    WHERE na AND org_id IS NOT NULL
		   UNION
		   SELECT DISTINCT org_id AS id FROM event
		    WHERE assertion_type = 'third_party_claim' AND org_id IS NOT NULL
		 ),
		 cohort AS (
		   SELECT o.id, 1::int AS label FROM observed o JOIN na ON na.id = o.id
		   UNION ALL
		   SELECT na.id, 0::int AS label FROM na
		    WHERE na.id % $2 = $3
		      AND NOT EXISTS (SELECT 1 FROM observed o WHERE o.id = na.id)
		 ),
		 ambient AS (
		   SELECT e.org_id AS id,
		          count(*)::int AS ambient_events,
		          count(DISTINCT e.source_id)::int AS ambient_sources,
		          coalesce(max(e.severity), 0)::int AS max_severity,
		          max(greatest(0, date_part('day', $4::date - COALESCE(e.observed_at, e.collected_at))))::int AS days_ago
		     FROM event e
		    WHERE e.org_id IS NOT NULL
		      AND e.assertion_type <> 'third_party_claim'
		      AND e.family NOT IN ('ransomware', 'leaks')
		    GROUP BY e.org_id
		 )
		 SELECT c.id, c.label::int AS label,
		        coalesce(a.ambient_events, 0)::int AS ambient_events,
		        coalesce(a.ambient_sources, 0)::int AS ambient_sources,
		        coalesce(a.max_severity, 0)::int AS max_severity,
		        a.days_ago,
		        CASE WHEN o.website IS NOT NULL OR o.domain IS NOT NULL THEN 1 ELSE 0 END::int AS has_public_domain,
		        CASE WHEN o.secteur_groupe = 'services' THEN 1 ELSE 0 END::int AS is_services,
		        CASE WHEN o.secteur_groupe = 'commerce' THEN 1 ELSE 0 END::int AS is_commerce,
		        CASE WHEN o.secteur_groupe = 'construction' THEN 1 ELSE 0 END::int AS is_construction,
		        CASE WHEN o.secteur_groupe = 'sante' THEN 1 ELSE 0 END::int AS is_sante,
		        CASE WHEN o.secteur_groupe = 'industrie' THEN 1 ELSE 0 END::int AS is_industrie
		   FROM cohort c
		   JOIN org o ON o.id = c.id
		   LEFT JOIN ambient a ON a.id = c.id
		  ORDER BY c.id`,
		[NA_DEPARTMENTS, NEGATIVE_MODULUS, NEGATIVE_REMAINDER, REFERENCE_DATE],
	);

	const samples: RiskSample[] = rows.map((row) => ({
		id: Number(row.id),
		label: Number(row.label) === 1 ? 1 : 0,
		signals: {
			ambientEvents: Number(row.ambient_events),
			ambientSources: Number(row.ambient_sources),
			maxSeverity: Number(row.max_severity),
			lastObservedDaysAgo: row.days_ago === null ? null : Number(row.days_ago),
			hasPublicDomain: Number(row.has_public_domain) === 1 ? 1 : 0,
			isServices: Number(row.is_services) === 1 ? 1 : 0,
			isCommerce: Number(row.is_commerce) === 1 ? 1 : 0,
			isConstruction: Number(row.is_construction) === 1 ? 1 : 0,
			isSante: Number(row.is_sante) === 1 ? 1 : 0,
			isIndustrie: Number(row.is_industrie) === 1 ? 1 : 0,
		} satisfies RiskSignals,
	}));
	const positives = samples.filter((sample) => sample.label === 1).length;
	const negatives = samples.length - positives;
	if (positives === 0 || negatives === 0) {
		throw new Error("a measurable cohort needs observed incidents and comparison organisations");
	}

	const population: RiskPopulation = {
		totalOrganisations: Number(snapshot.na_organisations),
		incidentOrganisations: positives,
	};
	const scored = crossValidatedRiskScores(samples, population, FOLDS);
	const binary = scored.map((sample) => ({ score: sample.probability, label: sample.label }));
	const points = rocCurve(binary);
	const measuredAuc = auc(binary);
	const curveArea = areaUnderCurve(points);
	if (Math.abs(measuredAuc - curveArea) > 1e-9) {
		throw new Error("rank AUC and ROC trapezoid area disagree");
	}

	const buckets = Array.from({ length: 10 }, (_, index) => ({
		from: index * 10,
		to: index * 10 + 9,
		organisations: scored.filter((sample) => sample.score >= index * 10 && sample.score <= index * 10 + 9).length,
	}));
	const model = fitRiskModel(samples, population);
	const report = {
		generatedAt: new Date().toISOString(),
		command: "pnpm mesure:risk",
		referenceDate: REFERENCE_DATE,
		definitions: {
			scope: "Nouvelle-Aquitaine organisations identified by department code",
			label: "an incident claim observed in leak_claim (na) or event (third_party_claim)",
			features: "public numeric aggregates, sector flags and web presence; claim events excluded",
			score: "0-100 index: 0 at population baseline, 100 at the 75th percentile of observed incident excess",
			auc: "Mann-Whitney AUC of out-of-fold calibrated probabilities, equals the ROC trapezoid area",
			negatives: `deterministic sample: id % ${NEGATIVE_MODULUS} = ${NEGATIVE_REMAINDER}, no observed incident`,
		},
		snapshot: {
			totalOrganisations: Number(snapshot.total_organisations),
			naOrganisations: Number(snapshot.na_organisations),
			events: Number(snapshot.events),
			sources: Number(snapshot.sources),
			enabledSources: Number(snapshot.enabled_sources),
			naClaimRows: Number(snapshot.na_claim_rows),
		},
		population,
		cohort: { total: samples.length, positives, negatives, folds: FOLDS },
		model: {
			weights: model.weights.map((weight) => round(weight)),
			intercept: round(model.intercept),
			priorLogOdds: round(model.priorLogOdds),
			meanExponent: round(model.meanExponent),
			referenceExcess: round(model.referenceExcess),
		},
		evaluation: {
			auc: round(measuredAuc),
			rocArea: round(curveArea),
			rocPoints: points.map((point) => ({
				threshold: point.threshold === null ? null : round(point.threshold),
				truePositiveRate: round(point.truePositiveRate),
				falsePositiveRate: round(point.falsePositiveRate),
			})),
			scoreBuckets: buckets,
		},
	};

	mkdirSync(new URL("../bench/results/", import.meta.url), { recursive: true });
	writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`Scope: ${population.totalOrganisations} NA organisations, ${snapshot.events} events, ${snapshot.sources} sources`);
	console.log(`Cohort: ${positives} observed incidents vs ${negatives} comparison organisations, ${FOLDS} folds`);
	console.log(`AUC: ${round(measuredAuc)} (ROC area ${round(curveArea)})`);
	console.log(`Scores 0-100: ${buckets.filter((bucket) => bucket.organisations > 0).length}/10 bands populated`);
	console.log(`Report: ${OUTPUT.pathname}`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => closePools());
