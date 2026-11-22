#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures web services declared in public registries keyed by an organisation
 * identifier: data.inclusion SIRET and OpenStreetMap `ref:FR:FINESS`.
 *
 * Candidates are the versioned identifier/website pairs in
 * `bench/results/registry-id-sites-2026-11-22.tsv`. A SIRET is joined to
 * `org.entity_code` (`sirene-site`) or to `org.siren`; a FINESS number is joined
 * to `org.entity_code` (`finess`). No name, location or similarity matching is
 * used. Each website is probed once (HEAD, GET fallback), must answer HTTP 200
 * on its own registrable domain and resolve to a public IPv4 address.
 *
 * Usage:
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-registry-id.mts \
 *     --input=bench/results/registry-id-sites-2026-11-22.tsv \
 *     --limit=300 [--offset=0] [--apply] [--only-missing] \
 *     --report=bench/results/services-registry-id-2026-11-22.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	REGISTRY_IDENTIFIER_SOURCE,
	registryIdentifierCandidate,
	type RegistryIdentifierCandidate,
	type RegistryIdentifierKind,
} from "../apps/api/src/exposition/registry-identifier-site.js";
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
const USER_AGENT = "RadarCyberNA/2.0 (public registry website verification)";
const PROVIDER: Record<RegistryIdentifierKind, string> = {
	siret: "data-inclusion:siret",
	finess: "osm:ref:FR:FINESS",
};

type Candidate = RegistryIdentifierCandidate & {
	verifiedUrl?: string;
	finalHost?: string;
	ip?: string;
};
type Matched = Candidate & { orgId: number; dept: string };

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

/** Reads the versioned identifier/website export, without any network call. */
async function readCandidates(input: string): Promise<Candidate[]> {
	const lines = (await readFile(input, "utf8")).split("\n").slice(1);
	const candidates = new Map<string, Candidate>();
	for (const line of lines) {
		if (!line.trim()) continue;
		const [kind, id, website] = line.split("\t");
		if (kind !== "siret" && kind !== "finess") continue;
		const candidate = registryIdentifierCandidate(kind, id, website);
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

type Org = { id: number; dept: string | null };

/** Joins by public identifier only, excluding already measured organisations. */
async function matchableOrganisations(
	candidates: readonly Candidate[],
	onlyMissing: boolean,
): Promise<{ bySiret: Map<string, Org>; bySiren: Map<string, Org>; byFiness: Map<string, Org> }> {
	const missing = onlyMissing
		? `AND NOT EXISTS (SELECT 1 FROM exposition_service s WHERE s.org_id = o.id)`
		: "";
	const bySiret = new Map<string, Org>();
	const bySiren = new Map<string, Org>();
	const byFiness = new Map<string, Org>();
	const sirets = [...new Set(candidates.filter((c) => c.kind === "siret").map((c) => c.id))];
	const sirens = [...new Set(sirets.map((id) => id.slice(0, 9)))];
	const finess = [...new Set(candidates.filter((c) => c.kind === "finess").map((c) => c.id))];
	for (let index = 0; index < sirets.length; index += 500) {
		const rows = await query<Org & { code: string }>(
			`SELECT o.id, o.dept, o.entity_code AS code FROM org o
			 WHERE o.entity_source = 'sirene-site' AND o.entity_code = ANY($1::text[])
			 AND o.dept = ANY($2::text[]) ${missing}`,
			[sirets.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) if (row.dept) bySiret.set(row.code, row);
	}
	for (let index = 0; index < sirens.length; index += 500) {
		const rows = await query<Org & { siren: string }>(
			`SELECT o.id, o.dept, o.siren FROM org o
			 WHERE o.siren = ANY($1::text[]) AND o.dept = ANY($2::text[]) ${missing}`,
			[sirens.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) if (row.dept && !bySiren.has(row.siren)) bySiren.set(row.siren, row);
	}
	for (let index = 0; index < finess.length; index += 500) {
		const rows = await query<Org & { code: string }>(
			`SELECT o.id, o.dept, o.entity_code AS code FROM org o
			 WHERE o.entity_source = 'finess' AND o.entity_code = ANY($1::text[])
			 AND o.dept = ANY($2::text[]) ${missing}`,
			[finess.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) if (row.dept && !byFiness.has(row.code)) byFiness.set(row.code, row);
	}
	return { bySiret, bySiren, byFiness };
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

export async function collectRegistryIdentifierServices(): Promise<{
	examined: number; eligible: number; selected: number; verified: number; written: number;
}> {
	const apply = process.argv.includes("--apply");
	const onlyMissing = process.argv.includes("--only-missing");
	const limit = Math.max(1, Number(option("limit", "300")));
	const offset = Math.max(0, Number(option("offset", "0")));
	const concurrency = Math.max(1, Math.min(128, Number(option("concurrency", "96"))));
	const report = option("report", "bench/results/services-registry-id-2026-11-22.json");
	const consultedAt = new Date();

	const candidates = await readCandidates(option("input", "bench/results/registry-id-sites-2026-11-22.tsv"));
	const examined = candidates.length;
	const matches = await matchableOrganisations(candidates, onlyMissing);
	const eligible = candidates.filter((candidate) =>
		matches.bySiret.has(candidate.id)
		|| matches.bySiren.has(candidate.id.slice(0, 9))
		|| matches.byFiness.has(candidate.id));
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
		const org = candidate.kind === "siret"
			? matches.bySiret.get(candidate.id) ?? matches.bySiren.get(candidate.id.slice(0, 9))
			: matches.byFiness.get(candidate.id);
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
			source: PROVIDER[candidate.kind],
			confidence: 0.8,
			proof: { statut: 200, urlFinale: candidate.verifiedUrl! },
		};
		const service = webServiceFromVerifiedWebsite(row, candidate.ip!, consultedAt, REGISTRY_IDENTIFIER_SOURCE);
		return service ? [service] : [];
	});
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		source: "data.inclusion SIRET / OSM ref:FR:FINESS; HTTP 200; DNS A",
		attribution: "data.inclusion (Licence Ouverte 2.0) and OpenStreetMap contributors (ODbL)",
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
		const result = await collectRegistryIdentifierServices();
		console.log(
			`Public registry web services: ${result.examined} candidates, ${result.eligible} eligible, ` +
				`${result.selected} selected, ${result.verified} HTTP 200, ${result.written} written`,
		);
	} finally {
		await closePools();
	}
}
