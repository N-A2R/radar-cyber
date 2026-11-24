/**
 * Tenth grey route: an official domain whose own label names the organisation.
 * Earlier routes only looked for a name in a subdomain or a path, so a commune
 * on `aussac-vadalle.fr` was skipped when another organisation already held
 * that root. The same strict HTTP proof is required: status 200, no redirect
 * off the root, real content and a distinctive token of the organisation.
 * Nothing is written without --apply.
 *
 * Usage (DATABASE_URL selects the database):
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-domain-label.mts \
 *       [--limit=1000] [--concurrency=32] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { inNouvelleAquitaine, measure, normalizeDomain } from "./domain-coverage.mts";
import {
	distinctiveTokens, domainRoot, pageVerdict, withConcurrency, type Verdict,
} from "./expand-domains.mts";
import {
	PLATFORM_ROOTS, TRUSTED_SOURCES, expositionCandidates,
	type ExpositionRow, type ExpositionSelection,
} from "./expand-domains-exposition.mts";
import { fetchRetryPage, retryUrls, type PageFetch } from "./expand-domains-retry.mts";
import { NON_SPECIFIC_TOKENS } from "./expand-domains-shared.mts";

export const SOURCE = "exposition-service:domaine-nomme:http200";

export interface NamedDomainResult {
	verdict: Verdict;
	url: string;
	tried: string[];
}

/** The registrable labels themselves, not only a subdomain or path, can name an organisation. */
export function isNamedDomainUrl(name: string, city: string | null, url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	const labels = parsed.hostname.split(".").filter((label) => label && label !== "www");
	let path: string;
	try {
		path = decodeURIComponent(parsed.pathname);
	} catch {
		path = parsed.pathname;
	}
	const surface = `${labels.slice(0, -1).join(" ")} ${path}`
		.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	return distinctiveTokens(name, city).some(
		(token) => token.length >= 5 && !NON_SPECIFIC_TOKENS.has(token) && surface.includes(token),
	);
}

/** One named-domain page per organisation, even when the root is already attributed. */
export function selectNamedDomainCandidates(rows: ExpositionRow[]): ExpositionSelection[] {
	const usedOrgs = new Set<number>();
	const usedUrls = new Set<string>();
	const selected: ExpositionSelection[] = [];
	for (const row of rows) {
		if (!TRUSTED_SOURCES.has(row.source) || usedOrgs.has(row.orgId)) continue;
		if (!inNouvelleAquitaine(row.dept)) continue;
		const domain = domainRoot(row.sourceUrl);
		if (!domain || PLATFORM_ROOTS.has(domain) || normalizeDomain(row.evidenceDomain) !== domain) continue;
		if (!isNamedDomainUrl(row.name, row.city, row.sourceUrl) || usedUrls.has(row.sourceUrl)) continue;
		usedOrgs.add(row.orgId);
		usedUrls.add(row.sourceUrl);
		selected.push({
			row,
			organisation: {
				id: row.orgId, name: row.name, city: row.city, dept: row.dept, siren: row.siren,
			},
			domain,
		});
	}
	return selected;
}


/** Tries the official URL variants but keeps only a named, strictly verified page. */
export async function verifyNamedDomain(
	selection: ExpositionSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<NamedDomainResult | null> {
	const { name, city } = selection.organisation;
	const tried: string[] = [];
	for (const url of retryUrls(selection.row.sourceUrl)) {
		tried.push(url);
		if (!isNamedDomainUrl(name, city, url)) continue;
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		if (!isNamedDomainUrl(name, city, page.finalUrl)) continue;
		const verdict = pageVerdict(
			page.html, page.status, page.finalUrl, selection.organisation, selection.domain,
		);
		if (verdict.ok) return { verdict, url, tried };
	}
	return null;
}

/** Provenance row tied to the official registry URL and the answering page. */
export function provenanceForNamedDomain(selection: ExpositionSelection, result: NamedDomainResult) {
	return {
		source: SOURCE,
		confiance: result.verdict.confidence,
		preuve: {
			serviceId: selection.row.serviceId,
			registre: selection.row.source,
			provider: selection.row.provider,
			urlSource: selection.row.sourceUrl,
			urlReponse: result.url,
			tentatives: result.tried.length,
			domaineNommant: true,
			statut: result.verdict.status,
			urlFinale: result.verdict.finalUrl,
			titre: result.verdict.title,
			token: result.verdict.token,
			motif: result.verdict.motif,
		},
	};
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "1000")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "32"))));
	const outputPath = option("output", "bench/results/domains-from-domain-label.json");
	const before = await measure();
	const existing = await query<{ orgId: number }>(
		"SELECT org_id AS \"orgId\" FROM org_enrichissement WHERE champ = 'domaine'",
	);
	const alreadyProven = new Set(existing.rows.map((row) => row.orgId));
	const selected = selectNamedDomainCandidates(await expositionCandidates())
		.filter((entry) => !alreadyProven.has(entry.organisation.id))
		.slice(0, limit);
	const results = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyNamedDomain(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: ExpositionSelection; result: NamedDomainResult } => !!entry.result);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForNamedDomain(entry.selection, entry.result);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.organisation.id, entry.selection.domain, entry.result.url],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO NOTHING`,
					[entry.selection.organisation.id, entry.selection.domain, proof.source, proof.confiance, JSON.stringify(proof.preuve)],
				);
			}
		});
	}
	const after = await measure();
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length, verified: accepted.length, applied: apply, before, after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			siren: entry.selection.organisation.siren,
			name: entry.selection.organisation.name,
			domain: entry.selection.domain,
			page: entry.result.url,
			registry: entry.selection.row.source,
			confidence: entry.result.verdict.confidence,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
