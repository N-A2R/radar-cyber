#!/usr/bin/env -S npx tsx
/**
 * Rejoue le backtest des changements de régime et écrit la mesure en base.
 *
 * La fixture versionnée `bench/changepoints/serie-460j.json` est d'abord
 * chargée dans une table `event` dédiée (`changepoint_bench`), puis la série
 * quotidienne est relue par la même requête que la production
 * (`count(*) GROUP BY family, jour`). Le détecteur tourne ensuite sur ces
 * comptes, jamais sur une série calculée hors base : un écart entre fixture et
 * lecture SQL fait échouer la mesure.
 *
 * Sorties :
 *   - `bench/results/changements-regime-460j.json` (rapport rejouable) ;
 *   - `changepoint_annotation`, `changepoint_eval`, `changepoint_detection`,
 *     `changepoint_metric` (mesure interrogeable).
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5432/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-changements-regime.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query, withClient } from "../apps/api/src/db.js";
import { DEFAULT_CHANGEPOINT_OPTIONS } from "../apps/api/src/analyse/changepoint.js";
import {
	CHANGEPOINT_MAX_DELAY_DAYS,
	describeBacktest,
	runChangepointBacktest,
	type ChangepointFixture,
} from "../apps/api/src/analyse/changepoint-backtest.js";

const FIXTURE_PATH = fileURLToPath(new URL("../bench/changepoints/serie-460j.json", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../bench/results/changements-regime-460j.json", import.meta.url));
const BENCH_SCHEMA = "changepoint_bench";
const SOURCE = "benchmark-changepoints-460j";

type VolumeRow = { family: string; day: string; volume: number };

const SERIES_SQL = `SELECT family,
       to_char(date_trunc('day', observed_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
       count(*)::int AS volume
  FROM ${BENCH_SCHEMA}.event
 WHERE observed_at >= $1::date
   AND observed_at < $1::date + $2::int * interval '1 day'
 GROUP BY 1, 2
 ORDER BY 1, 2`;

async function loadAndReadFixture(fixture: ChangepointFixture): Promise<void> {
	await query(`DROP SCHEMA IF EXISTS ${BENCH_SCHEMA} CASCADE`);
	await query(`CREATE SCHEMA ${BENCH_SCHEMA}`);
	await query(`CREATE TABLE ${BENCH_SCHEMA}.event (
		id bigserial PRIMARY KEY,
		family text NOT NULL,
		observed_at timestamptz NOT NULL,
		collected_at timestamptz NOT NULL,
		title text NOT NULL,
		source_id text NOT NULL
	)`);

	const payload: Array<{ family: string; day: string; n: number }> = [];
	for (const [family, data] of Object.entries(fixture.families)) {
		for (let offset = 0; offset < fixture.days; offset++) {
			const count = data.counts[offset] ?? 0;
			if (count <= 0) continue;
			const day = new Date(Date.parse(`${fixture.start}T00:00:00Z`) + offset * 86_400_000)
				.toISOString()
				.slice(0, 10);
			payload.push({ family, day, n: count });
		}
	}
	await query(
		`INSERT INTO ${BENCH_SCHEMA}.event (family, observed_at, collected_at, title, source_id)
		 SELECT v.family,
		        (v.day::date + time '12:00') AT TIME ZONE 'UTC',
		        (v.day::date + time '12:00') AT TIME ZONE 'UTC',
		        'Fixture de benchmark changements de régime — volume simulé',
		        $1
		   FROM jsonb_to_recordset($2::jsonb) AS v(family text, day date, n integer)
		   CROSS JOIN LATERAL generate_series(1, v.n) g`,
		[SOURCE, JSON.stringify(payload)],
	);

	const rows = await withClient(async (client) => {
		await client.query("BEGIN");
		try {
			await client.query("SET LOCAL TIME ZONE 'UTC'");
			const result = await client.query<VolumeRow>(SERIES_SQL, [fixture.start, fixture.days]);
			await client.query("COMMIT");
			return result.rows;
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}
	});

	const seen = new Map(rows.map((row) => [`${row.family}\u0000${row.day}`, Number(row.volume)]));
	for (const [family, data] of Object.entries(fixture.families)) {
		for (let offset = 0; offset < fixture.days; offset++) {
			const day = new Date(Date.parse(`${fixture.start}T00:00:00Z`) + offset * 86_400_000)
				.toISOString()
				.slice(0, 10);
			const expected = data.counts[offset] ?? 0;
			const actual = seen.get(`${family}\u0000${day}`) ?? 0;
			if (actual !== expected) {
				throw new Error(`fixture/SQL désaccord ${family} ${day}: attendu ${expected}, lu ${actual}`);
			}
		}
	}
}

async function writeMeasurement(fixture: ChangepointFixture): Promise<void> {
	const backtest = runChangepointBacktest(fixture);
	const params = DEFAULT_CHANGEPOINT_OPTIONS;

	await query("DELETE FROM changepoint_annotation WHERE model = $1 AND source = $2", [fixture.model, SOURCE]);
	for (const annotation of fixture.annotations) {
		await query(
			`INSERT INTO changepoint_annotation
			   (model, family, changepoint_day, direction, multiplier, rationale, source)
			 VALUES ($1, $2, $3::date, $4, $5, $6, $7)
			 ON CONFLICT (model, family, changepoint_day) DO UPDATE SET
			   direction = EXCLUDED.direction,
			   multiplier = EXCLUDED.multiplier,
			   rationale = EXCLUDED.rationale,
			   source = EXCLUDED.source`,
			[
				fixture.model,
				annotation.family,
				annotation.day,
				annotation.direction,
				annotation.multiplier,
				annotation.rationale,
				SOURCE,
			],
		);
	}

	await query("DELETE FROM changepoint_eval WHERE model = $1 AND source = $2", [fixture.model, SOURCE]);
	for (const row of backtest.rows) {
		await query(
			`INSERT INTO changepoint_eval
			   (model, family, annotated_day, direction, detected, detected_on, delay_days, score, source)
			 VALUES ($1, $2, $3::date, $4, $5, $6::date, $7, $8, $9)
			 ON CONFLICT (model, family, annotated_day) DO UPDATE SET
			   direction = EXCLUDED.direction,
			   detected = EXCLUDED.detected,
			   detected_on = EXCLUDED.detected_on,
			   delay_days = EXCLUDED.delay_days,
			   score = EXCLUDED.score,
			   source = EXCLUDED.source,
			   measured_at = now()`,
			[
				fixture.model,
				row.family,
				row.annotatedDay,
				row.direction,
				row.detected,
				row.detectedOn,
				row.delayDays,
				row.score,
				SOURCE,
			],
		);
	}

	await query("DELETE FROM changepoint_detection WHERE model = $1 AND source = $2", [fixture.model, SOURCE]);
	for (const detection of backtest.detections) {
		await query(
			`INSERT INTO changepoint_detection
			   (model, family, detected_on, confirmed_on, direction, score, baseline_weekly,
			    level_weekly, ratio, matched_annotation_day, delay_days, false_positive, source)
			 VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10::date, $11, $12, $13)
			 ON CONFLICT (model, family, detected_on) DO UPDATE SET
			   confirmed_on = EXCLUDED.confirmed_on,
			   direction = EXCLUDED.direction,
			   score = EXCLUDED.score,
			   baseline_weekly = EXCLUDED.baseline_weekly,
			   level_weekly = EXCLUDED.level_weekly,
			   ratio = EXCLUDED.ratio,
			   matched_annotation_day = EXCLUDED.matched_annotation_day,
			   delay_days = EXCLUDED.delay_days,
			   false_positive = EXCLUDED.false_positive,
			   source = EXCLUDED.source,
			   measured_at = now()`,
			[
				fixture.model,
				detection.family,
				detection.detectedOn,
				detection.confirmedOn,
				detection.direction,
				detection.score,
				detection.baseline,
				detection.level,
				detection.ratio,
				detection.matchedAnnotationDay,
				detection.delayDays,
				detection.falsePositive,
				SOURCE,
			],
		);
	}

	const metrics = backtest.metrics;
	await query(
		`INSERT INTO changepoint_metric
		   (model, annotated, detected_within_7, detection_rate, false_positives, evaluated_days,
		    false_positives_per_year, late_detections, median_delay_days, average_delay_days,
		    baseline_weeks, z_threshold, confirm_days, source)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		 ON CONFLICT (model) DO UPDATE SET
		   annotated = EXCLUDED.annotated,
		   detected_within_7 = EXCLUDED.detected_within_7,
		   detection_rate = EXCLUDED.detection_rate,
		   false_positives = EXCLUDED.false_positives,
		   evaluated_days = EXCLUDED.evaluated_days,
		   false_positives_per_year = EXCLUDED.false_positives_per_year,
		   late_detections = EXCLUDED.late_detections,
		   median_delay_days = EXCLUDED.median_delay_days,
		   average_delay_days = EXCLUDED.average_delay_days,
		   baseline_weeks = EXCLUDED.baseline_weeks,
		   z_threshold = EXCLUDED.z_threshold,
		   confirm_days = EXCLUDED.confirm_days,
		   source = EXCLUDED.source,
		   measured_at = now()`,
		[
			fixture.model,
			metrics.annotated,
			metrics.detectedWithin7,
			metrics.detectionRate,
			metrics.falsePositives,
			metrics.evaluatedDays,
			metrics.falsePositivesPerYear,
			metrics.lateDetections,
			metrics.medianDelayDays,
			metrics.averageDelayDays,
			params.baselineWeeks,
			params.zThreshold,
			params.confirmDays,
			SOURCE,
		],
	);

	const criterion = await query<{ rate: number }>(
		`SELECT count(*) FILTER (WHERE detected AND delay_days <= $2)::float / count(*) AS rate
		   FROM changepoint_eval
		  WHERE model = $1`,
		[fixture.model, CHANGEPOINT_MAX_DELAY_DAYS],
	);
	const report = {
		model: fixture.model,
		source: SOURCE,
		fixture: { path: "bench/changepoints/serie-460j.json", start: fixture.start, days: fixture.days, seed: fixture.seed },
		parameters: params,
		metrics,
		criterion: { sql: "count(*) FILTER (WHERE detected AND delay_days<=7)::float/count(*)", rate: criterion.rows[0]?.rate ?? 0 },
		rows: backtest.rows,
		detections: backtest.detections,
	};
	writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);

	console.log(describeBacktest(backtest));
	console.log(`fixture/SQL : accord exact sur ${fixture.days} jours × ${Object.keys(fixture.families).length} familles`);
	console.log(`critère SQL : ${criterion.rows[0]?.rate}`);
	console.log(`rapport écrit : ${OUTPUT_PATH}`);
}

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ChangepointFixture;
try {
	await loadAndReadFixture(fixture);
	await writeMeasurement(fixture);
} finally {
	await query(`DROP SCHEMA IF EXISTS ${BENCH_SCHEMA} CASCADE`).catch(() => {});
	await closePools();
}
