#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures web services declared by the Ministry of National Education
 * establishment directory (Licence Ouverte Etalab, no key, no payment).
 *
 * Only UAI, SIRET, department and declared website are read from the public
 * CSV. Each website is probed once (HEAD, GET fallback), must answer HTTP 200
 * on its own domain and resolve to a public IPv4 address. The establishment is
 * joined by its UAI to `org.entity_code`; no name, address, email or phone is
 * stored anywhere in the report.
 *
 * Usage:
 *   curl -o /tmp/education-na.csv \
 *     'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/exports/csv?use_labels=true'
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-education.mts \
 *     --input=/tmp/education-na.csv --limit=300 [--offset=0] [--apply] [--only-missing] \
 *     --report=bench/results/services-education-2026-11-22.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { normalizeDomainValue } from "../apps/api/src/match/domaine.js";
import {
	EDUCATION_SOURCE,
	educationCandidate,
	type EducationCandidate,
	type EducationRow,
} from "../apps/api/src/exposition/education-site.js";
import { parseRnaCsvLine, rnaRowFromLine } from "../apps/api/src/exposition/rna-site.js";
import {
	enregistrerServicesWeb,
	isPublicIpv4,
	measureExposition,
	webServiceFromVerifiedWebsite,
	type VerifiedWebsiteRow,
	type WebService,
} from "../apps/api/src/exposition/web-service.js";

const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];

type Candidate = EducationCandidate & { verifiedUrl?: string; ip?: string };
type Matched = Candidate & { orgId: number };

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

/** Reads declared websites from the public CSV; contact columns are never read. */
async function readCandidates(input: string): Promise<Candidate[]> {
	const lines = (await readFile(input, "utf8")).split("\n");
	const header = parseRnaCsvLine(lines[0] ?? "").map((name) => name.replace(/^\uFEFF/, ""));
	const candidates = new Map<string, Candidate>();
	for (const line of lines.slice(1)) {
		if (!line.trim()) continue;
		const row = rnaRowFromLine(line, header) as EducationRow;
		const candidate = educationCandidate(row, DEPARTMENTS);
		if (!candidate) continue;
		const key = `${candidate.uai}|${candidate.domain}`;
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

async function matchableOrganisations(
	candidates: readonly Candidate[],
	onlyMissing: boolean,
): Promise<Map<string, { id: number; dept: string }>> {
	const missing = onlyMissing
		? `AND NOT EXISTS (SELECT 1 FROM exposition_service s WHERE s.org_id = o.id)`
		: "";
	const uais = [...new Set(candidates.map((candidate) => candidate.uai))];
	const matches = new Map<string, { id: number; dept: string }>();
	for (let index = 0; index < uais.length; index += 500) {
		const rows = await query<{ id: number; uai: string; dept: string | null }>(
			`SELECT o.id, o.entity_code AS uai, o.dept
			 FROM org o
			 WHERE o.entity_code = ANY($1::text[]) AND o.entity_source = 'annuaire-education'
			   AND o.dept = ANY($2::text[]) ${missing}`,
			[uais.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) {
			if (row.dept) matches.set(row.uai, { id: row.id, dept: row.dept });
		}
	}
	return matches;
}

async function verifyWebsite(url: string, domain: string): Promise<string | null> {
	try {
		let response = await fetch(url, {
			method: "HEAD",
			redirect: "follow",
			signal: AbortSignal.timeout(5000),
			headers: { "user-agent": "RadarCyberNA/1.8 (public education site verification)" },
		});
		if (response.status === 405 || response.status === 403) {
			await response.body?.cancel();
			response = await fetch(url, {
				redirect: "follow",
				signal: AbortSignal.timeout(5000),
				headers: { "user-agent": "RadarCyberNA/1.8 (public education site verification)" },
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

export async function collectEducationServices(): Promise<{
	examined: number; eligible: number; selected: number; verified: number; written: number;
}> {
	const apply = process.argv.includes("--apply");
	const onlyMissing = process.argv.includes("--only-missing");
	const input = option("input", "");
	if (!input) throw new Error("--input=<education directory CSV> is required");
	const limit = Math.max(1, Number(option("limit", "300")));
	const offset = Math.max(0, Number(option("offset", "0")));
	const concurrency = Math.max(1, Math.min(128, Number(option("concurrency", "96"))));
	const report = option("report", "bench/results/services-education-2026-11-22.json");
	const consultedAt = new Date();

	const candidates = await readCandidates(input);
	const examined = candidates.length;
	const matches = await matchableOrganisations(candidates, onlyMissing);
	const eligible = candidates.filter((candidate) => matches.has(candidate.uai));
	const selected = eligible.slice(offset, offset + limit);
	const checked = await withConcurrency<Candidate, Candidate | null>(selected, concurrency, async (candidate) => {
		const verifiedUrl = await verifyWebsite(candidate.website, candidate.domain);
		if (!verifiedUrl) return null;
		const ip = await resolveIp(candidate.domain);
		return ip ? { ...candidate, verifiedUrl, ip } : null;
	});
	const verified = checked.filter((candidate): candidate is Candidate => candidate !== null);
	const matched: Matched[] = verified.flatMap((candidate) => {
		const org = matches.get(candidate.uai);
		return org ? [{ ...candidate, orgId: org.id }] : [];
	});
	const services: WebService[] = matched.flatMap((candidate) => {
		const row: VerifiedWebsiteRow = {
			orgId: candidate.orgId,
			dept: candidate.dept,
			domain: candidate.domain,
			source: `annuaire-education:${candidate.uai}`,
			confidence: 0.8,
			proof: { statut: 200, urlFinale: candidate.verifiedUrl! },
		};
		const service = webServiceFromVerifiedWebsite(row, candidate.ip!, consultedAt, EDUCATION_SOURCE);
		return service ? [service] : [];
	});
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		source: "education.gouv.fr:UAI; declared web; HTTP 200; DNS A",
		licence: "Licence Ouverte v2.0 (Etalab)",
		attribution: "Ministère de l'Éducation nationale — annuaire des établissements",
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
			uai: candidate.uai,
			dept: candidate.dept,
			domain: candidate.domain,
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
		const result = await collectEducationServices();
		console.log(
			`Education web services: ${result.examined} candidates, ${result.eligible} eligible, ` +
				`${result.selected} selected, ${result.verified} HTTP 200, ${result.written} written`,
		);
	} finally {
		await closePools();
	}
}
