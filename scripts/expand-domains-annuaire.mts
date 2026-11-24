/**
 * Seizième source grise : les pages dédiées déjà prouvées HTTP 200 par les
 * registres publics, y compris quand leur racine est un annuaire ou un site de
 * enseigne (Orpi, Intramuros, Planity, concessions, ...). Les passes précédentes
 * écartaient ces racines par principe ; ici une page n'est acceptée que si son
 * adresse ET sa réponse nomment l'organisation, avec la preuve stricte
 * inchangée (statut 200, racine identique, contenu réel, jeton distinctif).
 * Aucune URL n'est devinée et rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-annuaire.mts \
 *       [--limit=1000] [--concurrency=32] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { inNouvelleAquitaine, measure, normalizeDomain } from "./domain-coverage.mts";
import { distinctiveTokens, domainRoot, withConcurrency } from "./expand-domains.mts";
import {
	TRUSTED_SOURCES, expositionCandidates,
	type ExpositionRow, type ExpositionSelection,
} from "./expand-domains-exposition.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";
import {
	NON_SPECIFIC_TOKENS, verifySharedCandidate, type SharedResult,
} from "./expand-domains-shared.mts";

export const SOURCE = "exposition-service:page-annuaire:http200";

export type AnnuaireResult = SharedResult;

/** A directory page counts only when its address carries a token of the name, not just the city. */
export function urlNamesOrganisation(name: string, city: string | null, url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	let path: string;
	try {
		path = decodeURIComponent(parsed.pathname);
	} catch {
		path = parsed.pathname;
	}
	const surface = `${parsed.hostname} ${path}`
		.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
	const cityTokens = new Set(distinctiveTokens(city ?? "", null));
	return distinctiveTokens(name, city).some(
		(token) => token.length >= 5 && !NON_SPECIFIC_TOKENS.has(token)
			&& !cityTokens.has(token) && surface.includes(token),
	);
}

/**
 * Platform roots are allowed here only because the address is organisation-specific.
 */
export function selectAnnuaireCandidates(
	rows: ExpositionRow[],
	alreadyProven: ReadonlySet<number>,
): ExpositionSelection[] {
	const usedOrgs = new Set<number>();
	const usedUrls = new Set<string>();
	const selected: ExpositionSelection[] = [];
	for (const row of rows) {
		if (!TRUSTED_SOURCES.has(row.source) || usedOrgs.has(row.orgId) || alreadyProven.has(row.orgId)) continue;
		if (!inNouvelleAquitaine(row.dept)) continue;
		const domain = normalizeDomain(row.evidenceDomain);
		if (!domain || domainRoot(row.sourceUrl) !== domain) continue;
		if (!urlNamesOrganisation(row.name, row.city, row.sourceUrl) || usedUrls.has(row.sourceUrl)) continue;
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

/** Strict live check, with a name token in the page (a city token alone is not enough). */
export async function verifyAnnuaireCandidate(
	selection: ExpositionSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<AnnuaireResult | null> {
	const result = await verifySharedCandidate(selection, fetcher);
	if (!result) return null;
	const cityTokens = new Set(distinctiveTokens(selection.organisation.city ?? "", null));
	return result.verdict.token && !cityTokens.has(result.verdict.token) ? result : null;
}

/** Provenance row tying the answering directory page to the live strict check. */
export function provenanceForAnnuaire(selection: ExpositionSelection, result: AnnuaireResult) {
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

/** Organisations that already carry a domain proof, whatever its source. */
export async function provenOrganisationIds(): Promise<Set<number>> {
	const { rows } = await query<{ orgId: number }>(
		"SELECT org_id AS \"orgId\" FROM org_enrichissement WHERE champ = 'domaine'",
	);
	return new Set(rows.map((row) => row.orgId));
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "1000")));
	const concurrency = Math.max(1, Math.min(64, Number(option("concurrency", "32"))));
	const outputPath = option("output", "bench/results/domains-from-annuaire.json");
	const before = await measure();
	const selected = selectAnnuaireCandidates(
		await expositionCandidates(), await provenOrganisationIds(),
	).slice(0, limit);
	const results = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyAnnuaireCandidate(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: ExpositionSelection; result: AnnuaireResult } => !!entry.result);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForAnnuaire(entry.selection, entry.result);
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
			token: entry.result.verdict.token,
			titre: entry.result.verdict.title,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
