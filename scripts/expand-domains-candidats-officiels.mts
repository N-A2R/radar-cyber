/**
 * Full-corpus second pass over the versioned Wikidata P856 candidate files.
 * Earlier passes stopped at fixed limits; this one examines the remaining
 * exact-label matches. A candidate is kept only when the official Wikidata
 * API still publishes its URL, when every HTTP hop stays on a public RFC
 * hostname, and when the live page passes the unchanged strict proof.
 * Nothing is guessed and nothing is written without --apply.
 *
 * Usage:
 *   DATABASE_URL=... apps/api/node_modules/.bin/tsx \
 *     scripts/expand-domains-candidats-officiels.mts \
 *     [--limit=80] [--concurrency=8] [--apply]
 */
import { lookup } from "node:dns/promises";
import { readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	inNouvelleAquitaine, measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import {
	distinctiveTokens, pageVerdict, withConcurrency, type Verdict,
} from "./expand-domains.mts";

export const SOURCE = "wikidata:P856:candidats-officiels:http200";
export const CANDIDATE_FILES = [
	"wikidata-na-sites.tsv",
	"wikidata-na-hq-sites.tsv",
] as const;
export const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
export const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const BLOCKED_SUFFIXES: Record<string, true> = {
	".local": true, ".localhost": true, ".internal": true, ".test": true,
	".invalid": true, ".example": true, ".home.arpa": true,
};

export interface OfficialCandidate {
	qid: string;
	url: string;
	label: string;
	corpus: string;
}

export interface Organisation {
	id: number;
	name: string;
	city: string | null;
	dept: string | null;
	siren: string | null;
}

export interface OfficialSelection {
	candidate: OfficialCandidate;
	organisation: Organisation;
	domain: string;
	officialUrl: string;
}

export interface PageResult {
	html: string;
	status: number;
	finalUrl: string;
	hops: number;
}

export interface SelectionResult {
	selections: OfficialSelection[];
	refusals: Record<string, number>;
}

export type VerificationResult =
	| { verdict: Verdict; hops: number }
	| { refusal: string };

/** Normalisation identical to the one used for corpus labels. */
export function nameKey(value: string): string {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** One tab-separated versioned candidate row, never a constructed URL. */
export function parseCandidate(line: string, corpus: string): OfficialCandidate | null {
	const parts = line.trim().split("\t");
	if (parts.length < 3) return null;
	const [qid, url, label] = parts;
	if (!/^Q\d+$/.test(qid ?? "") || !/^https?:\/\//i.test(url ?? "")
		|| typeof label !== "string" || nameKey(label).length < 2) return null;
	return { qid, url, label: label.trim(), corpus };
}

/** RFC-shaped public hostname: no IP literal, credentials, port or special-use suffix. */
export function publicHostname(url: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.port) return null;
	const host = parsed.hostname.toLowerCase();
	if (!host || host.endsWith(".") || isIP(host)) return null;
	if (Object.keys(BLOCKED_SUFFIXES).some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))) return null;
	if (!host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
	return normalizeDomain(host);
}

/** Private, loopback, link-local, CGNAT, documentation and reserved ranges. */
export function isPrivateAddress(address: string): boolean {
	const value = address.toLowerCase().split("%")[0];
	if (isIP(value) === 4) {
		const [a, b] = value.split(".").map(Number);
		return a === 0 || a === 10 || a === 127 || a >= 224
			|| (a === 100 && b >= 64 && b <= 127)
			|| (a === 169 && b === 254)
			|| (a === 172 && b >= 16 && b <= 31)
			|| (a === 192 && (b === 0 || b === 168))
			|| (a === 198 && (b === 18 || b === 19))
			|| (a === 198 && b === 51) || (a === 203 && b === 0);
	}
	if (isIP(value) !== 6) return true;
	if (value === "::" || value === "::1") return true;
	const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
	if (mapped) return isPrivateAddress(mapped[1]);
	if (/^2001:0db8:/.test(value) || /^0*fe[89ab]/.test(value) || /^0*f[cd]/.test(value)) return true;
	return /^0*ff/.test(value);
}

/** All resolved addresses must be public: one private answer rejects the host. */
export async function resolvesToPublicHost(
	host: string,
	dnsLookup: typeof lookup = lookup,
): Promise<boolean> {
	try {
		const addresses = await dnsLookup(host, { all: true, verbatim: true });
		return addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address));
	} catch {
		return false;
	}
}

/** Live HTTP with manual redirects so every hop can be validated before use. */
export async function fetchOfficialPage(
	rawUrl: string,
	options: {
		dnsLookup?: typeof lookup;
		fetcher?: typeof fetch;
		timeoutMs?: number;
	} = {},
): Promise<PageResult> {
	const dnsLookup = options.dnsLookup ?? lookup;
	const fetcher = options.fetcher ?? fetch;
	let current = rawUrl;
	for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
		const host = publicHostname(current);
		if (!host || !(await resolvesToPublicHost(host, dnsLookup))) {
			throw new Error("unsafe-hostname");
		}
		const response = await fetcher(current, {
			redirect: "manual",
			signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
			headers: { "user-agent": "RadarCyberNA/2.0 (official Wikidata candidate verification)" },
		});
		const location = response.headers.get("location");
		if ([301, 302, 303, 307, 308].includes(response.status) && location) {
			await response.body?.cancel();
			current = new URL(location, current).toString();
			continue;
		}
		const reader = response.body?.getReader();
		const chunks: Uint8Array[] = [];
		let size = 0;
		if (reader) {
			while (size < 400_000) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				size += value.byteLength;
			}
			await reader.cancel();
		}
		return {
			html: Buffer.concat(chunks).toString("utf8"),
			status: response.status,
			finalUrl: current,
			hops: hop,
		};
	}
	throw new Error("too-many-redirects");
}

/** Current P856 claims from the official Wikidata API, batched by 50 items. */
export async function confirmP856(
	qids: string[],
	fetcher: (url: string) => Promise<{ html: string; status: number }> = async (url) => {
		const page = await fetchOfficialPage(url);
		return { html: page.html, status: page.status };
	},
): Promise<Map<string, string[]>> {
	const confirmed = new Map<string, string[]>();
	for (let index = 0; index < qids.length; index += 50) {
		const ids = qids.slice(index, index + 50).join("|");
		const url = `${WIKIDATA_API}?action=wbgetentities&ids=${encodeURIComponent(ids)}&props=claims&format=json`;
		try {
			const page = await fetcher(url);
			if (page.status !== 200) continue;
			const entities = JSON.parse(page.html).entities as Record<string, {
				claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
			}>;
			for (const [qid, entity] of Object.entries(entities)) {
				const urls = (entity.claims?.P856 ?? [])
					.map((claim) => claim.mainsnak?.datavalue?.value)
					.filter((value): value is string => typeof value === "string");
				if (urls.length) confirmed.set(qid, urls);
			}
		} catch {
			// A failed API batch confirms nothing; those candidates are refused.
		}
	}
	return confirmed;
}

/** Compare a versioned URL with the URL currently published by Wikidata. */
export function matchesOfficialUrl(candidateUrl: string, officialUrls: string[]): string | null {
	let candidate: URL;
	try {
		candidate = new URL(candidateUrl);
	} catch {
		return null;
	}
	const candidateKey = `${candidate.hostname.toLowerCase()}${candidate.pathname.replace(/\/$/, "")}`;
	for (const official of officialUrls) {
		let parsed: URL;
		try {
			parsed = new URL(official);
		} catch {
			continue;
		}
		const officialKey = `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, "")}`;
		if (candidateKey === officialKey) return official;
	}
	return null;
}
export function selectOfficialCandidates(
	candidates: OfficialCandidate[],
	organisations: Organisation[],
	attributedDomains: ReadonlySet<string>,
	attributedQids: ReadonlySet<string>,
	confirmed: ReadonlyMap<string, string[]>,
	options: {
		requireConfirmation?: boolean;
		prefilteredQids?: ReadonlySet<string>;
	} = {},
): SelectionResult {
	const requireConfirmation = options.requireConfirmation !== false;
	const refusals: Record<string, number> = {};
	const refuse = (motif: string): void => {
		refusals[motif] = (refusals[motif] ?? 0) + 1;
	};
	const byName = new Map<string, Organisation[]>();
	for (const organisation of organisations) {
		if (!inNouvelleAquitaine(organisation.dept) || normalizeDomain(organisation.domain)) continue;
		const key = nameKey(organisation.name);
		byName.set(key, [...(byName.get(key) ?? []), organisation]);
	}
	const selections: OfficialSelection[] = [];
	const usedOrgs = new Set<number>();
	const usedRoots = new Set<string>();
	const usedQids = new Set<string>();
	for (const candidate of candidates) {
		if (options.prefilteredQids && !options.prefilteredQids.has(candidate.qid)) {
			refuse("not-prefiltered");
			continue;
		}
		const host = publicHostname(candidate.url);
		if (!host) {
			refuse("invalid-public-hostname");
			continue;
		}
		const root = normalizeDomain(host)!;
		let officialUrl = "";
		if (requireConfirmation) {
			const official = confirmed.get(candidate.qid);
			if (!official) {
				refuse("wikidata-claim-unconfirmed");
				continue;
			}
			officialUrl = matchesOfficialUrl(candidate.url, official) ?? "";
			if (!officialUrl) {
				refuse("wikidata-url-mismatch");
				continue;
			}
		}
		if (attributedQids.has(candidate.qid) || usedQids.has(candidate.qid)) {
			refuse("qid-already-attributed");
			continue;
		}
		if (attributedDomains.has(root) || usedRoots.has(root)) {
			refuse("domain-already-attributed");
			continue;
		}
		const matches = byName.get(nameKey(candidate.label)) ?? [];
		if (matches.length !== 1) {
			refuse(matches.length ? "ambiguous-organisation" : "no-organisation-match");
			continue;
		}
		const organisation = matches[0];
		if (usedOrgs.has(organisation.id)) {
			refuse("organisation-already-selected");
			continue;
		}
		let parsed: URL;
		try {
			parsed = new URL(candidate.url);
		} catch {
			refuse("invalid-public-hostname");
			continue;
		}
		const anchor = `${parsed.hostname} ${parsed.pathname}`.toLowerCase().replace(/[^a-z0-9]+/g, " ");
		const token = distinctiveTokens(candidate.label, organisation.city)
			.find((word) => anchor.includes(word));
		if (!token) {
			refuse("label-not-in-official-url");
			continue;
		}
		usedOrgs.add(organisation.id);
		usedRoots.add(root);
		usedQids.add(candidate.qid);
		selections.push({ candidate, organisation, domain: root, officialUrl });
	}
	return { selections, refusals };
}

/** Strict unchanged proof tied to the versioned candidate and its official claim. */
export async function verifySelection(
	selection: OfficialSelection,
	options: Parameters<typeof fetchOfficialPage>[1] = {},
): Promise<VerificationResult> {
	try {
		const page = await fetchOfficialPage(selection.candidate.url, options);
		const verdict = pageVerdict(
			page.html, page.status, page.finalUrl, selection.organisation, selection.domain,
		);
		return verdict.ok ? { verdict, hops: page.hops } : { refusal: verdict.motif };
	} catch (error) {
		return { refusal: `fetch-${error instanceof Error ? error.message : "error"}` };
	}
}

/** Provenance row consumed by the domain-coverage measurement. */
export function provenanceFor(
	selection: OfficialSelection,
	verdict: Verdict,
	hops: number,
) {
	return {
		source: SOURCE,
		confiance: verdict.confidence,
		preuve: {
			qid: selection.candidate.qid,
			corpus: selection.candidate.corpus,
			urlVersionnee: selection.candidate.url,
			urlWikidata: `https://www.wikidata.org/wiki/${selection.candidate.qid}`,
			urlP856: selection.officialUrl,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: `${verdict.motif}:candidat-officiel-http200`,
			redirections: hops,
			verifieLe: new Date().toISOString(),
		},
	};
}

async function readCandidates(dir: string): Promise<OfficialCandidate[]> {
	const candidates: OfficialCandidate[] = [];
	for (const file of CANDIDATE_FILES) {
		const content = await readFile(`${dir}/${file}`, "utf8");
		for (const line of content.split("\n")) {
			const candidate = parseCandidate(line, file);
			if (candidate) candidates.push(candidate);
		}
	}
	return candidates;
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "80")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "8"))));
	const outputPath = option("output", "bench/results/domains-from-candidats-officiels.json");
	const candidatesDir = option("candidates-dir", "bench/domain-candidates");
	const before = await measure();
	const candidates = await readCandidates(candidatesDir);
	const keys = [...new Set(candidates.map((candidate) => nameKey(candidate.label)))];
	const organisations = (await query<Organisation>(`
		SELECT id, name, city, dept, siren FROM org
		WHERE dept = ANY($1::text[])
		  AND regexp_replace(translate(lower(name), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaac' || 'eeee' || 'iiii' || 'n' || 'ooooo' || 'uuuu' || 'yy'), '[^a-z0-9]+', ' ', 'g') = ANY($2::text[])
	`, [[...NOUVELLE_AQUITAINE_DEPTS], keys])).rows;
	const attributedDomains = new Set((await query<{ domain: string }>(
		"SELECT lower(domain) AS domain FROM org WHERE domain IS NOT NULL AND btrim(domain) <> ''",
	)).rows.map((row) => normalizeDomain(row.domain)).filter((domain): domain is string => !!domain));
	const attributedQids = new Set((await query<{ qid: string }>(`
		SELECT DISTINCT preuve->>'qid' AS qid FROM org_enrichissement
		WHERE champ = 'domaine' AND preuve ? 'qid'
	`)).rows.map((row) => row.qid));
	const prefiltered = selectOfficialCandidates(
		candidates, organisations, attributedDomains, attributedQids, new Map(),
		{ requireConfirmation: false },
	);
	const qids = [...new Set(prefiltered.selections.map((item) => item.candidate.qid))];
	const confirmed = await confirmP856(qids);
	const selection = selectOfficialCandidates(
		candidates, organisations, attributedDomains, attributedQids, confirmed,
		{ prefilteredQids: new Set(qids) },
	);
	const selected = selection.selections.slice(0, limit);
	const results = await withConcurrency(selected, concurrency, (item) => verifySelection(item));
	const accepted = selected
		.map((item, index) => ({ selection: item, result: results[index] }))
		.filter((entry): entry is {
			selection: OfficialSelection;
			result: { verdict: Verdict; hops: number };
		} => "verdict" in entry.result);
	const verdictRefusals: Record<string, number> = {};
	results.forEach((result) => {
		if ("refusal" in result) {
			verdictRefusals[result.refusal] = (verdictRefusals[result.refusal] ?? 0) + 1;
		}
	});
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceFor(entry.selection, entry.result.verdict, entry.result.hops);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.organisation.id, entry.selection.domain, entry.selection.candidate.url],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO NOTHING`,
					[
						entry.selection.organisation.id, entry.selection.domain,
						proof.source, proof.confiance, JSON.stringify(proof.preuve),
					],
				);
			}
		});
	}
	const after = await measure();
	const report = {
		source: SOURCE,
		candidates: candidates.length,
		prefiltered: prefiltered.selections.length,
		wikidataClaimsConfirmed: confirmed.size,
		selected: selected.length,
		verified: accepted.length,
		applied: apply,
		refusals: { ...selection.refusals, ...verdictRefusals },
		before,
		after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			name: entry.selection.organisation.name,
			siren: entry.selection.organisation.siren,
			domain: entry.selection.domain,
			qid: entry.selection.candidate.qid,
			urlVersionnee: entry.selection.candidate.url,
			urlP856: entry.selection.officialUrl,
			urlFinale: entry.result.verdict.finalUrl,
			statut: entry.result.verdict.status,
			token: entry.result.verdict.token,
			confidence: entry.result.verdict.confidence,
			redirections: entry.result.hops,
		})),
	};
	await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(
		`candidates=${candidates.length} selected=${selected.length} verified=${accepted.length} ` +
		`refusals=${JSON.stringify(report.refusals)} applied=${apply}`,
	);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	await closePools();
}
