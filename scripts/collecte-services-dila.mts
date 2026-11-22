#!/usr/bin/env -S apps/api/node_modules/.bin/tsx
/**
 * Measures web services declared by the Service-public.fr local administration
 * directory (DILA "Base de données locales", licence ouverte).
 *
 * Only SIRET, postal code and declared website are read. Each website is
 * probed once (HEAD, GET fallback), must answer 200 on its own domain and
 * resolve to a public IPv4 address. The SIREN is joined to `org.siren`; no
 * person, email, phone or directory description is stored.
 *
 * Usage:
 *   curl -o /tmp/dila.tar.bz2 \
 *     https://lecomarquage.service-public.gouv.fr/donnees_locales_v4/all_latest.tar.bz2
 *   tar -xjf /tmp/dila.tar.bz2 -C /tmp --wildcards '*data.gouv_local.json'
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/collecte-services-dila.mts \
 *     --dump=/tmp/2026-11-21_033017-data.gouv_local.json \
 *     --limit=400 [--offset=0] [--apply] [--only-missing] \
 *     --report=bench/results/services-dila-2026-11-22.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolve4 } from "node:dns/promises";
import { pathToFileURL } from "node:url";
import { closePools, query } from "../apps/api/src/db.js";
import {
	DILA_SOURCE,
	dilaCandidate,
	type DilaCandidate,
	type DilaService,
} from "../apps/api/src/exposition/dila-local.js";
import { normalizeDomainValue } from "../apps/api/src/match/domaine.js";
import {
	enregistrerServicesWeb,
	isPublicIpv4,
	measureExposition,
	webServiceFromVerifiedWebsite,
	type VerifiedWebsiteRow,
	type WebService,
} from "../apps/api/src/exposition/web-service.js";

const DEPARTMENTS = ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"];
const SERVICE_MARKER = '"service" : [';

type Candidate = DilaCandidate & { verifiedUrl?: string; ip?: string };
type VerifiedCandidate = DilaCandidate & {
	verifiedUrl: string;
	ip: string;
	orgId: number;
	dept: string;
};
type OrgMatch = { id: number; dept: string };

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

/** Splits the pretty-printed DILA export into individual service entries. */
export function parseDilaServices(raw: string): DilaService[] {
	const start = raw.indexOf(SERVICE_MARKER);
	const end = raw.lastIndexOf("]");
	if (start < 0 || end <= start) return [];
	const body = raw.slice(start + SERVICE_MARKER.length, end);
	const services: DilaService[] = [];
	for (const chunk of body.split("\n  }, {\n")) {
		try {
			services.push(JSON.parse(`{${chunk}}`) as DilaService);
		} catch {
			// A malformed entry is never a service observation.
		}
	}
	return services;
}

async function readCandidates(dump: string): Promise<DilaCandidate[]> {
	const raw = await readFile(dump, "utf8");
	const seen = new Set<string>();
	const candidates: DilaCandidate[] = [];
	for (const service of parseDilaServices(raw)) {
		const candidate = dilaCandidate(service, DEPARTMENTS);
		if (!candidate || seen.has(candidate.siren)) continue;
		seen.add(candidate.siren);
		candidates.push(candidate);
	}
	return candidates;
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

async function matchableOrganisations(
	candidates: readonly DilaCandidate[],
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

export async function collectDilaServices(): Promise<{
	examined: number;
	eligible: number;
	verified: number;
	matched: number;
	written: number;
}> {
	const apply = process.argv.includes("--apply");
	const onlyMissing = process.argv.includes("--only-missing");
	const limit = Math.max(1, Number(option("limit", "400")));
	const offset = Math.max(0, Number(option("offset", "0")));

	const report = option("report", "bench/results/services-dila-2026-11-22.json");
	const dump = option("dump", "");
	if (!dump) throw new Error("--dump=<DILA JSON file> is required");
	const consultedAt = new Date();

	let candidates: Candidate[] = await readCandidates(dump);
	const examined = candidates.length;
	const eligibleMatches = await matchableOrganisations(candidates, onlyMissing);
	candidates = candidates.filter((candidate) => eligibleMatches.has(candidate.siren));
	const eligible = candidates.length;
	const selected = candidates.slice(offset, offset + limit);


	const checked = await withConcurrency<Candidate, Candidate | null>(selected, 64, async (candidate) => {
		if (candidate.verifiedUrl && candidate.ip) return candidate;
		const verifiedUrl = await verifyWebsite(candidate.website, candidate.domain);
		if (!verifiedUrl) return null;
		const ip = await resolveIp(candidate.domain);
		return ip ? { ...candidate, verifiedUrl, ip } : null;
	});
	const verified = checked.filter(
		(candidate): candidate is DilaCandidate & { verifiedUrl: string; ip: string } => candidate !== null,
	);
	const matched = verified.flatMap((candidate) => {
		const org = eligibleMatches.get(candidate.siren);
		return org ? [{ ...candidate, orgId: org.id, dept: org.dept }] : [];
	});
	const services: WebService[] = matched.flatMap((candidate) => {
		const row: VerifiedWebsiteRow = {
			orgId: candidate.orgId,
			dept: candidate.dept,
			domain: candidate.domain,
			source: `dila:${candidate.siren}`,
			confidence: 0.8,
			proof: { statut: 200, urlFinale: candidate.verifiedUrl },
		};
		const service = webServiceFromVerifiedWebsite(row, candidate.ip, consultedAt, DILA_SOURCE);
		return service ? [service] : [];
	});
	const written = apply ? await enregistrerServicesWeb(services) : 0;
	const measurement = await measureExposition();
	await mkdir(dirname(report), { recursive: true });
	await writeFile(report, `${JSON.stringify({
		consultedAt: consultedAt.toISOString(),
		source: "service-public.fr:base-locales; siret; http-200; dns A",
		licence: "Licence ouverte (data.gouv.fr)",
		attribution: "Direction de l'information légale et administrative (Premier ministre)",
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
	return { examined, eligible, verified: verified.length, matched: matched.length, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		const result = await collectDilaServices();
		console.log(
			`DILA web services: ${result.examined} candidates, ${result.eligible} eligible, ` +
				`${result.verified} HTTP 200, ${result.matched} matched, ${result.written} written`,
		);
	} finally {
		await closePools();
	}
}
