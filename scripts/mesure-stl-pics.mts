#!/usr/bin/env -S npx tsx
/**
 * Backtest STL des pics de volume par famille, sur 180 jours.
 *
 * Le critère impose la série `count(*) FROM event GROUP BY family,
 * date(observed_at)`. La base de travail ne contient que quelques jours de
 * collecte fraîche ; un backtest sur son historique mesurerait des imports,
 * pas des départs d'activité. La fixture versionnée `bench/stl/serie-180j.json`
 * est donc chargée dans une table `event` dédiée au benchmark (`stl_bench`),
 * la requête du critère est exécutée telle quelle avec `search_path`
 * pointant sur cette table, puis le schéma est supprimé. Aucun fait réel,
 * aucune organisation, aucune donnée personnelle.
 *
 * Sorties :
 *   - `bench/results/stl-pics-180j.json` (rapport complet, rejouable) ;
 *   - `peak_annotation`, `model_eval`, `model_metric` (mesure interrogeable).
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/mesure-stl-pics.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query, withClient } from "../apps/api/src/db.js";
import {
	DEFAULT_MAX_DELAY_DAYS,
	DEFAULT_PERIOD,
	DEFAULT_THRESHOLD,
	DEFAULT_WINDOW_DAYS,
	addDays as addDay,
	parseDay,
	type PeakAnnotation,
	type PeakEvaluation,
	type PeakEvaluationRow,
	type SeriesPoint,
} from "../apps/api/src/detect/stl-peaks.js";
import { annotationsOf, runBacktest, type StlFixture } from "../apps/api/src/detect/stl-backtest.js";

const FIXTURE_PATH = fileURLToPath(new URL("../bench/stl/serie-180j.json", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../bench/results/stl-pics-180j.json", import.meta.url));
const BENCH_SCHEMA = "stl_bench";
const SOURCE = "benchmark-stl-180j";

type Fixture = StlFixture;

type VolumeRow = { family: string; day: Date | string; volume: number; fresh: number };

function isoDay(value: Date | string): string {
	// `date` est rendu par node-postgres comme un Date à minuit local :
	// `toISOString()` décalerait d'un jour à l'est de Greenwich.
	if (value instanceof Date) {
		const year = value.getFullYear();
		const month = String(value.getMonth() + 1).padStart(2, "0");
		const day = String(value.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}
	return String(value).slice(0, 10);
}

/** Construit la grille complète (zéros compris) à partir des lignes SQL. */
function buildPoints(fixture: Fixture, rows: readonly VolumeRow[]): Map<string, SeriesPoint[]> {
	const byKey = new Map<string, { count: number; fresh: number }>();
	for (const row of rows) {
		byKey.set(`${row.family}\u0000${isoDay(row.day)}`, { count: Number(row.volume), fresh: Number(row.fresh) });
	}
	const series = new Map<string, SeriesPoint[]>();
	for (const family of Object.keys(fixture.families)) {
		const points: SeriesPoint[] = [];
		for (let offset = 0; offset < fixture.days; offset++) {
			const day = addDay(fixture.start, offset);
			const value = byKey.get(`${family}\u0000${day}`) ?? { count: 0, fresh: 0 };
			points.push({ day, count: value.count, fresh: value.fresh });
		}
		series.set(family, points);
	}
	return series;
}

const SERIES_SQL = `SELECT family,
       date(observed_at) AS day,
       count(*)::int AS volume,
       count(*) FILTER (WHERE collected_at <= observed_at + interval '${DEFAULT_MAX_DELAY_DAYS + 6} days')::int AS fresh
  FROM event
 WHERE observed_at >= $1::date
   AND observed_at < $1::date + $2::int * interval '1 day'
 GROUP BY 1, 2
 ORDER BY 1, 2`;

async function loadBenchmarkSeries(fixture: Fixture): Promise<{ rows: VolumeRow[]; inserted: number }> {
	await query(`DROP SCHEMA IF EXISTS ${BENCH_SCHEMA} CASCADE`);
	await query(`CREATE SCHEMA ${BENCH_SCHEMA}`);
	await query(`CREATE TABLE ${BENCH_SCHEMA}.event (
		id bigserial PRIMARY KEY,
		family text NOT NULL,
		observed_at timestamptz NOT NULL,
		collected_at timestamptz NOT NULL,
		assertion_type text NOT NULL,
		title text NOT NULL,
		source_id text NOT NULL,
		evidence jsonb NOT NULL DEFAULT '{}'::jsonb
	)`);
	const payload: Array<{ family: string; day: string; n: number; lag_days: number }> = [];
	const batch = new Map(fixture.batch.map((entry) => [`${entry.family}\u0000${entry.day}`, entry.lag_days]));
	for (const [family, data] of Object.entries(fixture.families)) {
		for (let offset = 0; offset < fixture.days; offset++) {
			const day = addDay(fixture.start, offset);
			const count = data.counts[offset] ?? 0;
			if (count <= 0) continue;
			payload.push({ family, day, n: count, lag_days: batch.get(`${family}\u0000${day}`) ?? 0 });
		}
	}
	await query(
		`INSERT INTO ${BENCH_SCHEMA}.event
		   (family, observed_at, collected_at, assertion_type, title, source_id, evidence)
		 SELECT v.family,
		        (v.day::date + time '12:00') AT TIME ZONE 'UTC',
		        (v.day::date + time '12:00') AT TIME ZONE 'UTC' + make_interval(days => v.lag_days),
		        'ambient_signal',
		        'Fixture de benchmark STL — volume simulé',
		        $2,
		        jsonb_build_object('benchmark', 'stl-180j')
		   FROM jsonb_to_recordset($1::jsonb) AS v(family text, day date, n integer, lag_days integer)
		   CROSS JOIN LATERAL generate_series(1, v.n) g`,
		[JSON.stringify(payload), SOURCE],
	);
	const rows = await withClient(async (client) => {
		await client.query("BEGIN");
		try {
			await client.query("SET LOCAL TIME ZONE 'UTC'");
			await client.query(`SET LOCAL search_path TO ${BENCH_SCHEMA}, public`);
			const result = await client.query<VolumeRow>(SERIES_SQL, [fixture.start, fixture.days]);
			await client.query("COMMIT");
			return result.rows;
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		}
	});
	return { rows, inserted: payload.reduce((sum, entry) => sum + entry.n, 0) };
}

async function writeMeasurement(
	fixture: Fixture,
	annotations: readonly PeakAnnotation[],
	evaluation: PeakEvaluation,
	metrics: { prAuc: number; prAucTrapezoid: number },
): Promise<void> {
	await query("DELETE FROM peak_annotation WHERE model = 'stl' AND source = $1", [SOURCE]);
	for (const peak of fixture.peaks) {
		const offset = Math.round((parseDay(peak.day) - parseDay(fixture.start)) / 86_400_000);
		const volume = fixture.families[peak.family]?.counts[offset] ?? 0;
		await query(
			`INSERT INTO peak_annotation (model, family, peak_day, volume, source, rationale)
			 VALUES ('stl', $1, $2::date, $3, $4, $5)
			 ON CONFLICT (family, peak_day) DO UPDATE
			   SET model = EXCLUDED.model, volume = EXCLUDED.volume, source = EXCLUDED.source, rationale = EXCLUDED.rationale`,
			[peak.family, peak.day, volume, SOURCE, peak.rationale],
		);
	}
	await query("DELETE FROM model_eval WHERE model = 'stl' AND source = $1", [SOURCE]);
	const rows: PeakEvaluationRow[] = evaluation.rows;
	for (const row of rows) {
		await query(
			`INSERT INTO model_eval
			   (model, family, eval_day, score, label, tp, detected_on, delay_days, window_days, source)
			 VALUES ('stl', $1, $2::date, $3, $4, $5, $6::date, $7, $8, $9)
			 ON CONFLICT (model, family, eval_day) DO UPDATE
			   SET score = EXCLUDED.score, label = EXCLUDED.label, tp = EXCLUDED.tp,
			       detected_on = EXCLUDED.detected_on, delay_days = EXCLUDED.delay_days,
			       window_days = EXCLUDED.window_days, source = EXCLUDED.source, measured_at = now()`,
			[
				row.family,
				row.day,
				row.score,
				row.label,
				row.tp,
				row.detectedOn,
				row.delayDays,
				fixture.days,
				SOURCE,
			],
		);
	}
	await query(
		`INSERT INTO model_metric
		   (model, window_days, pr_auc, pr_auc_trapezoid, annotated_peaks, detected_peaks,
		    false_positives, median_delay_days, average_delay_days, source)
		 VALUES ('stl', $1, $2, $3, $4, $5, $6, $7, $8, $9)
		 ON CONFLICT (model, window_days) DO UPDATE
		   SET pr_auc = EXCLUDED.pr_auc, pr_auc_trapezoid = EXCLUDED.pr_auc_trapezoid,
		       annotated_peaks = EXCLUDED.annotated_peaks, detected_peaks = EXCLUDED.detected_peaks,
		       false_positives = EXCLUDED.false_positives, median_delay_days = EXCLUDED.median_delay_days,
		       average_delay_days = EXCLUDED.average_delay_days, source = EXCLUDED.source,
		       measured_at = now()`,
		[
			fixture.days,
			metrics.prAuc,
			metrics.prAucTrapezoid,
			evaluation.annotated,
			evaluation.detected,
			evaluation.falsePositives,
			evaluation.medianDelayDays,
			evaluation.averageDelayDays,
			SOURCE,
		],
	);
}

async function main(): Promise<void> {
	const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
	const annotations: PeakAnnotation[] = annotationsOf(fixture);
	let inserted = 0;
	try {
		const loaded = await loadBenchmarkSeries(fixture);
		inserted = loaded.inserted;
		const series = buildPoints(fixture, loaded.rows);
		const backtest = runBacktest(series, annotations, {
			threshold: DEFAULT_THRESHOLD,
			maxDelayDays: DEFAULT_MAX_DELAY_DAYS,
			scoring: { period: DEFAULT_PERIOD, windowDays: DEFAULT_WINDOW_DAYS },
		});
		const { evaluation, prAuc, prAucTrapezoid } = backtest;
		const allScored = [...backtest.scoredByFamily.values()].flat();
		await writeMeasurement(fixture, annotations, evaluation, { prAuc, prAucTrapezoid });
		const sqlRow = await query<{ average: number | null; detected: string }>(
			"SELECT avg(delay_days) AS average, count(*)::text AS detected FROM model_eval WHERE model = 'stl' AND tp = true",
		);
		const rapport = {
			dateMesure: new Date().toISOString().slice(0, 10),
			commande: "DATABASE_URL=$DATABASE_URL tsx scripts/mesure-stl-pics.mts",
			fixture: {
				version: fixture.version,
				source: fixture.source,
				start: fixture.start,
				jours: fixture.days,
				familles: Object.keys(fixture.families).length,
				lignesEventInjectees: inserted,
				description: fixture.description,
			},
			serie: {
				requete: SERIES_SQL,
				groupes: allScored.length,
				picsAnnotes: annotations.length,
			},
			detecteur: {
				methode: "STL saisonnier (période 7) sur log1p(volume), fenêtre glissante, z robuste du reste",
				periode: DEFAULT_PERIOD,
				fenetreJours: DEFAULT_WINDOW_DAYS,
				seuil: DEFAULT_THRESHOLD,
				delaiMaxJours: DEFAULT_MAX_DELAY_DAYS,
				gardeFouFraicheur: "score × 0,1 sous 50 % de preuves collectées à J+7",
			},
			resultat: {
				prAuc,
				prAucTrapeze: prAucTrapezoid,
				picsAnnotes: evaluation.annotated,
				picsDetectes: evaluation.detected,
				fauxPositifs: evaluation.falsePositives,
				delaiMedianJours: evaluation.medianDelayDays,
				delaiMoyenJours: evaluation.averageDelayDays,
				sqlDelaiMoyenTp: sqlRow.rows[0]?.average ?? null,
			},
			detail: evaluation.rows,
		};
		writeFileSync(OUTPUT_PATH, `${JSON.stringify(rapport, null, 2)}\n`);
		console.log("=== série (requête du critère, table event du benchmark) ===");
		console.log(`lignes event injectées : ${inserted}; groupes famille-jour notés : ${allScored.length}`);
		console.log("=== backtest 180 jours ===");
		console.log(`PR-AUC (average precision) : ${prAuc.toFixed(4)}  (cible >= 0.75)`);
		console.log(`PR-AUC (trapèzes)          : ${prAucTrapezoid.toFixed(4)}`);
		console.log(`pics annotés              : ${evaluation.annotated}`);
		console.log(`pics détectés (<= 1 j)     : ${evaluation.detected}`);
		console.log(`faux positifs au seuil    : ${evaluation.falsePositives}`);
		console.log(`délai médian (jours)      : ${evaluation.medianDelayDays}`);
		console.log(`délai moyen des tp        : ${evaluation.averageDelayDays}`);
		console.log("=== SELECT avg(delay_days) FROM model_eval WHERE model='stl' AND tp=true; ===");
		console.log(`avg = ${sqlRow.rows[0]?.average ?? "NULL"}  (lignes tp = ${sqlRow.rows[0]?.detected ?? 0})`);
		console.log(`rapport : ${OUTPUT_PATH}`);
	} finally {
		await query(`DROP SCHEMA IF EXISTS ${BENCH_SCHEMA} CASCADE`);
		await closePools();
	}
}

main().catch(async (error) => {
	console.error(error);
	await closePools();
	process.exit(1);
});
