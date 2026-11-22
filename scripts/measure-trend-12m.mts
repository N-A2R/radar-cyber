/**
 * Reproducible measurement of twelve-month trend series and their breaks.
 *
 * Read-only replay on the real database. Only Nouvelle-Aquitaine events are
 * read (organisation department or regional flag), TLP:RED is excluded, and
 * the output carries event ids and aggregate counts only — never a victim
 * name, title or url. No paid service, no network call, no clock in the
 * detector: `asOf` defaults to the newest observed event in the database.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-trend-12m.mts \
 *     --json=bench/results/trend-12m-2026-11-22.json --check
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { NA_DEPARTMENTS } from "../apps/api/src/filiation/siret.js";
import {
	analyseTrend,
	DEFAULT_BREAK_OPTIONS,
	TREND_AXES,
	TREND_MONTHS,
	type TrendEvent,
} from "../apps/api/src/analyse/trend-12m.js";

const argv = process.argv.slice(2);
const option = (name: string): string | null =>
	argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const OUTPUT = option("json") ?? "-";
const CHECK = argv.includes("--check");
const AS_OF_OPTION = option("asOf");
const DEPARTMENTS = Object.keys(NA_DEPARTMENTS);

type Row = {
	id: string;
	at: string;
	source: string;
	sector: string;
	org: string | null;
	isNa: boolean;
};

async function main(): Promise<void> {
	const [eventsResult, baseResult] = await Promise.all([
		query<Row>(
			`SELECT e.id::text AS id, coalesce(e.observed_at, e.collected_at)::text AS at,
			        e.source_id AS source,
			        coalesce(nullif(btrim(o.sector), ''), nullif(btrim(o.kind), ''), '') AS sector,
			        e.org_id::text AS org,
			        (o.dept = ANY($1::text[]) OR e.regional) AS "isNa"
			   FROM event e LEFT JOIN org o ON o.id = e.org_id
			  WHERE (o.dept = ANY($1::text[]) OR e.regional)
			    AND (e.tlp IS NULL OR e.tlp NOT IN ('TLP:RED', 'RED'))`,
			[DEPARTMENTS],
		),
		query<{ organisations: number; sources: number; events: number }>(
			`SELECT (SELECT count(*)::int FROM org) AS organisations,
			        (SELECT count(*)::int FROM source) AS sources,
			        (SELECT count(*)::int FROM event) AS events`,
		),
	]);

	const rows = eventsResult.rows;
	if (rows.length === 0) throw new Error("no Nouvelle-Aquitaine event found in the database");
	const instants = rows.map((r) => Date.parse(r.at)).filter(Number.isFinite);
	const asOf = AS_OF_OPTION ?? new Date(Math.max(...instants)).toISOString();
	if (!Number.isFinite(Date.parse(asOf))) throw new RangeError("asOf must be a valid date");
	const events: TrendEvent[] = rows.map((r) => ({
		id: r.id,
		at: r.at,
		source: r.source,
		sector: r.sector === "" ? null : r.sector,
		org: r.org,
	}));

	const { window, series, breaks } = analyseTrend(events, {
		asOf,
		months: TREND_MONTHS,
		axes: TREND_AXES,
	});
	const byAxis = Object.fromEntries(
		TREND_AXES.map((axis) => [
			axis,
			{
				series: series.filter((s) => s.axis === axis).length,
				breaks: breaks.filter((b) => b.axis === axis).length,
			},
		]),
	);
	const global = series.find((s) => s.axis === "all" && s.group === "all");
	const monthBuckets = series.reduce((sum, s) => sum + s.months.length, 0);
	const zeroBuckets = series.reduce((sum, s) => sum + s.months.filter((m) => m.count === 0).length, 0);
	const explained = breaks.filter((b) => b.eventIds.length > 0).length;
	const fingerprint = createHash("sha256")
		.update(JSON.stringify({
			asOf,
			series: series.map((s) => [s.axis, s.group, s.months.map((m) => m.count)]),
			breaks: breaks.map((b) => [b.axis, b.group, b.month, b.direction, b.z]),
		}))
		.digest("hex")
		.slice(0, 16);

	const checks = {
		naOnly: rows.every((r) => r.isNa),
		allSeriesHave12Months: series.every(
			(s) =>
				s.months.length === TREND_MONTHS &&
				s.months[0]?.month === window[0] &&
				s.months.at(-1)?.month === window.at(-1),
		),
		allSeriesHaveEvents: series.every((s) => s.total > 0),
		everyBreakHasEvidence: explained === breaks.length,
		atLeastOneBreak: breaks.length > 0,
	};
	const report = {
		objective: "twelve-month trend series and their breaks on real Nouvelle-Aquitaine events",
		command: `DATABASE_URL=$DATABASE_URL apps/api/node_modules/.bin/tsx scripts/measure-trend-12m.mts --json=${OUTPUT} --check`,
		window: { from: window[0], to: window.at(-1), months: window.length, asOf },
		base: {
			organisations: baseResult.rows[0]?.organisations ?? 0,
			sources: baseResult.rows[0]?.sources ?? 0,
			events: baseResult.rows[0]?.events ?? 0,
			naEvents: rows.length,
			naSources: new Set(rows.map((r) => r.source)).size,
			naOrganisations: new Set(rows.map((r) => r.org).filter((x): x is string => x !== null)).size,
		},
		settings: { months: TREND_MONTHS, axes: TREND_AXES, breakOptions: DEFAULT_BREAK_OPTIONS },
		series: {
			count: series.length,
			byAxis: byAxis,
			monthBuckets,
			emptyMonthBuckets: zeroBuckets,
			globalMonths: global?.months.map((m) => ({ month: m.month, events: m.count })) ?? [],
		},
		breaks: {
			count: breaks.length,
			byAxis: Object.fromEntries(TREND_AXES.map((axis) => [axis, breaks.filter((b) => b.axis === axis).length])),
			up: breaks.filter((b) => b.direction === "up").length,
			down: breaks.filter((b) => b.direction === "down").length,
			explained,
			details: breaks.map((b) => ({
				axis: b.axis,
				group: b.group,
				month: b.month,
				direction: b.direction,
				baseline: b.baseline,
				level: b.level,
				z: b.z,
				afterMonths: b.afterMonths,
				eventIds: b.eventIds,
				explanation: b.explanation,
			})),
		},
		checks,
		fingerprint,
	};

	if (OUTPUT !== "-") writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify({
		window: report.window,
		base: report.base,
		series: report.series,
		breaks: { count: report.breaks.count, byAxis: report.breaks.byAxis, up: report.breaks.up, down: report.breaks.down },
		checks,
		fingerprint,
	}, null, 2));

	if (CHECK && Object.values(checks).some((ok) => !ok)) {
		console.error("trend-12m: objective not met", checks);
		process.exitCode = 1;
	}
}

if (import.meta.main) {
	main()
		.catch((err) => {
			console.error(err);
			process.exitCode = 1;
		})
		.finally(() => {
			void closePools();
		});
}
