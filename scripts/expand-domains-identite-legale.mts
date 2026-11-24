/**
 * Seizième route grise : les pages d'identité et les mentions légales publiées
 * sur la racine d'un site déjà prouvé HTTP 200 par un registre public/gratuit.
 * Les passes précédentes vérifiaient soit la page d'accueil (t9), cinq pages
 * d'identité (t22), soit l'identifiant légal sur une page dédiée (t18a) : cette
 * passe croise les deux réservoirs sans rien inventer. Une page n'est acceptée
 * que si elle publie le SIREN exact de l'organisation (au plus trois
 * identifiants, pour écarter les annuaires) ou un jeton distinctif de son nom.
 * La preuve HTTP reste stricte : statut 200, racine stable après redirection,
 * contenu réel, aucune page de parking. Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-identite-legale.mts \
 *       [--limit=2000] [--concurrency=32] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, withTransaction } from "../apps/api/src/db.js";
import { measure } from "./domain-coverage.mts";
import { withConcurrency } from "./expand-domains.mts";
import { retryCandidates, fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";
import {
	aliasDomainVerdict, type AliasDomainSelection,
	type AliasDomainVerdict,
} from "./expand-domains-alias-domaine.mts";
import type { ExpositionSelection } from "./expand-domains-exposition.mts";
import { pageIdentifiers } from "./expand-domains-identifiant.mts";

export const SOURCE = "exposition-service:identite-legale:http200";
export const LEGAL_PATHS = [
	"/mentions-legales", "/mentions", "/legal", "/contactez-nous", "/nous-contacter",
	"/a-propos/", "/entreprise", "/informations-legales", "/contact.html", "/about",
] as const;

export interface LegalPageResult {
	verdict: AliasDomainVerdict;
	url: string;
	tried: string[];
}

/** The same root, with conventional identity paths, never a third-party host. */
export function legalPageUrls(domain: string, paths: readonly string[] = LEGAL_PATHS): string[] {
	return paths.map((path) => `https://${domain}${path}`);
}

/** A registry row becomes a public-identifier anchor, never a personal alias. */
export function legalSelection(selection: ExpositionSelection): AliasDomainSelection | null {
	const identifier = selection.organisation.siren;
	if (!identifier || !/^\d{9,14}$/.test(identifier)) return null;
	return {
		row: {
			orgId: selection.organisation.id,
			name: selection.organisation.name,
			city: selection.organisation.city,
			dept: selection.organisation.dept,
			identifier,
			alias: selection.row.sourceUrl,
			aliasSource: selection.row.source,
		},
		domain: selection.domain,
		identityToken: null,
	};
}

/**
 * Keeps the first identity page published by the site itself with an unchanged
 * strict proof. An identifier is accepted only when the page lists at most
 * three of them, so a public directory cannot validate an organisation.
 */
export async function verifyLegalPage(
	selection: ExpositionSelection,
	fetcher: PageFetch = fetchRetryPage,
	paths: readonly string[] = LEGAL_PATHS,
): Promise<LegalPageResult | null> {
	const anchor = legalSelection(selection);
	if (!anchor) return null;
	const tried: string[] = [];
	for (const url of legalPageUrls(selection.domain, paths)) {
		tried.push(url);
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		const verdict = aliasDomainVerdict(page.html, page.status, page.finalUrl, anchor);
		if (!verdict.ok) continue;
		if (verdict.motif === "http200-published-identifier"
			&& pageIdentifiers(page.html, anchor.row.identifier!.length).size > 3) continue;
		return { verdict, url, tried };
	}
	return null;
}

/** Provenance tying the registry URL, the answering page and the legal anchor. */
export function provenanceForLegalPage(selection: ExpositionSelection, result: LegalPageResult) {
	return {
		source: SOURCE,
		confiance: 0.9,
		preuve: {
			serviceId: selection.row.serviceId,
			registre: selection.row.source,
			urlSource: selection.row.sourceUrl,
			urlReponse: result.url,
			pagesTestees: result.tried.length,
			statut: result.verdict.status,
			urlFinale: result.verdict.finalUrl,
			titre: result.verdict.title,
			identite: result.verdict.identity,
			identifiant: selection.organisation.siren,
			motif: result.verdict.motif,
			verifieLe: new Date().toISOString(),
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
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "32"))));
	const outputPath = option("output", "bench/results/domains-from-identite-legale.json");
	const before = await measure();
	const selected = (await retryCandidates()).slice(0, limit);
	const results = await withConcurrency(selected, concurrency, (selection) => verifyLegalPage(selection));
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: ExpositionSelection; result: LegalPageResult } => !!entry.result);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForLegalPage(entry.selection, entry.result);
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
		selected: selected.length, verified: accepted.length, applied: apply, before, after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			siren: entry.selection.organisation.siren,
			name: entry.selection.organisation.name,
			domain: entry.selection.domain,
			registry: entry.selection.row.source,
			page: entry.result.url,
			identity: entry.result.verdict.identity,
			motif: entry.result.verdict.motif,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
