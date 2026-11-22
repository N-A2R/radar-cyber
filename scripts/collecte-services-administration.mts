#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures web services declared by the national administration directory.
 *
 * The public Service-public.fr API is free and key-less. Only SIREN, INSEE
 * commune code and declared websites are read. Each website is probed once
 * (HEAD, GET fallback), must answer HTTP 200 on its own domain and resolve to
 * a public IPv4 address. Organisations are joined by SIREN or INSEE code; no
 * name, address, email or phone number is copied into a report.
 *
 * Usage:
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-administration.mts \
 *     [--input=/tmp/annuaire-administration.json] --limit=300 [--offset=0] [--apply] \
 *     [--only-missing] --report=bench/results/services-administration-2026-11-22.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	ADMINISTRATION_SOURCE,
	administrationCandidate,
	type AdministrationCandidate,
} from "../apps/api/src/exposition/administration-site.js";
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
const API_URL = "https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/exports/json";
const ATTRIBUTION = "Service-public.fr — Annuaire de l'administration (DILA)";

type Candidate = AdministrationCandidate & { verifiedUrl?: string; finalHost?: string; ip?: string };
type Matched = Candidate & { orgId: number };

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

/** Reads the public API, or a previously downloaded export, without storing personal fields. */
async function readCandidates(input: string): Promise<Candidate[]> {
	let rows: unknown;
	if (input) {
		rows = JSON.parse(await readFile(input, "utf8"));
	} else {
		const url = new URL(API_URL);
		url.searchParams.set("select", "siren,siret,code_insee_commune,site_internet");
		url.searchParams.set("where", "siren IS NOT NULL AND site_internet IS NOT NULL");
		const response = await fetch(url, {
			signal: AbortSignal.timeout(50_000),
			headers: { "user-agent": "RadarCyberNA/1.9 (public administration site verification)" },
		});
		if (!response.ok) throw new Error(`administration directory HTTP ${response.status}`);
		rows = await response.json();
	}
	if (!Array.isArray(rows)) throw new Error("administration directory export is not an array");
	const candidates = new Map<string, Candidate>();
	for (const raw of rows) {
		const candidate = administrationCandidate(raw as never, DEPARTMENTS);
		if (!candidate) continue;
		const key = `${candidate.siren}|${candidate.insee}|${candidate.domain}`;
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

/** Joins by public SIREN or INSEE commune code, excluding already measured organisations. */
async function matchableOrganisations(
	candidates: readonly Candidate[],
	onlyMissing: boolean,
): Promise<{ bySiren: Map<string, { id: number; dept: string }>; byInsee: Map<string, { id: number; dept: string }> }> {
	const missing = onlyMissing
		? `AND NOT EXISTS (SELECT 1 FROM exposition_service s WHERE s.org_id = o.id)`
		: "";
	const bySiren = new Map<string, { id: number; dept: string }>();
	const byInsee = new Map<string, { id: number; dept: string }>();
	const sirens = [...new Set(candidates.map((candidate) => candidate.siren))];
	const insees = [...new Set(candidates.map((candidate) => candidate.insee))];
	for (let index = 0; index < sirens.length; index += 500) {
		const rows = await query<{ id: number; siren: string; dept: string | null }>(
			`SELECT o.id, o.siren, o.dept FROM org o
			 WHERE o.siren = ANY($1::text[]) AND o.dept = ANY($2::text[]) ${missing}`,
			[sirens.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) if (row.dept) bySiren.set(row.siren, { id: row.id, dept: row.dept });
	}
	for (let index = 0; index < insees.length; index += 500) {
		const rows = await query<{ id: number; insee: string; dept: string | null }>(
			`SELECT o.id, o.entity_code AS insee, o.dept FROM org o
			 WHERE o.entity_code = ANY($1::text[]) AND o.dept = ANY($2::text[]) ${missing}`,
			[insees.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) if (row.dept) byInsee.set(row.insee, { id: row.id, dept: row.dept });
	}
	return { bySiren, byInsee };
}

async function verifyWebsite(url: string, declaredDomain: string): Promise<{ finalUrl: string; finalHost: string } | null> {
	try {
		let response = await fetch(url, {
			method: "HEAD",
			redirect: "follow",
			signal: AbortSignal.timeout(5000),
			headers: { "user-agent": "RadarCyberNA/1.9 (public administration site verification)" },
		});
		if (response.status === 405 || response.status === 403) {
			await response.body?.cancel();
			response = await fetch(url, {
				redirect: "follow",
				signal: AbortSignal.timeout(5000),
				headers: { "user-agent": "RadarCyberNA/1.9 (public administration site verification)" },
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

export async function collectAdministrationServices(): Promise<{
	examined: number; eligible: number; selected: number; verified: number; written: number;
}> {
	const apply = process.argv.includes("--apply");
	const onlyMissing = process.argv.includes("--only-missing");
	const input = option("input", "");
	const limit = Math.max(1, Number(option("limit", "300")));
	const offset = Math.max(0, Number(option("offset", "0")));
	const concurrency = Math.max(1, Math.min(128, Number(option("concurrency", "96"))));
	const report = option("report", "bench/results/services-administration-2026-11-22.json");
	const consultedAt = new Date();

	const candidates = await readCandidates(input);
	const examined = candidates.length;
	const matches = await matchableOrganisations(candidates, onlyMissing);
	const eligible = candidates.filter((candidate) =>
		matches.bySiren.has(candidate.siren) || matches.byInsee.has(candidate.insee));
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
		const org = matches.bySiren.get(candidate.siren) ?? matches.byInsee.get(candidate.insee);
		if (!org) continue;
		const key = `${org.id}|${candidate.domain}`;
		if (seen.has(key)) continue;
		seen.add(key);
		matched.push({ ...candidate, orgId: org.id });
	}
	const services: WebService[] = matched.flatMap((candidate) => {
		const row: VerifiedWebsiteRow = {
			orgId: candidate.orgId,
			dept: candidate.dept,
			domain: candidate.finalHost ?? candidate.domain,
			source: `annuaire-administration:${candidate.siren}`,
			confidence: 0.8,
			proof: { statut: 200, urlFinale: candidate.verifiedUrl! },
		};
		const service = webServiceFromVerifiedWebsite(row, candidate.ip!, consultedAt, ADMINISTRATION_SOURCE);
		return service ? [service] : [];
	});
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		source: "service-public.fr:api-lannuaire-administration; SIREN/INSEE; HTTP 200; DNS A",
		attribution: ATTRIBUTION,
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
			siren: candidate.siren,
			insee: candidate.insee,
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
		const result = await collectAdministrationServices();
		console.log(
			`Administration web services: ${result.examined} candidates, ${result.eligible} eligible, ` +
				`${result.selected} selected, ${result.verified} HTTP 200, ${result.written} written`,
		);
	} finally {
		await closePools();
	}
}
