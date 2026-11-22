#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures web services exposed by Nouvelle-Aquitaine communes whose official
 * website is declared in Wikidata (P856) with an INSEE code (P374).
 *
 * The query is public, free and key-less. Each website is probed once with
 * HEAD (GET fallback) and must answer 200 on its own domain. The commune is
 * matched through `org.entity_code = INSEE`, never by guessing a name. Only
 * technical metadata is written; no victim data is used.
 *
 * Usage:
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-wikidata.mts \
 *     [--apply] [--limit=400] [--offset=0] [--cache=/tmp/wikidata-na-sites.json]
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

const SOURCE = "wikidata-http-200";
const SPARQL =
	"SELECT ?insee ?site WHERE { ?item wdt:P856 ?site ; wdt:P374 ?insee . " +
	'FILTER(REGEX(?insee,"^(16|17|19|23|24|33|40|47|64|79|86|87)")) }';
const SPARQL_URL = `https://query.wikidata.org/sparql?query=${encodeURIComponent(SPARQL)}&format=json`;

type Site = { insee: string; site: string };
type Candidate = Site & {
	domain: string;
	verifiedUrl: string | null;
	ip: string | null;
	orgId: number | null;
	dept: string | null;
};

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function fetchSites(cache: string): Promise<Site[]> {
	if (cache) {
		const payload = JSON.parse(await readFile(cache, "utf8")) as { results: { bindings: { insee: { value: string }; site: { value: string } }[] } };
		return payload.results.bindings.map((binding) => ({ insee: binding.insee.value, site: binding.site.value }));
	}
	const response = await fetch(SPARQL_URL, {
		signal: AbortSignal.timeout(50_000),
		headers: { "user-agent": "RadarCyberNA/1.4 (public web service inventory)", accept: "application/sparql-results+json" },
	});
	if (!response.ok) throw new Error(`Wikidata SPARQL HTTP ${response.status}`);
	const payload = (await response.json()) as { results: { bindings: { insee: { value: string }; site: { value: string } }[] } };
	return payload.results.bindings.map((binding) => ({ insee: binding.insee.value, site: binding.site.value }));
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
		if (normalizeDomainValue(new URL(response.url).hostname) !== domain) return null;
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

export async function collectWikidataServices(): Promise<{ verified: number; matched: number; written: number }> {
	const apply = process.argv.includes("--apply");
	const cache = option("cache", "");
	const report = option("report", "bench/results/services-wikidata-2026-11-22.json");
	const consultedAt = new Date();
	const sites = await fetchSites(cache);
	const seen = new Set<string>();
	const candidates: Candidate[] = [];
	for (const site of sites) {
		const domain = normalizeDomainValue(site.site);
		if (!domain || seen.has(`${site.insee}:${domain}`)) continue;
		seen.add(`${site.insee}:${domain}`);
		candidates.push({ ...site, domain, verifiedUrl: null, ip: null, orgId: null, dept: null });
	}
	const offset = Math.max(0, Number(option("offset", "0")));
	const limit = Math.max(1, Number(option("limit", "400")));
	const selected = candidates.slice(offset, offset + limit);
	const checked = await withConcurrency(selected, 64, async (candidate) => {
		const verifiedUrl = await verifyWebsite(candidate.site, candidate.domain);
		return verifiedUrl ? { ...candidate, verifiedUrl, ip: await resolveIp(candidate.domain) } : null;
	});
	const verified = checked.filter((candidate): candidate is Candidate => candidate !== null && candidate.ip !== null);
	const codes = [...new Set(verified.map((candidate) => candidate.insee))];
	const matches = new Map<string, { id: number; dept: string }>();
	for (let index = 0; index < codes.length; index += 500) {
		const page = codes.slice(index, index + 500);
		const rows = await query<{ id: number; dept: string | null; entity_code: string }>(
			"SELECT id, dept, entity_code FROM org WHERE entity_code = ANY($1::text[])",
			[page],
		);
		for (const row of rows.rows) if (row.dept) matches.set(row.entity_code, { id: row.id, dept: row.dept });
	}
	const matched = verified.flatMap((candidate) => {
		const org = matches.get(candidate.insee);
		return org ? [{ ...candidate, orgId: org.id, dept: org.dept }] : [];
	});
	const services: WebService[] = matched.flatMap((candidate) => {
		const row: VerifiedWebsiteRow = {
			orgId: candidate.orgId!,
			dept: candidate.dept,
			domain: candidate.domain,
			source: `wikidata:${candidate.insee}:P856`,
			confidence: 0.8,
			proof: { statut: 200, urlFinale: candidate.verifiedUrl },
		};
		const service = webServiceFromVerifiedWebsite(row, candidate.ip!, consultedAt, SOURCE);
		return service ? [service] : [];
	});
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		query: SPARQL_URL,
		applied: apply,
		sites: sites.length,
		selected: selected.length,
		verified: verified.length,
		matched: matched.length,
		written,
		measurement,
		candidates: matched.map((candidate) => ({
			insee: candidate.insee, domain: candidate.domain, orgId: candidate.orgId,
			ip: candidate.ip, sourceUrl: candidate.verifiedUrl,
		})),
	}, null, 2)}\n`);
	return { verified: verified.length, matched: matched.length, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const result = await collectWikidataServices();
		console.log(
			`Wikidata web services: ${result.verified} HTTP 200, ${result.matched} matched communes, ` +
				`${result.written} written`,
		);
	} finally {
		await closePools();
	}
}
