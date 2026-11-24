/**
 * Quatorzième route grise : les variantes de protocole et de préfixe www d'un
 * domaine déclaré par un alias SIRENE public. Les passes précédentes ne
 * tentaient que `https://<domaine>/` et manquaient les sites qui ne répondent
 * qu'en http ou seulement avec le préfixe www. Chaque variante garde la même
 * racine et passe la preuve stricte inchangée : statut 200, racine stable
 * après redirection, contenu réel, identité publiée par le site lui-même
 * (jeton distinctif du nom ou identifiant légal). Aucune écriture sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-alias-variantes.mts \
 *       [--limit=1200] [--concurrency=24] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, withTransaction } from "../apps/api/src/db.js";
import { measure } from "./domain-coverage.mts";
import { withConcurrency } from "./expand-domains.mts";
import {
	aliasDomainVerdict, aliasRows, attributedDomains, provenanceForAliasDomain,
	selectAliasDomains, type AliasDomainSelection, type AliasDomainVerdict,
} from "./expand-domains-alias-domaine.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";
import { hostVariants } from "./expand-domains-variantes.mts";

export const SOURCE = "sirene:alias-domaine:variante-hote:http200";

export interface AliasVariantResult {
	verdict: AliasDomainVerdict;
	url: string;
	tried: string[];
}

/** The four protocol/www combinations of the alias root, same host only. */
export function aliasHostVariants(domain: string): string[] {
	return hostVariants(`https://${domain}/`);
}

/** Keeps the first answering variant that passes the unchanged strict proof. */
export async function verifyAliasVariant(
	selection: AliasDomainSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<AliasVariantResult | null> {
	const tried: string[] = [];
	for (const url of aliasHostVariants(selection.domain)) {
		tried.push(url);
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		const verdict = aliasDomainVerdict(page.html, page.status, page.finalUrl, selection);
		if (verdict.ok) return { verdict, url, tried };
	}
	return null;
}

/** Provenance naming the SIRENE alias and the variant that actually answered. */
export function provenanceForAliasVariant(selection: AliasDomainSelection, result: AliasVariantResult) {
	const proof = provenanceForAliasDomain(selection, result.verdict);
	return {
		source: SOURCE,
		confiance: proof.confiance,
		preuve: {
			...proof.preuve,
			urlReponse: result.url,
			tentatives: result.tried.length,
		},
	};
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "1200")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "24"))));
	const outputPath = option("output", "bench/results/domains-from-alias-variantes.json");
	const before = await measure();
	const selected = selectAliasDomains(await aliasRows(), await attributedDomains()).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyAliasVariant(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, result: verdicts[index] }))
		.filter((entry): entry is { selection: AliasDomainSelection; result: AliasVariantResult } => !!entry.result);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForAliasVariant(entry.selection, entry.result);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.row.orgId, entry.selection.domain, proof.preuve.urlSource],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO NOTHING`,
					[
						entry.selection.row.orgId, entry.selection.domain,
						proof.source, proof.confiance, JSON.stringify(proof.preuve),
					],
				);
			}
		});
	}
	const after = await measure();
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length, verified: accepted.length, applied: apply, before, after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.row.orgId,
			name: entry.selection.row.name,
			alias: entry.selection.row.alias,
			domain: entry.selection.domain,
			page: entry.result.url,
			identity: entry.result.verdict.identity,
			tried: entry.result.tried,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
