/**
 * Reproducible twelve-month measurement of the claim/recruitment hypothesis.
 * Read-only replay on the real database plus the versioned public job dataset.
 * Output contains aggregate counts only: never a victim name, title or url.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-recruitment-claim.mts \
 *     --json=bench/results/recruitment-claim-12m-2026-11-22.json --check
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { NA_DEPARTMENTS } from "../apps/api/src/filiation/siret.js";
import {
	analyseRecruitmentClaims,
	type ClaimRecord,
	type RecruitmentOffer,
} from "../apps/api/src/analyse/recruitment-claim.js";

const argv = process.argv.slice(2);
const option = (name: string): string | null =>
	argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const OUTPUT = option("json") ?? "-";
const CHECK = argv.includes("--check");
const DATA_PATH = fileURLToPath(new URL("../bench/corpus/rssi-recruitment-na.json", import.meta.url));

type ClaimRow = {
	id: string; org: string | null; org_name: string | null; at: string; kind: string; isNa: boolean;
};
type BaseRow = { organisations: number; sources: number; events: number; naOrganisations: number };

async function main(): Promise<void> {
	const departments = Object.keys(NA_DEPARTMENTS);
	const dataset = JSON.parse(readFileSync(DATA_PATH, "utf8")) as {
		meta: { collectedAt: string; source: { name: string; url: string; id: string; cost: string } };
		offers: RecruitmentOffer[];
	};
	const [claimsResult, baseResult, latestResult] = await Promise.all([
		query<ClaimRow>(
			`SELECT e.id::text AS id, e.org_id::text AS org, coalesce(o.name, '') AS org_name,
			        e.observed_at::text AS at, e.assertion_type AS kind,
			        (o.dept = ANY($1::text[]) OR e.regional) AS "isNa"
			   FROM event e LEFT JOIN org o ON o.id = e.org_id
			  WHERE e.assertion_type = 'third_party_claim'
			    AND (o.dept = ANY($1::text[]) OR e.regional)
			    AND (e.tlp IS NULL OR e.tlp NOT IN ('TLP:RED', 'RED'))
			    AND e.observed_at >= now() - interval '13 months'`,
			[departments],
		),
		query<BaseRow>(
			`SELECT (SELECT count(*)::int FROM org) AS organisations,
			        (SELECT count(*)::int FROM source) AS sources,
			        (SELECT count(*)::int FROM event) AS events,
			        (SELECT count(*)::int FROM org WHERE dept = ANY($1::text[])) AS "naOrganisations"`,
			[departments],
		),
		query<{ at: string }>(
			`SELECT max(e.observed_at)::text AS at
			   FROM event e LEFT JOIN org o ON o.id = e.org_id
			  WHERE o.dept = ANY($1::text[]) OR e.regional`,
			[departments],
		),
	]);

	const asOf = latestResult.rows[0]?.at;
	if (!asOf || !Number.isFinite(Date.parse(asOf))) throw new Error("no Nouvelle-Aquitaine event found");
	const claims: ClaimRecord[] = claimsResult.rows
		.filter((r) => r.org !== null && r.org !== "")
		.map((r) => ({
			id: r.id, orgId: r.org!, orgName: r.org_name ?? "", kind: r.kind, at: r.at, isNa: r.isNa,
		}));
	const base = baseResult.rows[0];
	if (!base) throw new Error("baseline query returned no row");

	const result = analyseRecruitmentClaims({
		asOf,
		claims,
		offers: dataset.offers,
		population: base.naOrganisations,
	});
	const fingerprint = createHash("sha256")
		.update(JSON.stringify({
			window: result.window,
			counts: result.counts,
			table: result.table,
			monthly: result.monthly,
			statistics: result.statistics,
		}))
		.digest("hex")
		.slice(0, 16);
	const checks = {
		...result.checks,
		hasClaims: result.counts.claims > 0,
		hasRecruitmentOffers: result.counts.recruitmentOffers > 0,
		baseMatchesRealState: base.organisations > 1_000_000 && base.sources > 0 && base.events > 0,
	};
	const report = {
		objective: "test whether RSSI recruitment precedes third-party claims over twelve months in Nouvelle-Aquitaine",
		command: `DATABASE_URL=$DATABASE_URL apps/api/node_modules/.bin/tsx scripts/measure-recruitment-claim.mts --json=${OUTPUT} --check`,
		base: {
			organisations: base.organisations,
			sources: base.sources,
			events: base.events,
			naOrganisations: base.naOrganisations,
		},
		dataset: {
			path: "bench/corpus/rssi-recruitment-na.json",
			collectedAt: dataset.meta.collectedAt,
			source: dataset.meta.source,
			offersInDataset: dataset.offers.length,
		},
		asOf,
		window: result.window,
		counts: result.counts,
		table: result.table,
		statistics: result.statistics,
		monthly: result.monthly,
		checks,
		fingerprint,
	};

	if (OUTPUT !== "-") writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
	console.log(JSON.stringify({
		base: report.base,
		window: { from: result.window[0], to: result.window.at(-1), months: result.window.length },
		counts: result.counts,
		table: result.table,
		statistics: result.statistics,
		checks,
		fingerprint,
	}, null, 2));
	if (CHECK && Object.values(checks).some((ok) => !ok)) {
		console.error("recruitment-claim: objective not met", checks);
		process.exitCode = 1;
	}
}

if (import.meta.main) {
	main()
		.catch((err: unknown) => {
			console.error(err);
			process.exitCode = 1;
		})
		.finally(() => {
			void closePools();
		});
}
