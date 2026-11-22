/**
 * Reproducible audit of quarantine-hint precursors for the six-month
 * victim-forecast backtest.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-quarantine-precursors.mts \
 *     --as-of=2026-11-22 \
 *     --json=bench/results/quarantine-precursors-2026-11-22.json
 *
 * Read only. Queries select organisation ids, public names/domains, hints and
 * dates: no claim body, evidence URL or personal detail is read or emitted.
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
	attachQuarantineMentions,
	measureQuarantineSource,
	type OrganizationIdentity,
	type QuarantineMention,
} from "../apps/api/src/prediction/quarantine-precursors.js";

type VictimRow = { orgId: number; claimedAt: string };
type OrgRow = { orgId: number; name: string; domain: string | null; website: string | null };
type AliasRow = { orgId: number; alias: string };
type MentionRow = { hint: string; receivedAt: string };

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

	const { rows: orgRows } = await query<OrgRow>(
		`SELECT id AS "orgId", name, domain, website
		   FROM org WHERE dept = ANY($1::text[]) AND name IS NOT NULL`,
		[NA_DEPARTMENTS],
	);
	const { rows: aliasRows } = await query<AliasRow>(
		`SELECT oa.org_id AS "orgId", oa.alias
		   FROM org_alias oa
		   JOIN org o ON o.id = oa.org_id
		  WHERE o.dept = ANY($1::text[]) AND oa.alias IS NOT NULL
		    AND oa.rejected_at IS NULL`,
		[NA_DEPARTMENTS],
	);
	const aliases = new Map<number, string[]>();
	for (const row of aliasRows) {
		const list = aliases.get(row.orgId) ?? [];
		list.push(row.alias);
		aliases.set(row.orgId, list);
	}
	const organizations: OrganizationIdentity[] = orgRows.map((row) => ({
		...row,
		aliases: aliases.get(row.orgId) ?? [],
	}));

	const { rows: mentionRows } = await query<MentionRow>(
		`SELECT org_hint AS hint,
		        to_char(received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "receivedAt"
		   FROM quarantine_raw
		  WHERE org_hint IS NOT NULL AND received_at IS NOT NULL`,
	);
	const attachment = attachQuarantineMentions(
		mentionRows as readonly QuarantineMention[],
		organizations,
	);
	const coverage: SourceCoverage = measureQuarantineSource(victims, attachment.attachments);
	const summary = summariseCoverage([coverage]);

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
		mentions: {
			read: mentionRows.length,
			attached: attachment.attachments.length,
			ambiguous: attachment.ambiguous,
			unmatched: attachment.unmatched,
		},
		perSource: summary.perSource,
		caveat:
			"Quarantine hints are attached by exact domain root or exact normalised organisation name; ambiguous keys are never attached. The observation day is strictly before the victim's own claim.",
	};

	console.log(`Quarantine precursors — ${cutoffs.length} windows ${windowStart} → ${windowEnd}`);
	console.log(`Victims: ${summary.victims} NA organisations x ${summary.sources} source = ${summary.pairs} pairs`);
	console.log(
		`  quarantine_raw ${mentionRows.length} hints, ${attachment.attachments.length} attached, ${attachment.ambiguous} ambiguous, ${attachment.unmatched} unmatched`,
	);
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
