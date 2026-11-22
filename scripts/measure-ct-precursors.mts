/**
 * Reproducible audit of certificate-transparency precursors for the six-month
 * victim-forecast backtest.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-ct-precursors.mts \
 *     --as-of=2026-11-22 --json=bench/results/ct-precursors-2026-11-22.json
 *
 * Read only. Every query selects an organisation id, a domain root or a date:
 * no victim name, claim description or certificate text is ever read.
 */
import { writeFileSync } from "node:fs";
import { closePools, query } from "../apps/api/src/db.js";
import { NA_DEPARTMENTS } from "../apps/api/src/geo/commune-index.js";
import {
	HORIZON_DAYS,
	addDays,
	walkForwardCutoffs,
} from "../apps/api/src/prediction/victim-forecast.js";
import {
	summariseCoverage,
	type SourceCoverage,
	type VictimRecord,
} from "../apps/api/src/prediction/precursor-coverage.js";
import {
	attachCtByDomain,
	measureCtSource,
	type CtObservation,
	type OrganizationDomain,
} from "../apps/api/src/prediction/ct-precursors.js";

type VictimRow = { orgId: number; claimedAt: string };
type ObservationRow = { domain: string; firstSeen: string };

const arg = (name: string): string | undefined =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
	const asOf = arg("as-of") ?? new Date().toISOString().slice(0, 10);
	const jsonPath = arg("json");
	if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(asOf))) {
		throw new Error(`Invalid --as-of date: ${asOf}`);
	}

	const cutoffs = walkForwardCutoffs(asOf);
	const windowStart = cutoffs[0]!;
	const windowEnd = addDays(cutoffs.at(-1)!, HORIZON_DAYS);

	const { rows: victimRows } = await query<VictimRow>(
		`SELECT c.org_id AS "orgId",
		        to_char(c.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "claimedAt"
		   FROM leak_claim c
		   JOIN org o ON o.id = c.org_id
		  WHERE c.na AND c.org_id IS NOT NULL AND o.dept = ANY($1::text[])
		    AND c.published_at >= $2::date AND c.published_at < $3::date`,
		[NA_DEPARTMENTS, windowStart, windowEnd],
	);
	const victims: VictimRecord[] = victimRows.map((row) => ({
		orgId: row.orgId,
		claimedAt: row.claimedAt,
	}));

	const { rows: orgRows } = await query<OrganizationDomain>(
		`SELECT id AS "orgId", domain, website FROM org WHERE dept = ANY($1::text[])`,
		[NA_DEPARTMENTS],
	);

	const sources = [
		{
			source: "ct_sous_domaine",
			sql: `SELECT sous_domaine AS domain,
			             to_char(premiere_vue AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "firstSeen"
			        FROM ct_sous_domaine`,
		},
		{
			source: "ct_certificat_suspect",
			sql: `SELECT domaine AS domain,
			             to_char(premiere_vue AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "firstSeen"
			        FROM ct_certificat_suspect`,
		},
	] as const;

	const coverage: SourceCoverage[] = [];
	const rows: Record<string, { read: number; attached: number; ambiguous: number; unmatched: number }> = {};
	for (const { source, sql } of sources) {
		const { rows: observations } = await query<ObservationRow>(sql);
		const attachment = attachCtByDomain(observations as readonly CtObservation[], orgRows);
		rows[source] = {
			read: observations.length,
			attached: attachment.attachments.length,
			ambiguous: attachment.ambiguousRoots,
			unmatched: attachment.unmatched,
		};
		coverage.push(measureCtSource(source, victims, attachment.attachments));
	}
	const summary = summariseCoverage(coverage);

	const result = {
		generatedAt: new Date().toISOString(),
		asOf,
		windowStart,
		windowEnd,
		windows: cutoffs.length,
		horizonDays: HORIZON_DAYS,
		victims: summary.victims,
		sources: summary.sources,
		pairs: summary.pairs,
		priorSignalPairs: summary.priorSignalPairs,
		victimsWithAnyPriorSignal: summary.victimsWithAnyPriorSignal,
		coverage: summary.coverage,
		attachments: rows,
		perSource: summary.perSource,
		caveat:
			"CT first-seen days strictly before the organisation's own claim; ambiguous domain roots are never attached.",
	};

	console.log(`CT precursors — ${cutoffs.length} windows ${windowStart} → ${windowEnd}`);
	console.log(`Victims: ${summary.victims} NA organisations x ${summary.sources} CT sources = ${summary.pairs} pairs`);
	for (const [source, stats] of Object.entries(rows)) {
		console.log(
			`  ${source.padEnd(22)} ${stats.read} rows, ${stats.attached} attached, ${stats.ambiguous} ambiguous, ${stats.unmatched} unmatched`,
		);
	}
	console.log(
		`Prior signals: ${summary.priorSignalPairs}/${summary.pairs} pairs, victims covered ${summary.victimsWithAnyPriorSignal}/${summary.victims} (${summary.coverage.toFixed(4)})`,
	);
	if (jsonPath) {
		writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
		console.log(`\nMeasurement written to ${jsonPath}`);
	}
	await closePools();
}

main().catch(async (error: unknown) => {
	console.error(error);
	await closePools().catch(() => {});
	process.exitCode = 1;
});
