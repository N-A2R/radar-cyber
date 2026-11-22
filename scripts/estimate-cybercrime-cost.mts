/**
 * Reproducible annual cost estimate for cybercrime in Nouvelle-Aquitaine.
 *
 *   apps/api/node_modules/.bin/tsx scripts/estimate-cybercrime-cost.mts \
 *     --json=bench/results/cybercrime-cost-na-2026-11-22.json --check
 *
 * Read-only on PostgreSQL. No network, no paid service, no victim personal
 * data. The figure and its 95% bootstrap interval are printed on stdout and
 * optionally written as a versioned JSON result.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
	NA_DEPARTMENTS,
	WINDOW,
	awardedAmounts,
	bootstrapEstimate,
	checkBaseline,
	detectionSample,
	incidentsInWindow,
	median,
	publishedAmounts,
	type Baseline,
	type CostNotice,
	type CoverageIncident,
} from "../apps/api/src/cost/cybercrime-cost.js";

process.env.DATABASE_URL ??= "postgres://radar:radar@localhost:5433/radar";

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const JSON_ARG = argv.find((arg) => arg.startsWith("--json="))?.split("=")[1] ?? null;
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const COVERAGE_FILE = `${ROOT}bench/results/couverture-2026-11-21.json`;
const CONTRACTS_FILE = `${ROOT}bench/fixtures/cyber-cost-anchors.json`;
const COMMAND = "apps/api/node_modules/.bin/tsx scripts/estimate-cybercrime-cost.mts --json=bench/results/cybercrime-cost-na-2026-11-22.json --check";

const { query, closePools } = await import("../apps/api/src/db.js");

function readJson<T>(path: string): T {
	return JSON.parse(readFileSync(path, "utf8")) as T;
}

const coverage = readJson<{ incidents: CoverageIncident[] }>(COVERAGE_FILE);
const contracts = readJson<{ notices: CostNotice[] }>(CONTRACTS_FILE);
const rows = incidentsInWindow(coverage.incidents);
const sample = detectionSample(rows);
const model = bootstrapEstimate(rows, contracts.notices);
const awarded = awardedAmounts(contracts.notices);
const published = publishedAmounts(contracts.notices);

const result = await query<Record<string, string | number>>(
	`SELECT
		(SELECT count(*) FROM org) AS organizations,
		(SELECT count(*) FROM source) AS sources,
		(SELECT count(*) FROM event) AS events,
		(SELECT count(*) FROM org WHERE dept = ANY($1::text[])) AS na_organizations`,
	[[...NA_DEPARTMENTS]],
);
const raw = result.rows[0];
if (!raw) throw new Error("baseline query returned no row");
const baseline: Baseline = {
	organizations: Number(raw.organizations),
	sources: Number(raw.sources),
	events: Number(raw.events),
	naOrganizations: Number(raw.na_organizations),
};
const problems = checkBaseline(baseline);
if (CHECK && problems.length > 0) {
	throw new Error(`baseline drift: ${problems.join("; ")}`);
}

const output = {
	objective: "annual cost of cybercrime in Nouvelle-Aquitaine",
	command: COMMAND,
	window: WINDOW,
	baseline,
	baselineCheck: problems.length === 0,
	baselineProblems: problems,
	method: {
		incidentCount: "known incidents / measured radar recall (reference corpus)",
		unitCost: "median amount actually awarded for a cyber contract in Nouvelle-Aquitaine over the same window",
		interval: "percentile bootstrap over detection flags and awarded amounts",
		seed: model.seed,
		iterations: model.iterations,
		included: ["organisation-level events", "public contract amounts", "grey literature"],
		excluded: ["victim personal data", "ransom payments", "business interruption", "paid services"],
	},
	inputs: {
		knownIncidents: sample.total,
		matchedIncidents: sample.seen,
		detectionRate: sample.rate,
		awardedContracts: awarded.length,
		publishedAmountContracts: published.length,
		awardedAmountsEur: awarded,
	},
	estimate: {
		estimatedIncidentsPerYear: model.estimatedIncidents,
		unitCostEur: model.unitCostEur,
		annualCostEur: model.annualCostEur,
		ci95LowEur: model.ci95LowEur,
		ci95HighEur: model.ci95HighEur,
	},
	sensitivity: {
		withoutDetectionCorrectionEur: model.knownIncidents * model.unitCostEur,
		withBudgetCeilingEur: model.estimatedIncidents * median(published),
	},
	privacy: { victimPersonalData: false },
};



const text = JSON.stringify(output, null, 2);
console.log(text);
if (JSON_ARG) writeFileSync(JSON_ARG.startsWith("/") ? JSON_ARG : `${ROOT}${JSON_ARG}`, `${text}\n`, "utf8");
await closePools();
