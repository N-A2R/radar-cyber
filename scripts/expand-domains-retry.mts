/**
 * Huitième source grise : les URL d'exposition déjà prouvées HTTP 200 qui
 * n'ont pas pu être revérifiées lors des trois premières passes sont retentées
 * avec un délai plus long et les variantes www/http du même hôte officiel.
 *
 * La preuve reste stricte : statut 200, racine inchangée après redirection,
 * page de plus de 150 caractères et jeton distinctif du nom de l'organisation.
 * Aucune écriture sans --apply ; aucune autre source n'est inventée.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-retry.mts \
 *       [--limit=2000] [--concurrency=32] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, withTransaction } from "../apps/api/src/db.js";
import { measure } from "./domain-coverage.mts";
import { pageVerdict, withConcurrency, type Verdict } from "./expand-domains.mts";
import {
	attributedDomains, expositionCandidates, selectExpositionCandidates,
	type ExpositionSelection,
} from "./expand-domains-exposition.mts";

export const SOURCE = "exposition-service:retry:http200";
export const TIMEOUT_MS = 15_000;

export interface PageFetch {
	(url: string): Promise<{ html: string; status: number; finalUrl: string }>;
}

export interface RetryResult {
	verdict: Verdict;
	url: string;
	tried: string[];
}

/** Same official host, tried in the order most likely to answer. */
export function retryUrls(sourceUrl: string): string[] {
	const urls = [sourceUrl];
	try {
		const url = new URL(sourceUrl);
		if (url.protocol === "http:") {
			url.protocol = "https:";
			urls.push(url.toString());
		} else if (!url.hostname.startsWith("www.")) {
			url.hostname = `www.${url.hostname}`;
			urls.push(url.toString());
		} else {
			url.hostname = url.hostname.slice(4);
			urls.push(url.toString());
		}
	} catch {
		// An unparsable URL is still tried as-is; pageVerdict rejects it.
	}
	return [...new Set(urls)];
}

/** Live HTTP check with a longer budget than the initial collection passes. */
export const fetchRetryPage: PageFetch = async (url) => {
	const response = await fetch(url, {
		redirect: "follow",
		signal: AbortSignal.timeout(TIMEOUT_MS),
		headers: { "user-agent": "RadarCyberNA/1.4 (domain-verification; public sources only)" },
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
};

/** Tries the variants in order and keeps the first strictly verified page. */
export async function verifyWithRetry(
	selection: ExpositionSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<RetryResult | null> {
	const tried: string[] = [];
	for (const url of retryUrls(selection.row.sourceUrl)) {
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

/** Provenance row tied to the registry URL and the URL that actually answered. */
export function provenanceForRetry(selection: ExpositionSelection, result: RetryResult) {
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
			statut: result.verdict.status,
			urlFinale: result.verdict.finalUrl,
			titre: result.verdict.title,
			token: result.verdict.token,
			motif: result.verdict.motif,
		},
	};
}

/** All remaining HTTP-200 registry URLs without a domain are eligible. */
export async function retryCandidates(): Promise<ExpositionSelection[]> {
	return selectExpositionCandidates(await expositionCandidates(), await attributedDomains());
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "2000")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "32"))));
	const outputPath = option("output", "bench/results/domains-from-exposition-retry.json");
	const before = await measure();
	const selected = (await retryCandidates()).slice(0, limit);
	const results = await withConcurrency(selected, concurrency, (selection) => verifyWithRetry(selection));
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: ExpositionSelection; result: RetryResult } => entry.result !== null);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForRetry(entry.selection, entry.result);
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
	const report = {
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
			urlReponse: entry.result.url,
			confidence: entry.result.verdict.confidence,
		})),
	};
	await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
