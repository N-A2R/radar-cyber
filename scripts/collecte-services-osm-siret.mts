#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures web services exposed by Nouvelle-Aquitaine organisations whose
 * OpenStreetMap feature carries a SIREN/SIRET and a public website.
 *
 * The ohsome query is broader than the initial OSM collector: it also accepts
 * `contact:website` and establishments identified only by SIRET. Each website
 * is probed once (HEAD, GET fallback), must answer 200 on its own domain and
 * must resolve to a public IPv4 address. The SIREN is joined to `org.siren`;
 * no OSM name, address or personal tag is stored.
 *
 * Usage:
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-osm-siret.mts \
 *     --limit=400 [--offset=0] [--apply] [--bbox=0] \
 *     [--report=bench/results/services-osm-siret-2026-11-22.json]
 */
import { normalizeDomainValue } from "../apps/api/src/match/domaine.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	OSM_SIRET_SOURCE,
	osmSiretCandidate,
	type OsmSiretCandidate,
	type OsmSiretFeature,
} from "../apps/api/src/exposition/osm-siret.js";
import {
	enregistrerServicesWeb,
	isPublicIpv4,
	measureExposition,
	webServiceFromVerifiedWebsite,
	type VerifiedWebsiteRow,
	type WebService,
} from "../apps/api/src/exposition/web-service.js";
type Candidate = OsmSiretCandidate & { verifiedUrl?: string; ip?: string };

const OHOME_BBOXES = [
	"-1.9,43.9,-0.9,46.6",
	"-0.9,43.9,0.0,46.6",
	"0.0,43.9,1.0,46.6",
	"1.0,43.9,2.0,46.6",
] as const;
const OHOME_FILTER =
	"((ref:FR:SIREN=* or ref:FR:SIRET=*) and (website=* or contact:website=*))";
const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

type VerifiedCandidate = OsmSiretCandidate & {
	verifiedUrl: string;
	ip: string;
	orgId: number;
	dept: string;
};

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function fetchFeatures(bboxIndex: number | null, featuresFile: string): Promise<OsmSiretFeature[]> {
	if (featuresFile) {
		const cached = JSON.parse(await readFile(featuresFile, "utf8")) as { features?: OsmSiretFeature[] };
		return cached.features ?? [];
	}
	const all: OsmSiretFeature[] = [];
	const boxes = bboxIndex === null ? OHOME_BBOXES : [OHOME_BBOXES[bboxIndex]!];
	for (const bboxes of boxes) {
		const url = new URL("https://api.ohsome.org/v1/elements/bbox");
		url.searchParams.set("bboxes", bboxes);
		url.searchParams.set("filter", OHOME_FILTER);
		url.searchParams.set("properties", "tags");
		const response = await fetch(url, {
			signal: AbortSignal.timeout(50_000),
			headers: { "user-agent": "RadarCyberNA/1.5 (public OSM exposure inventory)" },
		});
		if (!response.ok) throw new Error(`ohsome HTTP ${response.status} for ${bboxes}`);
		const payload = (await response.json()) as { features?: OsmSiretFeature[] };
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
			headers: { "user-agent": "RadarCyberNA/1.5 (public web service verification)" },
		});
		if (response.status === 405 || response.status === 403) {
			await response.body?.cancel();
			response = await fetch(url, {
				redirect: "follow",
				signal: AbortSignal.timeout(5000),
				headers: { "user-agent": "RadarCyberNA/1.5 (public web service verification)" },
			});
		}
		if (response.status !== 200) return null;
		const finalDomain = new URL(response.url).hostname;
		if (normalizeDomainValue(finalDomain) !== domain) return null;
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

type OrgMatch = { id: number; dept: string };

async function matchableOrganisations(
	candidates: readonly OsmSiretCandidate[],
	onlyMissing: boolean,
): Promise<Map<string, OrgMatch>> {
	const matches = new Map<string, OrgMatch>();
	const sirens = [...new Set(candidates.map((candidate) => candidate.siren))];
	const sql = onlyMissing
		? `SELECT o.id, o.dept, o.siren FROM org o
		   WHERE o.siren = ANY($1::text[]) AND o.dept = ANY($2::text[])
		     AND NOT EXISTS (SELECT 1 FROM exposition_service s WHERE s.org_id = o.id)`
		: `SELECT o.id, o.dept, o.siren FROM org o
		   WHERE o.siren = ANY($1::text[]) AND o.dept = ANY($2::text[])`;
	for (let index = 0; index < sirens.length; index += 500) {
		const rows = await query<{ id: number; dept: string | null; siren: string }>(
			sql,
			[sirens.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) {
			if (row.dept) matches.set(row.siren, { id: row.id, dept: row.dept });
		}
	}
	return matches;
}

function matchCandidates(
	candidates: readonly (OsmSiretCandidate & { verifiedUrl: string; ip: string })[],
	matches: Map<string, OrgMatch>,
) {
	return candidates.flatMap((candidate) => {
		const org = matches.get(candidate.siren);
		return org ? [{ ...candidate, orgId: org.id, dept: org.dept }] : [];
	});
}

export async function collectOsmSiretServices(): Promise<{
	examined: number;
	verified: number;
	matched: number;
	written: number;
	candidates: VerifiedCandidate[];
}> {
	const apply = process.argv.includes("--apply");
	const onlyMissing = process.argv.includes("--only-missing");
	const limit = Math.max(1, Number(option("limit", "400")));
	const offset = Math.max(0, Number(option("offset", "0")));
	const fromReport = option("from-report", "");
	const report = option("report", "bench/results/services-osm-siret-2026-11-22.json");
	const consultedAt = new Date();

	let candidates: Candidate[] = [];
	let examined = 0;
	if (fromReport) {
		const cached = JSON.parse(await readFile(fromReport, "utf8")) as {
			candidates: {
				osmId: string; siren: string; domain: string; sourceUrl: string;
				ip: string; orgId: number; dept: string;
			}[];
		};
		candidates = cached.candidates.map((candidate) => ({
			osmId: candidate.osmId, siren: candidate.siren, domain: candidate.domain,
			website: candidate.sourceUrl, verifiedUrl: candidate.sourceUrl, ip: candidate.ip,
		}));
		examined = candidates.length;
	} else {
		const features = await fetchFeatures(
			process.argv.find((arg) => arg.startsWith("--bbox="))
				? Number(option("bbox", "0"))
				: null,
			option("features", ""),
		);
		const seen = new Set<string>();
		for (const feature of features) {
			const candidate = osmSiretCandidate(feature);
			if (!candidate || seen.has(candidate.siren)) continue;
			seen.add(candidate.siren);
			candidates.push(candidate);
		}
		examined = candidates.length;
	}

	const eligibleMatches = await matchableOrganisations(candidates, onlyMissing);
	candidates = candidates.filter((candidate) => eligibleMatches.has(candidate.siren));
	const eligible = candidates.length;
	const selected = candidates.slice(offset, offset + limit);
	const checked = await withConcurrency<Candidate, Candidate | null>(selected, 64, async (candidate) => {
		if (candidate.verifiedUrl && "ip" in candidate && candidate.ip) return candidate;
		const verifiedUrl = await verifyWebsite(candidate.website, candidate.domain);
		if (!verifiedUrl) return null;
		const ip = await resolveIp(candidate.domain);
		return ip ? { ...candidate, verifiedUrl, ip } : null;
	});
	const verified = checked.filter(
		(candidate): candidate is OsmSiretCandidate & { verifiedUrl: string; ip: string } => candidate !== null,
	);
	const matched = matchCandidates(verified, eligibleMatches);
	const services: WebService[] = matched.flatMap((candidate) => {
		const row: VerifiedWebsiteRow = {
			orgId: candidate.orgId,
			dept: candidate.dept,
			domain: candidate.domain,
			source: `osm:${candidate.osmId}:siret`,
			confidence: 0.8,
			proof: { statut: 200, urlFinale: candidate.verifiedUrl },
		};
		const service = webServiceFromVerifiedWebsite(row, candidate.ip, consultedAt, OSM_SIRET_SOURCE);
		return service ? [service] : [];
	});
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		source: "ohsome:ref:FR:SIREN|SIRET; website|contact:website; http-200; dns A",
		attribution: "© OpenStreetMap contributors",
		applied: apply,
		onlyMissing,
		eligible,
		examined,
		selected: selected.length,
		verified: verified.length,
		matched: matched.length,
		written,
		measurement,
		candidates: matched.map((candidate) => ({
			osmId: candidate.osmId, siren: candidate.siren, domain: candidate.domain,
			orgId: candidate.orgId, dept: candidate.dept, ip: candidate.ip,
			sourceUrl: candidate.verifiedUrl,
		})),
	}, null, 2)}\n`);
	return { examined, verified: verified.length, matched: matched.length, written, candidates: matched };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const result = await collectOsmSiretServices();
		console.log(
			`OSM SIRET web services: ${result.examined} candidates, ${result.verified} HTTP 200, ` +
				`${result.matched} matched to NA organisations, ${result.written} written; ` +
				`organisations with service=${(await measureExposition()).organisationsWithService}`,
		);
	} finally {
		await closePools();
	}
}
