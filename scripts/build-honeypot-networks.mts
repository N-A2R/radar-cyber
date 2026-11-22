/**
 * Build the offline provenance snapshot used by the honeypot classifier.
 *
 * Two free, public grey lists already referenced in the source catalogue:
 * the Tor bulk exit list and FireHOL's one-day AbuseIPDB aggregate. A bounded,
 * evenly spaced sample keeps the fixture small and the measurement offline.
 * No key, no paid service, no victim data.
 *
 * Usage: pnpm honeypot:networks
 */
import { writeFile } from "node:fs/promises";
import { isIPv4 } from "../apps/api/src/honeypot/model.js";

const LIMIT = Number(process.env.RADAR_HONEYPOT_NETWORK_LIMIT ?? 400);
const OUT = process.env.RADAR_HONEYPOT_NETWORKS_OUTPUT ?? "bench/fixtures/honeypot-networks.json";
const TOR_URL = "https://check.torproject.org/torbulkexitlist";
const ABUSE_URL = "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/abuseipdb_1d.ipset";

async function fetchLines(url: string): Promise<string[]> {
	const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	return (await response.text()).split(/\r?\n/);
}

function sampleIps(lines: string[]): string[] {
	const addresses = lines.map((line) => line.trim()).filter((line) => isIPv4(line));
	const step = Math.max(1, Math.floor(addresses.length / LIMIT));
	const sample: string[] = [];
	for (let i = 0; i < addresses.length && sample.length < LIMIT; i += step) {
		sample.push(addresses[i] as string);
	}
	return sample;
}

const [torLines, abuseLines] = await Promise.all([fetchLines(TOR_URL), fetchLines(ABUSE_URL)]);
const dataset = {
	generatedAt: new Date().toISOString().slice(0, 10),
	sources: [
		{ label: "tor-exit", url: TOR_URL, addresses: sampleIps(torLines) },
		{ label: "abuse-reported", url: ABUSE_URL, addresses: sampleIps(abuseLines) },
	],
};

await writeFile(OUT, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
console.log(
	`honeypot networks: ${dataset.sources.map((s) => `${s.label}=${s.addresses.length}`).join(", ")} -> ${OUT}`,
);
