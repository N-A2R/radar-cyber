/**
 * Quinzième route grise : les pages d'identité publiées sur le racine d'un site
 * déjà prouvé HTTP 200 par un registre public/gratuit. Les passes précédentes
 * ne vérifiaient que la page d'accueil ou la mention légale : une organisation
 * peut publier son nom sur sa page contact ou sa page à propos sans le publier
 * en accueil. Chaque page garde la même racine et passe la preuve stricte
 * inchangée (statut 200, racine stable après redirection, contenu réel, jeton
 * distinctif du nom). Aucune écriture sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-pages-identite.mts \
 *       [--limit=2000] [--concurrency=24] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, withTransaction } from "../apps/api/src/db.js";
import { measure } from "./domain-coverage.mts";
import { pageVerdict, withConcurrency, type Verdict } from "./expand-domains.mts";
import type { ExpositionSelection } from "./expand-domains-exposition.mts";
import { fetchRetryPage, retryCandidates, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "exposition-service:page-identite:http200";

/** Conventional identity pages on the same root, never a third-party host. */
export const IDENTITY_PATHS = [
	"/contact", "/contact/", "/a-propos", "/qui-sommes-nous", "/presentation",
] as const;

export interface IdentityPageResult {
	verdict: Verdict;
	url: string;
	tried: string[];
}

/** Builds candidate URLs from the registered root, not from the registry path. */
export function identityPageUrls(
	domain: string,
	paths: readonly string[] = IDENTITY_PATHS,
): string[] {
	return paths.map((path) => `https://${domain}${path}`);
}

/** Keeps the first identity page that passes the unchanged strict proof. */
export async function verifyIdentityPage(
	selection: ExpositionSelection,
	fetcher: PageFetch = fetchRetryPage,
	paths: readonly string[] = IDENTITY_PATHS,
): Promise<IdentityPageResult | null> {
	const tried: string[] = [];
	for (const url of identityPageUrls(selection.domain, paths)) {
		tried.push(url);
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		const verdict = pageVerdict(
			page.html, page.status, page.finalUrl, selection.organisation, selection.domain,
		);
		if (verdict.ok) return { verdict, url, tried };
	}
	return null;
}

/** Provenance naming the registry URL and the identity page that answered. */
export function provenanceForIdentityPage(selection: ExpositionSelection, result: IdentityPageResult) {
	return {
		source: SOURCE,
		confiance: result.verdict.confidence,
		preuve: {
			serviceId: selection.row.serviceId,
			registre: selection.row.source,
			provider: selection.row.provider,
			urlSource: selection.row.sourceUrl,
			urlReponse: result.url,
			pagesTestees: result.tried.length,
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
	const limit = Math.max(1, Number(option("limit", "2000")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "24"))));
	const outputPath = option("output", "bench/results/domains-from-pages-identite.json");
	const before = await measure();
	const selected = (await retryCandidates()).slice(0, limit);
	const results = await withConcurrency(selected, concurrency, (selection) => verifyIdentityPage(selection));
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: ExpositionSelection; result: IdentityPageResult } => !!entry.result);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForIdentityPage(entry.selection, entry.result);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.organisation.id, entry.selection.domain, entry.selection.row.sourceUrl],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO UPDATE SET
					   valeur = EXCLUDED.valeur, source = EXCLUDED.source,
					   confiance = EXCLUDED.confiance, preuve = EXCLUDED.preuve, verifie_at = now()`,
					[entry.selection.organisation.id, entry.selection.domain, proof.source, proof.confiance, JSON.stringify(proof.preuve)],
				);
			}
		});
	}
	const after = await measure();
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length,
		verified: accepted.length,
		applied: apply,
		before,
		after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			siren: entry.selection.organisation.siren,
			name: entry.selection.organisation.name,
			domain: entry.selection.domain,
			registry: entry.selection.row.source,
			page: entry.result.url,
			token: entry.result.verdict.token,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
