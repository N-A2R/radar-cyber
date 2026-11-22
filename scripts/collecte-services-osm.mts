#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures web services exposed by Nouvelle-Aquitaine organisations listed in
 * OpenStreetMap. Only public, non-personal tags are used: name, website,
 * postcode and SIREN/SIRET. The website is fetched once (HTTP 200 required),
 * then resolved through public DNS. A SIREN match is required before anything
 * is written; no organisation name or address is copied into the evidence.
 *
 * Usage:
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-osm.mts \
 *     --limit=300 [--apply] [--fetch-only] [--report=bench/results/services-osm-2026-11-22.json]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { normalizeDomainValue } from "../apps/api/src/match/domaine.js";
import {
	enregistrerServicesWeb,
	isPublicIpv4,
	measureExposition,
	webServiceFromVerifiedWebsite,
	type VerifiedWebsiteRow,
	type WebService,
} from "../apps/api/src/exposition/web-service.js";

const OHOME_BBOXES = [
	"-1.9,43.9,-0.9,46.6",
	"-0.9,43.9,0.0,46.6",
	"0.0,43.9,1.0,46.6",
	"1.0,43.9,2.0,46.6",
] as const;
const SOURCE = "osm-http-200";
const THIRD_PARTY_HOSTS = new Set([
	"facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
	"youtube.com", "google.com", "google.fr", "wikipedia.org", "wikidata.org",
	"tripadvisor.fr", "yellowpages.fr", "pagesjaunes.fr", "sites.google.com",
]);

type OsmFeature = {
	properties: Record<string, unknown> & {
		"@osmId"?: string;
		name?: string;
		website?: string;
		"ref:FR:SIREN"?: string;
		"ref:FR:SIRET"?: string;
		"addr:postcode"?: string;
	};
};

type Candidate = {
	osmId: string;
	name: string;
	siren: string;
	website: string;
	domain: string;
	postcode: string | null;
	verifiedUrl: string | null;
	ip: string | null;
	orgId: number | null;
	dept: string | null;
};

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function sirenOf(feature: OsmFeature["properties"]): string | null {
	const raw = feature["ref:FR:SIREN"] ?? String(feature["ref:FR:SIRET"] ?? "").slice(0, 9);
	const digits = String(raw).replace(/\D/g, "");
	return /^\d{9}$/.test(digits) ? digits : null;
}

function isOwnDomain(domain: string): boolean {
	const parts = domain.split(".");
	return parts.length >= 2 && !THIRD_PARTY_HOSTS.has(parts.slice(-2).join("."));
}

async function fetchFeatures(bboxIndex: number | null, featuresFile: string): Promise<OsmFeature[]> {
	if (featuresFile) {
		const cached = JSON.parse(await readFile(featuresFile, "utf8")) as { features?: OsmFeature[] };
		return cached.features ?? [];
	}
	const all: OsmFeature[] = [];
	const boxes = bboxIndex === null ? OHOME_BBOXES : [OHOME_BBOXES[bboxIndex]!];
	for (const bboxes of boxes) {
		const url = new URL("https://api.ohsome.org/v1/elements/bbox");
		url.searchParams.set("filter", "website=* and name=*");
		url.searchParams.set("properties", "tags");
		const response = await fetch(url, {
			signal: AbortSignal.timeout(50_000),
			headers: { "user-agent": "RadarCyberNA/1.4 (public OSM exposure inventory)" },
		});
		if (!response.ok) throw new Error(`ohsome HTTP ${response.status} for ${bboxes}`);
		const payload = (await response.json()) as { features?: OsmFeature[] };
		all.push(...(payload.features ?? []));
	}
	return all;
}

async function verifyWebsite(url: string, domain: string): Promise<string | null> {
	try {
		let response = await fetch(url, {
			method: "HEAD",
			redirect: "follow",
			signal: AbortSignal.timeout(5000),
			headers: { "user-agent": "RadarCyberNA/1.4 (public web service verification)" },
		});
		if (response.status === 405 || response.status === 403) {
			await response.body?.cancel();
			response = await fetch(url, {
				redirect: "follow",
				signal: AbortSignal.timeout(5000),
				headers: { "user-agent": "RadarCyberNA/1.4 (public web service verification)" },
			});
		}
		if (response.status !== 200) return null;
		const finalDomain = normalizeDomainValue(new URL(response.url).hostname);
		if (finalDomain !== domain) return null;
		await response.body?.cancel();
		const parsed = new URL(response.url);
		return `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
	} catch {
		return null;
	}
}

async function resolveIp(domain: string): Promise<string | null> {
	try {
		const addresses = await resolve4(domain, { timeout: 4000 });
		return addresses.find(isPublicIpv4) ?? null;
	} catch {
		return null;
	}
}

async function withConcurrency<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await work(items[index]!);
		}
	}));
	return results;
}

export async function collectOsmServices(): Promise<{
	examined: number;
	verified: number;
	matched: number;
	written: number;
	candidates: Candidate[];
}> {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "300")));
	const fetchOnly = process.argv.includes("--fetch-only");
	const report = option("report", "bench/results/services-osm-2026-11-22.json");
	const bboxArg = process.argv.find((arg) => arg.startsWith("--bbox="));
	const bboxIndex = bboxArg ? Number(bboxArg.slice(7)) : null;
	const fromReport = option("from-report", "");
	const consultedAt = new Date();
	let initial: Candidate[] = [];
	let examined = 0;
	let verified: Candidate[] = [];
	if (fromReport) {
		const cached = JSON.parse(await readFile(fromReport, "utf8")) as { candidates: Candidate[] };
		verified = cached.candidates;
		examined = verified.length;
	} else {
		const features = await fetchFeatures(bboxIndex, option("features", ""));
		const seen = new Set<string>();
		for (const feature of features) {
			const props = feature.properties;
			const siren = sirenOf(props);
			const domain = normalizeDomainValue(props.website);
			if (!siren || !domain || !isOwnDomain(domain) || seen.has(`${siren}:${domain}`)) continue;
			seen.add(`${siren}:${domain}`);
			initial.push({
				osmId: props["@osmId"] ?? "",
				name: props.name ?? "",
				siren,
				website: props.website ?? "",
				domain,
				postcode: props["addr:postcode"] ?? null,
				verifiedUrl: null,
				ip: null,
				orgId: null,
				dept: null,
			});
		}
		examined = initial.length;
		const offset = Math.max(0, Number(option("offset", "0")));
		const selected = initial.slice(offset, offset + limit);
		const checked = await withConcurrency(selected, 64, async (candidate) => {
			const verifiedUrl = await verifyWebsite(candidate.website, candidate.domain);
			return verifiedUrl ? { ...candidate, verifiedUrl, ip: await resolveIp(candidate.domain) } : null;
		});
		verified = checked.filter((candidate): candidate is Candidate => candidate !== null && candidate.ip !== null);
	}

	let matched: Candidate[] = [];
	let written = 0;
	if (!fetchOnly) {
		const sirens = [...new Set(verified.map((candidate) => candidate.siren))];
		const matches = new Map<string, { id: number; dept: string }>();
		for (let offset = 0; offset < sirens.length; offset += 500) {
			const page = sirens.slice(offset, offset + 500);
			const rows = await query<{ id: number; dept: string | null; siren: string }>(
				"SELECT id, dept, siren FROM org WHERE siren = ANY($1::text[])",
				[page],
			);
			for (const row of rows.rows) {
				if (row.dept) matches.set(row.siren, { id: row.id, dept: row.dept });
			}
		}
		matched = verified.flatMap((candidate) => {
			const org = matches.get(candidate.siren);
			return org ? [{ ...candidate, orgId: org.id, dept: org.dept }] : [];
		});
		const services: WebService[] = matched.flatMap((candidate) => {
			const row: VerifiedWebsiteRow = {
				orgId: candidate.orgId!,
				dept: candidate.dept,
				domain: candidate.domain,
				source: `osm:${candidate.osmId}`,
				confidence: 0.8,
				proof: { statut: 200, urlFinale: candidate.verifiedUrl },
			};
			const service = webServiceFromVerifiedWebsite(row, candidate.ip!, consultedAt, SOURCE);
			return service ? [service] : [];
		});
		if (apply) written = await enregistrerServicesWeb(services);
	}
	const measurement = fetchOnly ? null : await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		source: "ohsome:website+siren; http-200; dns A",
		attribution: "© OpenStreetMap contributors",
		applied: apply,
		examined,
		selected: examined,
		verified: verified.length,
		matched: matched.length,
		written,
		measurement,
		candidates: (fetchOnly ? verified : matched).map(({ name: _name, ...candidate }) => candidate),
	}, null, 2)}\n`);
	return { examined, verified: verified.length, matched: matched.length, written, candidates: matched };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const result = await collectOsmServices();
		console.log(
			`OSM web services: ${result.examined} candidates, ${result.verified} HTTP 200, ` +
				`${result.matched} matched to NA organisations, ${result.written} written`,
		);
	} finally {
		await closePools();
	}
}
