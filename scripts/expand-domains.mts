/**
 * Adds HTTP-verified domains with provenance to Nouvelle-Aquitaine organisations.
 *
 * Candidates come from a public Wikidata P856 export (SIREN, site, QID); no
 * paid service and no victim data are used. Every candidate must resolve to
 * the same domain root, serve a real page and contain a distinctive token of
 * the organisation. Nothing is written unless --apply is given.
 *
 * Usage (DATABASE_URL selects the database):
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains.mts \
 *       --candidates=bench/domain-candidates/wikidata-siren-sites.tsv \
 *       --limit=100 [--concurrency=16] [--apply]
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { inNouvelleAquitaine, measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS } from "./domain-coverage.mts";

export interface Candidate {
	siren: string;
	url: string;
	qid: string;
}

export interface Organisation {
	id: number;
	name: string;
	city: string | null;
	dept: string | null;
	siren: string | null;
	domain: string | null;
}

export interface Selection {
	candidate: Candidate;
	organisation: Organisation;
	domain: string;
}

export interface Verdict {
	ok: boolean;
	motif: string;
	token: string | null;
	confidence: number;
	title: string | null;
	status: number | null;
	finalUrl: string | null;
	htmlLength: number;
}

export const GENERIC_TOKENS = new Set([
	"mairie", "ville", "commune", "departement", "region", "association", "societe",
	"entreprise", "services", "service", "groupe", "centre", "office", "syndicat",
]);

/** Parses one tab-separated Wikidata export row. */
export function parseCandidate(line: string): Candidate | null {
	const parts = line.trim().split("\t");
	if (parts.length < 3) return null;
	const [rawSiren, url, qid] = parts;
	if (!/^\d{1,9}$/.test(rawSiren ?? "") || !/^https?:\/\//i.test(url ?? "") || !/^Q\d+$/.test(qid ?? "")) return null;
	return { siren: rawSiren.padStart(9, "0"), url, qid };
}

/** Validates a candidate URL and returns its canonical domain root. */
export function domainRoot(url: string): string | null {
	let host: string;
	try {
		host = new URL(url).hostname;
	} catch {
		return null;
	}
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
	return normalizeDomain(host);
}

/** Accent-free words of at least four letters that can identify an organisation. */
export function distinctiveTokens(name: string, city: string | null): string[] {
	const plain = `${name} ${city ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	return [...new Set(plain.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !GENERIC_TOKENS.has(word)))];
}

/** Joins candidates to missing-domain organisations, one candidate per SIREN. */
export function selectCandidates(candidates: Candidate[], organisations: Organisation[]): Selection[] {
	const bySiren = new Map<string, Organisation>();
	for (const organisation of organisations) {
		if (!organisation.siren || !inNouvelleAquitaine(organisation.dept)) continue;
		if (normalizeDomain(organisation.domain)) continue;
		if (!bySiren.has(organisation.siren)) bySiren.set(organisation.siren, organisation);
	}
	const selected: Selection[] = [];
	const used = new Set<number>();
	for (const candidate of candidates) {
		const organisation = bySiren.get(candidate.siren);
		const domain = domainRoot(candidate.url);
		if (!organisation || !domain || used.has(organisation.id)) continue;
		used.add(organisation.id);
		selected.push({ candidate, organisation, domain });
	}
	return selected;
}

/** Accepts a page only on HTTP 200, same root, real content and a name token. */
export function pageVerdict(
	html: string,
	status: number,
	finalUrl: string,
	organisation: Organisation,
	expectedRoot: string,
): Verdict {
	const base: Verdict = {
		ok: false, motif: "", token: null, confidence: 0,
		title: null, status, finalUrl, htmlLength: html.length,
	};
	if (status !== 200) return { ...base, motif: "http-not-200" };
	if (normalizeDomain(finalUrl) !== expectedRoot) return { ...base, motif: "redirect-off-root" };
	const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ")
		.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
	if (text.length < 150) return { ...base, motif: "content-too-short" };
	if (/\b(domain (is )?for sale|domaine a vendre|sedo|parking page|buy this domain)\b/i.test(text)) {
		return { ...base, motif: "parking-page" };
	}
	const tokens = distinctiveTokens(organisation.name, organisation.city);
	const nameToken = tokens.find((token) => !distinctiveTokens(organisation.city ?? "", null).includes(token));
	const found = nameToken && new RegExp(`\\b${nameToken}\\b`).test(text)
		? nameToken
		: tokens.find((token) => new RegExp(`\\b${token}\\b`).test(text));
	if (!found) return { ...base, motif: "no-distinctive-token" };
	const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? null;
	return {
		ok: true, motif: "http200-title-and-body", token: found, htmlLength: html.length,
		confidence: found === nameToken ? 0.95 : 0.85, title, status, finalUrl,
	};
}

/** Provenance row exactly matching the org_enrichissement contract. */
export function provenanceFor(selection: Selection, verdict: Verdict) {
	return {
		source: "wikidata:P856:http200",
		confiance: verdict.confidence,
		preuve: {
			qid: selection.candidate.qid,
			siren: selection.candidate.siren,
			source: "wikidata:P856",
			urlItem: `https://www.wikidata.org/wiki/${selection.candidate.qid}`,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: verdict.motif,
		},
	};
}

export async function fetchPage(url: string): Promise<{ html: string; status: number; finalUrl: string }> {
	const response = await fetch(url, {
		redirect: "follow",
		signal: AbortSignal.timeout(5000),
		headers: { "user-agent": "RadarCyberNA/1.3 (domain-verification; public sources only)" },
	});
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
		finalUrl: response.url || url,
	};
}

export async function withConcurrency<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let cursor = 0;
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await work(items[index]);
		}
	}));
	return results;
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "100")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "16"))));
	const outputPath = option("output", "bench/results/domains-from-wikidata.json");
	const candidatesPath = option("candidates", "bench/domain-candidates/wikidata-siren-sites.tsv");
	const lines = (await readFile(candidatesPath, "utf8")).split("\n");
	const candidates = lines.map(parseCandidate).filter((candidate): candidate is Candidate => candidate !== null);
	const before = await measure();
	let accepted: Array<Selection & { verdict: Verdict }> = [];
	let examined = 0;
	{
		const candidateSirens = [...new Set(candidates.map((candidate) => candidate.siren))];
		const orgs = await query<Organisation>(`
			SELECT id, name, city, dept, siren, domain FROM org
			WHERE dept = ANY($1::text[]) AND siren = ANY($2::text[])
			  AND (domain IS NULL OR btrim(domain) = '')
		`, [[...NOUVELLE_AQUITAINE_DEPTS], candidateSirens]);
		const selected = selectCandidates(candidates, orgs.rows).slice(0, limit);
		examined = selected.length;
		const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
			try {
				const page = await fetchPage(selection.candidate.url);
				return pageVerdict(page.html, page.status, page.finalUrl, selection.organisation, selection.domain);
			} catch (error) {
				return {
					ok: false, motif: `fetch-${error instanceof Error ? error.name : "error"}`,
					token: null, confidence: 0, title: null, status: null, finalUrl: null, htmlLength: 0,
				} satisfies Verdict;
			}
		});
		accepted = selected
			.map((selection, index) => ({ ...selection, verdict: verdicts[index] }))
			.filter((entry) => entry.verdict.ok);

		if (apply && accepted.length) {
			await withTransaction(async (client) => {
				for (const entry of accepted) {
					const proof = provenanceFor(entry, entry.verdict);
					await client.query(
						"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
						[entry.organisation.id, entry.domain, entry.candidate.url],
					);
					await client.query(
						`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
						 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
						 ON CONFLICT (org_id, champ) DO NOTHING`,
						[entry.organisation.id, entry.domain, proof.source, proof.confiance, JSON.stringify(proof.preuve)],
					);
				}
			});
		}
	}

	const after = await measure();
	const report = {
		candidates: candidates.length,
		examined,
		accepted: accepted.length,
		applied: apply,
		before,
		after,
		domains: accepted.map((entry) => ({
			orgId: entry.organisation.id,
			siren: entry.candidate.siren,
			domain: entry.domain,
			qid: entry.candidate.qid,
			confidence: entry.verdict.confidence,
		})),
	};
	await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`candidates=${candidates.length} examined=${examined} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
