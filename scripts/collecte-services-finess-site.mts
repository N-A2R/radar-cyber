#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures web services declared for French health and social establishments
 * in the public FINESS enrichment dataset (`finess-enrichi.csv`).
 *
 * Candidates are the versioned identifier/postal-code/website triples in
 * `bench/results/finess-site-sites-2026-11-22.tsv`. Only the FINESS identifier
 * and the declared website are used: the join is made to `org.entity_code`
 * with `entity_source = 'finess'`, with no name, location or similarity match.
 * Each website is probed once (HEAD, GET fallback), must answer HTTP 200 on its
 * own registrable domain and resolve to a public IPv4 address.
 *
 * Usage:
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-finess-site.mts \
 *     --input=bench/results/finess-site-sites-2026-11-22.tsv \
 *     --limit=300 [--offset=0] [--apply] [--only-missing] \
 *     --report=bench/results/services-finess-site-2026-11-22.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	FINESS_SITE_SOURCE,
	finessSiteCandidate,
	type FinessSiteCandidate,
} from "../apps/api/src/exposition/finess-site.js";
import { hostFromUrl, isSameSiteHost } from "../apps/api/src/exposition/site-zone.js";
import {
	enregistrerServicesWeb,
	isPublicIpv4,
	measureExposition,
	webServiceFromVerifiedWebsite,
	type VerifiedWebsiteRow,
	type WebService,
} from "../apps/api/src/exposition/web-service.js";

const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const USER_AGENT = "RadarCyberNA/2.0 (public FINESS website verification)";
const PROVIDER = "finess-enrichi:site_web";

type Candidate = FinessSiteCandidate & { verifiedUrl?: string; finalHost?: string; ip?: string };
type Matched = Candidate & { orgId: number; dept: string };

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

/** Reads the versioned public-registry extraction without any network call. */
async function readCandidates(input: string): Promise<Candidate[]> {
	const lines = (await readFile(input, "utf8")).split("\n").slice(1);
	const candidates = new Map<string, Candidate>();
	for (const line of lines) {
		if (!line.trim()) continue;
		const [id, postalCode, site] = line.split("\t");
		if (!DEPARTMENTS.includes(String(postalCode ?? "").trim().slice(0, 2))) continue;
		const candidate = finessSiteCandidate(id, site);
		if (!candidate) continue;
		const key = `${candidate.id}|${candidate.domain}`;
		if (!candidates.has(key)) candidates.set(key, candidate);
	}
	return [...candidates.values()];
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

type Org = { id: number; dept: string | null };

/** Joins by FINESS identifier only, excluding already measured organisations. */
async function matchableOrganisations(candidates: readonly Candidate[], onlyMissing: boolean): Promise<Map<string, Org>> {
	const missing = onlyMissing
		? `AND NOT EXISTS (SELECT 1 FROM exposition_service s WHERE s.org_id = o.id)`
		: "";
	const byFiness = new Map<string, Org>();
	const ids = [...new Set(candidates.map((candidate) => candidate.id))];
	for (let index = 0; index < ids.length; index += 500) {
		const rows = await query<Org & { code: string }>(
			`SELECT o.id, o.dept, o.entity_code AS code FROM org o
			 WHERE o.entity_source = 'finess' AND o.entity_code = ANY($1::text[])
			 AND o.dept = ANY($2::text[]) ${missing}`,
			[ids.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) if (row.dept && !byFiness.has(row.code)) byFiness.set(row.code, row);
	}
	return byFiness;
}

async function verifyWebsite(url: string, declaredDomain: string): Promise<{ finalUrl: string; finalHost: string } | null> {
	try {
		let response = await fetch(url, {
			method: "HEAD",
			redirect: "follow",
			signal: AbortSignal.timeout(5000),
			headers: { "user-agent": USER_AGENT },
		});
		if (response.status === 405 || response.status === 403) {
			await response.body?.cancel();
			response = await fetch(url, {
				redirect: "follow",
				signal: AbortSignal.timeout(5000),
				headers: { "user-agent": USER_AGENT },
			});
		}
		if (response.status !== 200) return null;
		const finalHost = hostFromUrl(response.url);
		if (!finalHost || !isSameSiteHost(finalHost, declaredDomain)) return null;
		await response.body?.cancel();
		const parsed = new URL(response.url);
		return {
			finalUrl: `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`,
			finalHost,
		};
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

export async function collectFinessSiteServices(): Promise<{
	examined: number; eligible: number; selected: number; verified: number; written: number;
}> {
	const apply = process.argv.includes("--apply");
	const onlyMissing = process.argv.includes("--only-missing");
	const limit = Math.max(1, Number(option("limit", "300")));
	const offset = Math.max(0, Number(option("offset", "0")));
	const concurrency = Math.max(1, Math.min(128, Number(option("concurrency", "96"))));
	const report = option("report", "bench/results/services-finess-site-2026-11-22.json");
	const consultedAt = new Date();

	const candidates = await readCandidates(option("input", "bench/results/finess-site-sites-2026-11-22.tsv"));
	const examined = candidates.length;
	const matches = await matchableOrganisations(candidates, onlyMissing);
	const eligible = candidates.filter((candidate) => matches.has(candidate.id));
	const selected = eligible.slice(offset, offset + limit);
	const checked = await withConcurrency<Candidate, Candidate | null>(selected, concurrency, async (candidate) => {
		const proof = await verifyWebsite(candidate.website, candidate.domain);
		if (!proof) return null;
		const ip = await resolveIp(proof.finalHost);
		return ip ? { ...candidate, verifiedUrl: proof.finalUrl, finalHost: proof.finalHost, ip } : null;
	});
	const verified = checked.filter((candidate): candidate is Candidate => candidate !== null);
	const matched: Matched[] = [];
	const seen = new Set<string>();
	for (const candidate of verified) {
		const org = matches.get(candidate.id);
		if (!org?.dept) continue;
		const key = `${org.id}|${candidate.domain}`;
		if (seen.has(key)) continue;
		seen.add(key);
		matched.push({ ...candidate, orgId: org.id, dept: org.dept });
	}
	const services: WebService[] = matched.flatMap((candidate) => {
		const row: VerifiedWebsiteRow = {
			orgId: candidate.orgId,
			dept: candidate.dept,
			domain: candidate.finalHost ?? candidate.domain,
			source: PROVIDER,
			confidence: 0.8,
			proof: { statut: 200, urlFinale: candidate.verifiedUrl! },
		};
		const service = webServiceFromVerifiedWebsite(row, candidate.ip!, consultedAt, FINESS_SITE_SOURCE);
		return service ? [service] : [];
	});
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		source: "FINESS enrichment site_web; HTTP 200; DNS A",
		attribution: "FINESS enrichment published on data.gouv.fr (open data)",
		applied: apply,
		onlyMissing,
		examined,
		eligible: eligible.length,
		selected: selected.length,
		verified: verified.length,
		matched: matched.length,
		written,
		measurement,
		candidates: matched.map((candidate) => ({
			id: candidate.id,
			dept: candidate.dept,
			domain: candidate.finalHost ?? candidate.domain,
			orgId: candidate.orgId,
			ip: candidate.ip,
			sourceUrl: candidate.verifiedUrl,
		})),
	}, null, 2)}\n`);
	return {
		examined,
		eligible: eligible.length,
		selected: selected.length,
		verified: verified.length,
		written,
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const result = await collectFinessSiteServices();
		console.log(
			`FINESS web services: ${result.examined} candidates, ${result.eligible} eligible, ` +
				`${result.selected} selected, ${result.verified} HTTP 200, ${result.written} written`,
		);
	} finally {
		await closePools();
	}
}
