/**
 * Onzième route grise : les variantes de protocole et de préfixe www d'une URL
 * officielle déjà prouvée HTTP 200 par un registre public/gratuit. Les passes
 * précédentes n'essayaient qu'une seule variante (http -> https ou ajout de
 * www) et manquaient les sites qui ne répondent qu'en http, ou qu'avec/www
 * sur une URL https. Chaque variante garde la racine officielle du registre et
 * doit passer la preuve stricte inchangée : statut 200, racine identique après
 * redirection, contenu réel, jeton distinctif du nom dans l'URL et la page.
 * Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-variantes.mts \
 *       [--limit=2000] [--concurrency=24] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { query, closePools, withTransaction } from "../apps/api/src/db.js";
import { measure } from "./domain-coverage.mts";
import { pageVerdict, withConcurrency, type Verdict } from "./expand-domains.mts";
import { expositionCandidates, type ExpositionSelection } from "./expand-domains-exposition.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";
import { isDedicatedPageUrl, selectSharedCandidates } from "./expand-domains-shared.mts";
import { isNamedDomainUrl, selectNamedDomainCandidates } from "./expand-domains-domain-label.mts";

export const SOURCE = "exposition-service:variante-hote:http200";
export const MAX_VARIANTS = 8;

export interface VariantResult {
	verdict: Verdict;
	url: string;
	tried: string[];
}

/** All protocol and www combinations of the very same official host. */
export function hostVariants(url: string): string[] {
	const variants = new Set<string>();
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return [url];
	}
	const host = parsed.hostname.replace(/^www\./, "");
	for (const protocol of ["https:", "http:"]) {
		for (const hostname of [host, `www.${host}`]) {
			parsed.protocol = protocol;
			parsed.hostname = hostname;
			variants.add(parsed.toString());
		}
	}
	return [...variants].slice(0, MAX_VARIANTS);
}

/** An official URL qualifies when its registrable label or its page names the organisation. */
export function namesOrganisation(selection: ExpositionSelection, url: string): boolean {
	const { name, city } = selection.organisation;
	return isNamedDomainUrl(name, city, url) || isDedicatedPageUrl(name, city, url);
}

/** One candidate per organisation, named root first, then dedicated page. */
export function selectVariantCandidates(rows: Parameters<typeof selectNamedDomainCandidates>[0]): ExpositionSelection[] {
	const selected = new Map<number, ExpositionSelection>();
	for (const entry of [...selectNamedDomainCandidates(rows), ...selectSharedCandidates(rows)]) {
		if (!selected.has(entry.organisation.id)) selected.set(entry.organisation.id, entry);
	}
	return [...selected.values()];
}

/** Keeps the first answering variant that also passes the unchanged strict proof. */
export async function verifyVariant(
	selection: ExpositionSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<VariantResult | null> {
	const tried: string[] = [];
	for (const url of hostVariants(selection.row.sourceUrl)) {
		if (!namesOrganisation(selection, url)) continue;
		tried.push(url);
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		if (!namesOrganisation(selection, page.finalUrl)) continue;
		const verdict = pageVerdict(
			page.html, page.status, page.finalUrl, selection.organisation, selection.domain,
		);
		if (verdict.ok) return { verdict, url, tried };
	}
	return null;
}

/** Provenance tied to the registry URL and to the variant that actually answered. */
export function provenanceForVariant(selection: ExpositionSelection, result: VariantResult) {
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

/** Remaining official URLs without any domain proof, from the trusted registries. */
export async function variantCandidates(): Promise<ExpositionSelection[]> {
	const proven = await query<{ orgId: number }>(
		"SELECT org_id AS \"orgId\" FROM org_enrichissement WHERE champ = 'domaine'",
	);
	const alreadyProven = new Set(proven.rows.map((row) => row.orgId));
	return selectVariantCandidates(await expositionCandidates())
		.filter((entry) => !alreadyProven.has(entry.organisation.id));
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "2000")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "24"))));
	const outputPath = option("output", "bench/results/domains-from-host-variants.json");
	const before = await measure();
	const selected = (await variantCandidates()).slice(0, limit);
	const results = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyVariant(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: ExpositionSelection; result: VariantResult } => !!entry.result);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForVariant(entry.selection, entry.result);
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
