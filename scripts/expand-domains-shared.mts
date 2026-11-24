/**
 * Neuvième source grise : les pages dédiées d'un site de groupe déjà attribué
 * à une autre organisation. Une racine peut servir plusieurs établissements
 * à condition que chaque page réponde HTTP 200, reste sur la même racine et
 * porte un jeton distinctif de l'organisation dans son URL et son contenu.
 * Aucune écriture n'a lieu sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-shared.mts \
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

export const SOURCE = "exposition-service:page-dediee:http200";

/** Establishment words that cannot by themselves identify one organisation. */
export const NON_SPECIFIC_TOKENS = new Set([
	"ehpad", "hopital", "residence", "etablissement", "etablissements", "service", "services",
	"maison", "accueil", "centre", "personnes", "agees", "medico", "social", "specialise",
	"saint", "sainte", "association", "groupe", "structure", "unite", "pôle", "pole",
]);

export interface SharedResult {
	verdict: Verdict;
	url: string;
	tried: string[];
}

/** A shared root is accepted only when its address itself names the organisation. */
export function isDedicatedPageUrl(name: string, city: string | null, url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	const hostLabels = parsed.hostname.split(".").filter((label) => label && label !== "www");
	const subdomain = hostLabels.slice(0, -2).join(" ");
	let path: string;
	try {
		path = decodeURIComponent(parsed.pathname);
	} catch {
		path = parsed.pathname;
	}
	const surface = `${subdomain} ${path}`
		.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	return distinctiveTokens(name, city).some(
		(token) => token.length >= 5 && !NON_SPECIFIC_TOKENS.has(token) && surface.includes(token),
	);
}

/** One dedicated page per organisation, even when its domain is already attributed. */
export function selectSharedCandidates(rows: ExpositionRow[]): ExpositionSelection[] {
	const usedOrgs = new Set<number>();
	const usedUrls = new Set<string>();
	const selected: ExpositionSelection[] = [];
	for (const row of rows) {
		if (!TRUSTED_SOURCES.has(row.source) || usedOrgs.has(row.orgId)) continue;
		if (!inNouvelleAquitaine(row.dept)) continue;
		const domain = normalizeDomain(row.evidenceDomain);
		if (!domain || PLATFORM_ROOTS.has(domain) || domainRoot(row.sourceUrl) !== domain) continue;
		if (!isDedicatedPageUrl(row.name, row.city, row.sourceUrl) || usedUrls.has(row.sourceUrl)) continue;
		usedOrgs.add(row.orgId);
		usedUrls.add(row.sourceUrl);
		selected.push({
			row,
			organisation: {
				id: row.orgId, name: row.name, city: row.city, dept: row.dept, siren: row.siren, domain: row.evidenceDomain,
			},
			domain,
		});
	}
	return selected;
}

/** Tries the official URL variants but keeps only a dedicated, strictly verified page. */
export async function verifySharedCandidate(
	selection: ExpositionSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<SharedResult | null> {
	const tried: string[] = [];
	for (const url of retryUrls(selection.row.sourceUrl)) {
		tried.push(url);
		if (!isDedicatedPageUrl(selection.organisation.name, selection.organisation.city, url)) continue;
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		if (!isDedicatedPageUrl(selection.organisation.name, selection.organisation.city, page.finalUrl)) continue;
		const verdict = pageVerdict(
			page.html, page.status, page.finalUrl, selection.organisation, selection.domain,
		);
		if (verdict.ok) return { verdict, url, tried };
	}
	return null;
}

/** Provenance row tied to the dedicated page and the registry evidence. */
export function provenanceForShared(selection: ExpositionSelection, result: SharedResult) {
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
			urlDediee: true,
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
	const outputPath = option("output", "bench/results/domains-from-shared-pages.json");
	const before = await measure();
	const existing = await query<{ orgId: number }>("SELECT org_id AS \"orgId\" FROM org_enrichissement WHERE champ = 'domaine'");
	const alreadyProven = new Set(existing.rows.map((row) => row.orgId));
	const selected = selectSharedCandidates(await expositionCandidates())
		.filter((entry) => !alreadyProven.has(entry.organisation.id))
		.slice(0, limit);
	const results = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifySharedCandidate(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: ExpositionSelection; result: SharedResult } => !!entry.result);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForShared(entry.selection, entry.result);
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
