/**
 * Collects public RSSI/CISO job offers published in Nouvelle-Aquitaine and
 * writes a versioned, organisation-level dataset. Free public pages only, no
 * key, no personal data of victims, no candidate information.
 *
 *   apps/api/node_modules/.bin/tsx scripts/collect-rssi-recruitment.mts --check
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isRssiTitle } from "../apps/api/src/analyse/recruitment-claim.js";
import { NA_DEPARTMENTS } from "../apps/api/src/filiation/siret.js";
import { OFFER_SOURCE, parseOfferPage } from "../apps/api/src/collectors/france-travail-offers.js";
import type { RecruitmentOffer } from "../apps/api/src/analyse/recruitment-claim.js";

const OUTPUT = fileURLToPath(new URL("../bench/corpus/rssi-recruitment-na.json", import.meta.url));
const CHECK = process.argv.includes("--check");
const BASE = "https://candidat.francetravail.fr/offres/recherche/DATE_CREATION_DECROISSANTE";
const QUERIES = ["RSSI", "CISO", "responsable securite systemes information"];
const RANGES = ["0-99", "100-199"];

async function fetchPage(query: string, range: string): Promise<string> {
	const url = `${BASE}?${new URLSearchParams({ motsCles: query, lieux: "NA", range })}`;
	const response = await fetch(url, {
		signal: AbortSignal.timeout(15_000),
		headers: { "user-agent": "radar-cyber/1.0 (public OSINT measurement)" },
	});
	if (!response.ok) throw new Error(`job board returned ${response.status} for ${query}`);
	return response.text();
}

async function main(): Promise<void> {
	const collectedAt = new Date().toISOString();
	const byId = new Map<string, RecruitmentOffer>();
	for (const query of QUERIES) {
		for (const range of RANGES) {
			const html = await fetchPage(query, range);
			for (const offer of parseOfferPage(html, collectedAt, query)) {
				if (NA_DEPARTMENTS[offer.department] !== true) continue;
				if (!isRssiTitle(offer.title)) continue;
				if (!byId.has(offer.id)) byId.set(offer.id, offer);
			}
		}
	}
	const offers = [...byId.values()].sort((a, b) =>
		a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id),
	);
	const dataset = {
		meta: {
			title: "Public RSSI recruitment signals in Nouvelle-Aquitaine",
			collectedAt,
			source: {
				name: "France Travail public job search",
				url: "https://candidat.francetravail.fr/offres/recherche",
				id: OFFER_SOURCE,
				cost: "free",
			},
			method:
				"Six public search pages (three title queries, two date-sorted ranges). " +
				"Only offers located in a Nouvelle-Aquitaine department with a strict RSSI/CISO title are kept. " +
				"Publication day comes from the relative label shown on the page. " +
				"Organisation names and department codes only: no candidate, contact or victim data.",
			queries: QUERIES,
			ranges: RANGES,
			limitation:
				"The public board exposes mostly offers from the last 30 days; older recruitments are not observable from this source.",
		},
		offers,
	};
	writeFileSync(OUTPUT, `${JSON.stringify(dataset, null, 2)}\n`);
	console.log(`offers: ${offers.length}`);
	console.log(`departments: ${[...new Set(offers.map((o) => o.department))].sort().join(",")}`);
	if (CHECK && offers.length === 0) throw new Error("no Nouvelle-Aquitaine RSSI offer collected");
}

await main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
