/**
 * Collect one bounded round of real HTTP observations for the NA public-service
 * perimeter. Network access is confined to this script; the measurement replay
 * only reads the committed observations file.
 *
 *   apps/api/node_modules/.bin/tsx scripts/collect-service-availability.mts \
 *     --anchor=2026-11-22 --seed-corpus
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readCorpusPerimeter } from "../apps/api/src/serviceAvailability/perimeter.js";
import { mergeDaily, parseObservations, serializeObservations } from "../apps/api/src/serviceAvailability/observations.js";
import { probeCampaign, type DailyObservation } from "../apps/api/src/serviceAvailability/probe.js";

const CORPUS = "bench/corpus/institutions-complet.jsonl";
function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function seedFromCorpus(corpusPath: string, perimeterIds: Set<string>): DailyObservation[] {
	const rows: DailyObservation[] = [];
	for (const line of readFileSync(corpusPath, "utf8").split(/\r?\n/)) {
		if (line.trim().length === 0) continue;
		const raw = JSON.parse(line) as {
			id?: string;
			preuve?: { http_status?: number; verifie_le?: string };
		};
		if (!raw.id || !perimeterIds.has(raw.id) || raw.preuve?.http_status !== 200) continue;
		const day = raw.preuve.verifie_le ?? "";
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
		rows.push({
			serviceId: raw.id,
			day,
			ok: true,
			status: 200,
			latencyMs: 0,
			observedAt: `${day}T12:00:00.000Z`,
			failure: null,
		});
	}
	return rows;
}

async function main(): Promise<void> {
	const anchor = option("anchor", new Date().toISOString().slice(0, 10));
	const out = resolve(option("out", "bench/results/service-availability-observations.jsonl"));
	const corpusPath = resolve(CORPUS);
	const perimeter = readCorpusPerimeter(corpusPath);
	const existing = existsSync(out) ? parseObservations(readFileSync(out, "utf8")) : [];
	const seeded = process.argv.includes("--seed-corpus")
		? seedFromCorpus(corpusPath, new Set(perimeter.map((service) => service.id)))
		: [];
	const campaign = await probeCampaign(perimeter, {
		timeoutMs: Number(option("timeout-ms", "6000")),
		deadlineMs: Number(option("deadline-ms", "45000")),
		concurrency: Number(option("concurrency", "50")),
		retries: Number(option("retries", "1")),
	});
	const observations = mergeDaily([...existing, ...seeded, ...campaign.observations]);
	writeFileSync(out, serializeObservations(observations), "utf8");
	const probed = mergeDaily(campaign.observations);
	const available = probed.filter((row) => row.ok).length;
	const failed = probed.length - available;
	const missing = campaign.missingServiceIds;
	const reportDay = probed[0]?.day ?? new Date().toISOString().slice(0, 10);
	const reportPath = resolve(option("report", `bench/results/service-availability-probes-${reportDay}.json`));
	writeFileSync(reportPath, `${JSON.stringify({
		anchor,
		day: reportDay,
		perimeterSize: perimeter.length,
		probed: probed.length,
		available,
		failed,
		missingServiceIds: missing,
	}, null, 2)}\n`, "utf8");
	console.log(
		`perimeter=${perimeter.length} probed=${probed.length} available=${available} ` +
		`failed=${failed} missing=${missing.length} total_stored=${observations.length}`
	);
	if (missing.length > 0) console.log(`missing_service_ids=${missing.join(",")}`);
	console.log(`report=${reportPath}`);
}

await main();
