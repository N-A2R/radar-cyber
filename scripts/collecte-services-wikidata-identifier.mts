#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures web services declared with a French public identifier in Wikidata.
 *
 * P3215 (SIRET) and P3202 (UAI) are joined with P856 (official website).
 * Organisations are joined by SIREN or by UAI (`annuaire-education`), never by
 * name or location. Each website is probed once (HEAD, GET fallback), must
 * answer HTTP 200 on its own registrable domain and resolve to a public IPv4
 * address. Only public identifiers and technical evidence are stored.
 *
 * Usage:
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-wikidata-identifier.mts \
 *     --input=bench/results/wikidata-id-sites-2026-11-22.tsv \
 *     --limit=300 [--offset=0] [--apply] [--only-missing] \
 *     --report=bench/results/services-wikidata-id-2026-11-22.json
 *
 * Without `--input`, SPARQL is queried live; `--siret-input` and `--uai-input`
 * accept cached JSON bindings for either property.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	WIKIDATA_IDENTIFIER_SOURCE,
	wikidataIdentifierCandidate,
	type IdentifierKind,
	type WikidataIdentifierCandidate,
} from "../apps/api/src/exposition/wikidata-identifier-site.js";
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
const SPARQL_URL = "https://query.wikidata.org/sparql";
const USER_AGENT = "RadarCyberNA/2.0 (public identifier website verification)";
const PROPERTIES: Record<IdentifierKind, { property: string; variable: string }> = {
	siret: { property: "P3215", variable: "siret" },
	uai: { property: "P3202", variable: "uai" },
};

type Candidate = WikidataIdentifierCandidate & { verifiedUrl?: string; finalHost?: string; ip?: string };
type Matched = Candidate & { orgId: number };

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

/** Reads cached SPARQL bindings, or queries Wikidata when no cache is supplied. */
async function readCandidates(kind: IdentifierKind, input: string): Promise<Candidate[]> {
	const { property, variable } = PROPERTIES[kind];
	let bindings: { [key: string]: { value: string } }[];
	if (input) {
		const cached = JSON.parse(await readFile(input, "utf8")) as {
			results?: { bindings?: { [key: string]: { value: string } }[] };
		};
		bindings = cached.results?.bindings ?? [];
	} else {
		const url = new URL(SPARQL_URL);
		url.searchParams.set("query", `SELECT ?${variable} ?site WHERE { ?item wdt:${property} ?${variable} ; wdt:P856 ?site . }`);
		url.searchParams.set("format", "json");
		const response = await fetch(url, {
			signal: AbortSignal.timeout(50_000),
			headers: { "user-agent": USER_AGENT },
		});
		if (!response.ok) throw new Error(`Wikidata ${property} HTTP ${response.status}`);
		const payload = await response.json() as { results?: { bindings?: { [key: string]: { value: string } }[] } };
		bindings = payload.results?.bindings ?? [];
	}
	const candidates = new Map<string, Candidate>();
	for (const binding of bindings) {
		const candidate = wikidataIdentifierCandidate(
			kind,
			binding[variable]?.value,
			binding.site?.value,
		);
		if (!candidate) continue;
		const key = `${kind}|${candidate.id}|${candidate.domain}`;
		if (!candidates.has(key)) candidates.set(key, candidate);
	}
	return [...candidates.values()];
}

/** Reads the versioned identifier/website export, without any network call. */
async function readVersionedCandidates(input: string): Promise<Candidate[]> {
	const lines = (await readFile(input, "utf8")).split("\n").slice(1);
	const candidates = new Map<string, Candidate>();
	for (const line of lines) {
		if (!line.trim()) continue;
		const [kind, id, website] = line.split("\t");
		if (kind !== "siret" && kind !== "uai") continue;
		const candidate = wikidataIdentifierCandidate(kind, id, website);
		if (!candidate) continue;
		const key = `${kind}|${candidate.id}|${candidate.domain}`;
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

/** Joins by public SIREN or UAI only, excluding already measured organisations. */
async function matchableOrganisations(
	candidates: readonly Candidate[],
	onlyMissing: boolean,
): Promise<{ bySiren: Map<string, { id: number; dept: string }>; byUai: Map<string, { id: number; dept: string }> }> {
	const missing = onlyMissing
		? `AND NOT EXISTS (SELECT 1 FROM exposition_service s WHERE s.org_id = o.id)`
		: "";
	const bySiren = new Map<string, { id: number; dept: string }>();
	const byUai = new Map<string, { id: number; dept: string }>();
	const sirens = [...new Set(candidates.filter((c) => c.kind === "siret").map((c) => c.id))];
	const uais = [...new Set(candidates.filter((c) => c.kind === "uai").map((c) => c.id))];
	for (let index = 0; index < sirens.length; index += 500) {
		const rows = await query<{ id: number; siren: string; dept: string | null }>(
			`SELECT o.id, o.siren, o.dept FROM org o
			 WHERE o.siren = ANY($1::text[]) AND o.dept = ANY($2::text[]) ${missing}`,
			[sirens.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) if (row.dept) bySiren.set(row.siren, { id: row.id, dept: row.dept });
	}
	for (let index = 0; index < uais.length; index += 500) {
		const rows = await query<{ id: number; uai: string; dept: string | null }>(
			`SELECT o.id, o.entity_code AS uai, o.dept FROM org o
			 WHERE o.entity_code = ANY($1::text[]) AND o.entity_source = 'annuaire-education'
			 AND o.dept = ANY($2::text[]) ${missing}`,
			[uais.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) if (row.dept) byUai.set(row.uai, { id: row.id, dept: row.dept });
	}
	return { bySiren, byUai };
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

export async function collectWikidataIdentifierServices(): Promise<{
	examined: number; eligible: number; selected: number; verified: number; written: number;
}> {
	const apply = process.argv.includes("--apply");
	const onlyMissing = process.argv.includes("--only-missing");
	const limit = Math.max(1, Number(option("limit", "300")));
	const offset = Math.max(0, Number(option("offset", "0")));
	const concurrency = Math.max(1, Math.min(128, Number(option("concurrency", "96"))));
	const report = option("report", "bench/results/services-wikidata-id-2026-11-22.json");
	const consultedAt = new Date();

	const versionedInput = option("input", "");
	const candidates = versionedInput
		? await readVersionedCandidates(versionedInput)
		: [
			...(await readCandidates("siret", option("siret-input", ""))),
			...(await readCandidates("uai", option("uai-input", ""))),
		];
	const examined = candidates.length;
	const matches = await matchableOrganisations(candidates, onlyMissing);
	const eligible = candidates.filter((candidate) =>
		matches.bySiren.has(candidate.id) || matches.byUai.has(candidate.id));
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
		const org = matches.bySiren.get(candidate.id) ?? matches.byUai.get(candidate.id);
		if (!org) continue;
		const key = `${org.id}|${candidate.domain}`;
		if (seen.has(key)) continue;
		seen.add(key);
		matched.push({ ...candidate, orgId: org.id });
	}
	const services: WebService[] = matched.flatMap((candidate) => {
		const row: VerifiedWebsiteRow = {
			orgId: candidate.orgId,
			dept: candidate.kind === "siret" ? matches.bySiren.get(candidate.id)!.dept : matches.byUai.get(candidate.id)!.dept,
			domain: candidate.finalHost ?? candidate.domain,
			source: `wikidata:${candidate.kind === "siret" ? "P3215" : "P3202"}`,
			confidence: 0.8,
			proof: { statut: 200, urlFinale: candidate.verifiedUrl! },
		};
		const service = webServiceFromVerifiedWebsite(row, candidate.ip!, consultedAt, WIKIDATA_IDENTIFIER_SOURCE);
		return service ? [service] : [];
	});
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		source: "wikidata:P3215/P3202+P856; HTTP 200; DNS A",
		attribution: "Wikidata (CC0) — public SIRET/UAI and official website",
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
			kind: candidate.kind,
			id: candidate.id,
			dept: candidate.kind === "siret" ? matches.bySiren.get(candidate.id)!.dept : matches.byUai.get(candidate.id)!.dept,
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
		const result = await collectWikidataIdentifierServices();
		console.log(
			`Wikidata identifier web services: ${result.examined} candidates, ${result.eligible} eligible, ` +
				`${result.selected} selected, ${result.verified} HTTP 200, ${result.written} written`,
		);
	} finally {
		await closePools();
	}
}
