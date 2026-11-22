#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures web services declared by the national association register (RNA).
 *
 * Only `siret`, `adrs_codepostal` and `siteweb` are read. Each website is
 * probed once (HEAD, GET fallback), must answer 200 on its own domain and
 * resolve to a public IPv4 address. The SIREN is joined to `org.siren`; no
 * association name, officer, email or phone is stored.
 *
 * Usage:
 *   unzip -j -o /tmp/rna_waldec.zip 'rna_waldec_*_dpt_*.csv' -d /tmp/rna-csv
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-rna.mts \
 *     --input=/tmp/rna-csv --limit=300 [--apply] [--only-missing] \
 *     --report=bench/results/services-rna-2026-11-22.json
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import { normalizeDomainValue } from "../apps/api/src/match/domaine.js";
import {
	RNA_SOURCE,
	parseRnaCsvLine,
	rnaCandidate,
	rnaRowFromLine,
} from "../apps/api/src/exposition/rna-site.js";
import type { PublicSiteCandidate } from "../apps/api/src/exposition/public-site.js";
import {
	enregistrerServicesWeb,
	isPublicIpv4,
	measureExposition,
	webServiceFromVerifiedWebsite,
	type VerifiedWebsiteRow,
	type WebService,
} from "../apps/api/src/exposition/web-service.js";

const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const SOURCE = RNA_SOURCE;

type Candidate = PublicSiteCandidate & { verifiedUrl?: string; ip?: string };

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

/** Reads the department CSV files extracted from the public RNA Waldec archive. */
async function readRnaCandidates(directory: string): Promise<Candidate[]> {
	const files = (await readdir(directory)).filter((name) => name.endsWith(".csv")).sort();
	const candidates: Candidate[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		const lines = (await readFile(join(directory, file), "utf8")).split("\n");
		const names = parseRnaCsvLine(lines[0] ?? "");
		for (const line of lines.slice(1)) {
			if (!line.trim()) continue;
			const row = rnaRowFromLine(line, names);
			const candidate = rnaCandidate(row, DEPARTMENTS);
			if (!candidate) continue;
			const key = `${candidate.siren}|${candidate.domain}`;
			if (seen.has(key)) continue;
			seen.add(key);
			candidates.push(candidate);
		}
	}
	return candidates;
}


async function verifyWebsite(url: string, domain: string): Promise<string | null> {
	try {
		let response = await fetch(url, {
			method: "HEAD",
			redirect: "follow",
			signal: AbortSignal.timeout(5000),
			headers: { "user-agent": "RadarCyberNA/1.6 (public registry web service verification)" },
		});
		if (response.status === 405 || response.status === 403) {
			await response.body?.cancel();
			response = await fetch(url, {
				redirect: "follow",
				signal: AbortSignal.timeout(5000),
				headers: { "user-agent": "RadarCyberNA/1.6 (public registry web service verification)" },
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

type OrgMatch = { id: number; dept: string };

/** Joins only organisations in Nouvelle-Aquitaine, optionally skipping measured ones. */
async function matchableOrganisations(
	candidates: readonly Candidate[],
	onlyMissing: boolean,
): Promise<Map<string, OrgMatch[]>> {
	const sirens = [...new Set(candidates.map((candidate) => candidate.siren))];
	const sql = onlyMissing
		? `SELECT o.id, o.dept, o.siren FROM org o
		   WHERE o.siren = ANY($1::text[]) AND o.dept = ANY($2::text[])
		     AND NOT EXISTS (SELECT 1 FROM exposition_service s WHERE s.org_id = o.id)`
		: `SELECT o.id, o.dept, o.siren FROM org o
		   WHERE o.siren = ANY($1::text[]) AND o.dept = ANY($2::text[])`;
	const matches = new Map<string, OrgMatch[]>();
	for (let index = 0; index < sirens.length; index += 500) {
		const rows = await query<{ id: number; dept: string | null; siren: string }>(
			sql,
			[sirens.slice(index, index + 500), DEPARTMENTS],
		);
		for (const row of rows.rows) {
			if (!row.dept) continue;
			const list = matches.get(row.siren) ?? [];
			list.push({ id: row.id, dept: row.dept });
			matches.set(row.siren, list);
		}
	}
	return matches;
}

function chooseOrg(candidate: Candidate, matches: Map<string, OrgMatch[]>): OrgMatch | null {
	const list = matches.get(candidate.siren) ?? [];
	return list.find((org) => org.dept === candidate.dept) ?? list[0] ?? null;
}

export async function collectPublicRegistryServices(): Promise<{
	examined: number; eligible: number; verified: number; matched: number; written: number;
}> {
	const apply = process.argv.includes("--apply");
	const onlyMissing = process.argv.includes("--only-missing");
	const input = option("input", "");
	if (!input) throw new Error("--input=<RNA department CSV directory> is required");
	const limit = Math.max(1, Number(option("limit", "300")));
	const offset = Math.max(0, Number(option("offset", "0")));
	const concurrency = Math.max(1, Math.min(128, Number(option("concurrency", "96"))));
	const report = option("report", "bench/results/services-rna-2026-11-22.json");
	const consultedAt = new Date();

	const candidates = await readRnaCandidates(input);
	const examined = candidates.length;
	const matches = await matchableOrganisations(candidates, onlyMissing);
	candidates = candidates.filter((candidate) => chooseOrg(candidate, matches) !== null);
	const eligible = candidates.length;
	const selected = candidates.slice(offset, offset + limit);

	const checked = await withConcurrency<Candidate, Candidate | null>(selected, concurrency, async (candidate) => {
		const verifiedUrl = await verifyWebsite(candidate.website, candidate.domain);
		if (!verifiedUrl) return null;
		const ip = await resolveIp(candidate.domain);
		return ip ? { ...candidate, verifiedUrl, ip } : null;
	});
	const verified = checked.filter((candidate): candidate is Candidate => candidate !== null);
	const matched = verified.flatMap((candidate) => {
		const org = chooseOrg(candidate, matches);
		return org ? [{ ...candidate, orgId: org.id, dept: org.dept }] : [];
	});
	const services: WebService[] = matched.flatMap((candidate) => {
		const row: VerifiedWebsiteRow = {
			orgId: candidate.orgId,
			dept: candidate.dept,
			domain: candidate.domain,
			source: `rna:${candidate.siren}`,
			confidence: 0.8,
			proof: { statut: 200, urlFinale: candidate.verifiedUrl! },
		};
		const service = webServiceFromVerifiedWebsite(row, candidate.ip!, consultedAt, SOURCE);
		return service ? [service] : [];
	});
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		source: "interieur.gouv.fr:RNA-waldec; siret; http-200; dns A",
		licence: "Licence ouverte (data.gouv.fr)",
		attribution: "Ministère de l'Intérieur (RNA)",
		applied: apply,
		onlyMissing,
		examined,
		eligible,
		selected: selected.length,
		verified: verified.length,
		matched: matched.length,
		written,
		measurement,
		candidates: matched.map((candidate) => ({
			siren: candidate.siren, domain: candidate.domain, orgId: candidate.orgId,
			dept: candidate.dept, ip: candidate.ip, sourceUrl: candidate.verifiedUrl,
		})),
	}, null, 2)}\n`);
	return {
		examined,
		eligible,
		verified: verified.length,
		matched: matched.length,
		written,
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const result = await collectPublicRegistryServices();
		console.log(
			`Public registry web services: ${result.examined} candidates, ${result.eligible} eligible, ` +
				`${result.verified} HTTP 200, ${result.matched} matched, ${result.written} written`,
		);
	} finally {
		await closePools();
	}
}
