#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures live web services on hosts inside a declared registrable domain.
 *
 * Three public caches supply the declarations: the organisation's own website
 * column, HTTP-200 proofs in `org_enrichissement`, and Wikidata P462 (SIREN)
 * paired with P856 (official website). A declaration is kept only when its
 * final host answers HTTP 200, shares the declared registrable domain and
 * resolves to a public IPv4 address. Names, addresses and people are never
 * copied into the report.
 *
 * Usage:
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-site-zone.mts \
 *     --limit=300 [--offset=0] [--apply] [--only-missing] \
 *     --report=bench/results/services-site-zone-2026-11-22.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { isOwnDomain } from "../apps/api/src/exposition/osm-siret.js";
import { publicWebsite } from "../apps/api/src/exposition/public-site.js";
import {
	hostFromUrl,
	isSameSiteHost,
	SITE_ZONE_SOURCE,
} from "../apps/api/src/exposition/site-zone.js";
import {
	enregistrerServicesWeb,
	isPublicIpv4,
	measureExposition,
	type WebService,
} from "../apps/api/src/exposition/web-service.js";

const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

type Candidate = {
	orgId: number;
	dept: string;
	declaredUrl: string;
	provenance: string;
};

type Verified = Candidate & {
	declaredDomain: string;
	finalHost: string;
	finalUrl: string;
	ip: string;
};

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

/** All NA organisations with a declared website and no service yet, unless disabled. */
async function declaredWebsiteCandidates(onlyMissing: boolean): Promise<Candidate[]> {
	const missing = onlyMissing
		? `AND NOT EXISTS (SELECT 1 FROM exposition_service s WHERE s.org_id = o.id)`
		: "";
	const rows = await query<Candidate>(
		`SELECT o.id AS "orgId", o.dept, o.website AS "declaredUrl", 'org.website' AS provenance
		 FROM org o
		 WHERE o.dept = ANY($1::text[]) AND o.website IS NOT NULL AND btrim(o.website) <> ''
		   ${missing}`,
		[DEPARTMENTS],
	);
	return rows.rows.filter((row) => row.declaredUrl && row.dept);
}

/** HTTP-200 proofs whose declared apex may not resolve, but whose final host can. */
async function proofCandidates(onlyMissing: boolean): Promise<Candidate[]> {
	const missing = onlyMissing
		? `AND NOT EXISTS (SELECT 1 FROM exposition_service s WHERE s.org_id = o.id)`
		: "";
	const rows = await query<Candidate>(
		`SELECT o.id AS "orgId", o.dept,
		        COALESCE(NULLIF(e.preuve->>'siteDeclare', ''), NULLIF(o.website, ''), e.valeur)
		          AS "declaredUrl",
		        'org_enrichissement:' || e.source AS provenance
		 FROM org_enrichissement e
		 JOIN org o ON o.id = e.org_id
		 WHERE e.champ = 'domaine' AND e.confiance >= 0.8 AND e.preuve->>'statut' = '200'
		   AND o.dept = ANY($1::text[]) ${missing}`,
		[DEPARTMENTS],
	);
	return rows.rows.filter((row) => row.declaredUrl && row.dept);
}

/** Wikidata SIREN -> official website pairs, joined to NA organisations by SIREN. */
async function wikidataCandidates(path: string, onlyMissing: boolean): Promise<Candidate[]> {
	const raw = await readFile(path, "utf8");
	const sites = new Map<string, string>();
	for (const line of raw.split("\n")) {
		const [siren, url] = line.split("\t");
		if (siren && /^\d{9}$/.test(siren) && url && !sites.has(siren)) sites.set(siren, url.trim());
	}
	const sirens = [...sites.keys()];
	const missing = onlyMissing
		? `AND NOT EXISTS (SELECT 1 FROM exposition_service s WHERE s.org_id = o.id)`
		: "";
	const candidates: Candidate[] = [];
	for (let index = 0; index < sirens.length; index += 500) {
		const chunk = sirens.slice(index, index + 500);
		const rows = await query<{ orgId: number; dept: string; siren: string }>(
			`SELECT v.column1 AS siren, o.id AS "orgId", o.dept
			 FROM (${chunk.map((siren) => `SELECT '${siren}'::text AS column1`).join(" UNION ALL ")}) v
			 JOIN org o ON o.siren = v.column1
			 WHERE o.dept = ANY($1::text[]) ${missing}`,
			[DEPARTMENTS],
		);
		for (const row of rows.rows) {
			if (row.dept) {
				candidates.push({
					orgId: row.orgId,
					dept: row.dept,
					declaredUrl: sites.get(row.siren)!,
					provenance: "wikidata:P462:P856",
				});
			}
		}
	}
	return candidates;
}

async function verify(candidate: Candidate): Promise<Verified | null> {
	const site = publicWebsite(candidate.declaredUrl);
	if (!site || !isOwnDomain(site.domain)) return null;
	try {
		let response = await fetch(site.website, {
			method: "HEAD",
			redirect: "follow",
			signal: AbortSignal.timeout(5000),
			headers: { "user-agent": "RadarCyberNA/1.7 (declared site zone verification)" },
		});
		if (response.status === 405 || response.status === 403) {
			await response.body?.cancel();
			response = await fetch(site.website, {
				redirect: "follow",
				signal: AbortSignal.timeout(5000),
				headers: { "user-agent": "RadarCyberNA/1.7 (declared site zone verification)" },
			});
		}
		if (response.status !== 200) return null;
		const finalHost = hostFromUrl(response.url);
		if (!finalHost || !isSameSiteHost(finalHost, site.domain)) return null;
		const parsed = new URL(response.url);
		const finalUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
		await response.body?.cancel();
		const addresses = await resolve4(finalHost, { timeout: 4000 });
		const ip = addresses.find(isPublicIpv4);
		return ip ? { ...candidate, declaredDomain: site.domain, finalHost, finalUrl, ip } : null;
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

export async function collectSiteZoneServices(): Promise<{
	examined: number; selected: number; verified: number; written: number;
}> {
	const apply = process.argv.includes("--apply");
	const onlyMissing = process.argv.includes("--only-missing");
	const limit = Math.max(1, Number(option("limit", "300")));
	const offset = Math.max(0, Number(option("offset", "0")));
	const concurrency = Math.max(1, Math.min(128, Number(option("concurrency", "96"))));
	const pairs = option("pairs", "bench/results/wikidata-siren-sites-2026-11-22.tsv");
	const report = option("report", "bench/results/services-site-zone-2026-11-22.json");
	const consultedAt = new Date();

	const all = [
		...await declaredWebsiteCandidates(onlyMissing),
		...await proofCandidates(onlyMissing),
		...await wikidataCandidates(pairs, onlyMissing),
	];
	const seen = new Set<string>();
	const candidates: Candidate[] = [];
	for (const candidate of all) {
		const site = publicWebsite(candidate.declaredUrl);
		if (!site) continue;
		const key = `${candidate.orgId}|${site.domain}`;
		if (seen.has(key)) continue;
		seen.add(key);
		candidates.push(candidate);
	}
	const selected = candidates.slice(offset, offset + limit);
	const checked = await withConcurrency(selected, concurrency, verify);
	const verified = checked.filter((candidate): candidate is Verified => candidate !== null);
	const services: WebService[] = verified.map((candidate) => {
		const service = candidate.finalUrl.startsWith("https://") ? "https" : "http";
		return {
			orgId: candidate.orgId,
			ip: candidate.ip,
			port: service === "https" ? 443 : 80,
			category: "web",
			service,
			technology: "http-server",
			version: null,
			source: SITE_ZONE_SOURCE,
			sourceUrl: candidate.finalUrl,
			consultedAt,
			evidence: {
				domain: candidate.finalHost,
				url: candidate.finalUrl,
				status: 200,
				provider: candidate.provenance,
			},
		};
	});
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		source: "declared site zone; HTTP 200 on same registrable domain; DNS A",
		licence: "Wikidata CC0; public organisation records",
		attribution: "organisation registry, org_enrichissement proofs, Wikidata P462/P856",
		applied: apply,
		onlyMissing,
		examined: candidates.length,
		selected: selected.length,
		verified: verified.length,
		written,
		measurement,
		candidates: verified.map((candidate) => ({
			orgId: candidate.orgId,
			dept: candidate.dept,
			declaredDomain: candidate.declaredDomain,
			finalHost: candidate.finalHost,
			ip: candidate.ip,
			sourceUrl: candidate.finalUrl,
			provider: candidate.provenance,
		})),
	}, null, 2)}\n`);
	return { examined: candidates.length, selected: selected.length, verified: verified.length, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const result = await collectSiteZoneServices();
		console.log(
			`Declared site zone services: ${result.examined} candidates, ${result.selected} selected, ` +
				`${result.verified} HTTP 200 in zone, ${result.written} written`,
		);
	} finally {
		await closePools();
	}
}
