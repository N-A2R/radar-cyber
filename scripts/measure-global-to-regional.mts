#!/usr/bin/env -S npx tsx
/**
 * Reproducible measurement of the delay between a worldwide campaign and its
 * first observation in Nouvelle-Aquitaine.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/measure-global-to-regional.mts \
 *     --campaigns=10 --json=bench/results/global-to-regional.json
 *
 * The script is read-only: no table is created, no row is changed. It projects
 * event id, observation time, source id and the regional flag only.
 */
import { writeFileSync } from "node:fs";
import { closePools } from "../apps/api/src/db.js";
import {
	computePropagation,
	selectPastCampaigns,
	summarizePropagations,
} from "../apps/api/src/early-warning/global-to-regional.js";
import { fetchCampaignTimelines, GLOBAL_TO_REGIONAL_QUERY } from "../apps/api/src/early-warning/store.js";

const argv = process.argv.slice(2);
const JSON_PATH = argv.find((a) => a.startsWith("--json="))?.slice("--json=".length) ?? null;
const LIMIT = Number(argv.find((a) => a.startsWith("--campaigns="))?.slice("--campaigns=".length) ?? 10);
if (!Number.isInteger(LIMIT) || LIMIT < 1) throw new Error("--campaigns must be a positive integer");

async function main(): Promise<void> {
	const timelines = await fetchCampaignTimelines();
	const measured = timelines.map(computePropagation).filter((item) => item !== null);
	const selected = selectPastCampaigns(measured, LIMIT);
	if (selected.length < LIMIT) {
		throw new Error(`only ${selected.length} past campaigns with a dated NA observation; expected ${LIMIT}`);
	}
	const summary = summarizePropagations(selected);
	const payload = {
		scope: "Nouvelle-Aquitaine (12 departments)",
		definition:
			"Hours from the first worldwide observation of a campaign to its first observation flagged as Nouvelle-Aquitaine",
		detectionRule: "a campaign is identifiable at its second incident (analyse/campagnes.ts)",
		privacy: "event id, observation time, source id and regional flag only; no victim data",
		source: "public and grey publicly reachable campaign sources already ingested in the radar",
		measuredAt: new Date().toISOString(),
		campaigns: selected.length,
		medianPropagationHours: summary.medianPropagationHours,
		medianPropagationDays: Math.round((summary.medianPropagationHours / 24) * 100) / 100,
		medianWarningLeadHours: summary.medianWarningLeadHours,
		minPropagationHours: summary.minPropagationHours,
		maxPropagationHours: summary.maxPropagationHours,
		selectedCampaigns: selected,
		sql: GLOBAL_TO_REGIONAL_QUERY,
	};

	console.log(`campaigns measured: ${selected.length}`);
	console.log(`median global -> NA delay: ${payload.medianPropagationHours} h (${payload.medianPropagationDays} d)`);
	console.log(`median warning lead at detection: ${payload.medianWarningLeadHours} h`);
	for (const campaign of selected) {
		console.log(
			`${campaign.label}: ${campaign.propagationHours} h (lead ${campaign.warningLeadHours} h, ${campaign.regionalIncidentCount} NA incidents)`,
		);
	}
	if (JSON_PATH) {
		writeFileSync(JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
		console.log(`written: ${JSON_PATH}`);
	}
}

try {
	await main();
} finally {
	await closePools();
}
