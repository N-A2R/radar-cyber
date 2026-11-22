#!/usr/bin/env -S npx tsx
/**
 * Measure the next-campaign forecast on the live Nouvelle-Aquitaine history.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-campaign-forecast.mts
 *
 * Read-only. The query selects only group, date and sector labels: no victim
 * name, organisation identifier or free-text field leaves the database.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	buildForecastReport,
	type Claim,
	type DatasetCounts,
} from "../apps/api/src/analyse/campaign-forecast.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";
const { closePools, query } = await import("../apps/api/src/db.js");

type ClaimRow = {
	group_name: string;
	published_at: Date | string;
	claim_sector: string | null;
	org_sector_group: string | null;
};

type CountRow = {
	organizations: number | string;
	sources: number | string;
	events: number | string;
	claims: number | string;
	na_claims: number | string;
};

const OUTPUT = fileURLToPath(new URL("../bench/results/campaign-forecast.json", import.meta.url));

async function main(): Promise<void> {
	const { rows:claimRows } = await query<ClaimRow>(
		`SELECT l.group_name, l.published_at::date::text AS published_at,
		        l.sector AS claim_sector, o.secteur_groupe AS org_sector_group
		   FROM leak_claim l
		   LEFT JOIN org o ON o.id = l.org_id
		  WHERE l.na AND l.published_at IS NOT NULL
		  ORDER BY l.group_name, l.published_at`,
	);
	const { rows:countRows } = await query<CountRow>(
		`SELECT (SELECT count(*) FROM org) AS organizations,
		        (SELECT count(*) FROM source) AS sources,
		        (SELECT count(*) FROM event) AS events,
		        (SELECT count(*) FROM leak_claim) AS claims,
		        (SELECT count(*) FROM leak_claim WHERE na) AS na_claims`,
	);
	const counts = countRows[0];
	if (!counts) throw new Error("dataset counts: no row returned");

	const claims: Claim[] = claimRows.map((row) => ({
		group: row.group_name,
		publishedAt: row.published_at instanceof Date
			? row.published_at.toISOString().slice(0, 10)
			: row.published_at,
		claimSector: row.claim_sector,
		orgSectorGroup: row.org_sector_group,
	}));
	const dataset: DatasetCounts = {
		organizations: Number(counts.organizations),
		sources: Number(counts.sources),
		events: Number(counts.events),
		claims: Number(counts.claims),
		naClaims: Number(counts.na_claims),
	};
	const report = buildForecastReport(claims, dataset);
	mkdirSync(new URL("../bench/results/", import.meta.url), { recursive: true });
	writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");

	for (const group of report.groups) {
		console.log(
			`${group.group}\t${group.sector ?? "unknown"}\t${group.period.start}..${group.period.end}` +
				`\t${group.claims} claims / ${group.campaigns} campaigns`,
		);
	}
	console.log(
		`active groups: ${report.activeGroups}/${5}; backtest: ` +
			`${report.backtest.sectorHits}/${report.backtest.folds} sector hits, ` +
			`${report.backtest.periodHits}/${report.backtest.folds} period hits, ` +
			`median error ${report.backtest.medianErrorDays} days`,
	);
	console.log(`written: ${OUTPUT}`);
}

main()
	.catch(async (error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await closePools();
	});
