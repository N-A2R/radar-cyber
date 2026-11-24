/**
 * Dix-septième route grise : les pages d'établissement déjà prouvées HTTP 200
 * par un registre public, hébergées sur une racine partagée, dont l'adresse ne
 * nomme pas l'organisation mais dont la réponse publie son SIREN. Le SIREN est
 * un identifiant légal public de l'organisation (aucune donnée personnelle) :
 * il ancre l'identité plus strictement qu'un simple jeton de ville. La preuve
 * HTTP reste inchangée : statut 200, racine stable, contenu réel, SIREN exact
 * sur une page qui ne répertorie pas une multitude d'entreprises.
 * Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-siren.mts \
 *       [--limit=500] [--concurrency=16] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { inNouvelleAquitaine, measure, normalizeDomain } from "./domain-coverage.mts";
import { domainRoot, withConcurrency } from "./expand-domains.mts";
import {
	TRUSTED_SOURCES, expositionCandidates, type ExpositionRow, type ExpositionSelection,
} from "./expand-domains-exposition.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "exposition-service:siren-page:http200";
export const MAX_SIRENS_ON_PAGE = 3;

export interface SirenVerdict {
	ok: boolean;
	motif: string;
	status: number | null;
	finalUrl: string;
	htmlLength: number;
	sirensOnPage: number;
}

/** URL of an establishment on a shared root: the address alone cannot identify it. */
export function selectSirenCandidates(
	rows: ExpositionRow[],
	alreadyProven: ReadonlySet<number> = new Set(),
): ExpositionSelection[] {
	const usedOrgs = new Set<number>();
	const selected: ExpositionSelection[] = [];
	for (const row of rows) {
		if (!TRUSTED_SOURCES.has(row.source) || usedOrgs.has(row.orgId) || alreadyProven.has(row.orgId)) continue;
		if (!inNouvelleAquitaine(row.dept) || !/^\d{9}$/.test(row.siren ?? "")) continue;
		const domain = normalizeDomain(row.evidenceDomain);
		if (!domain || domainRoot(row.sourceUrl) !== domain) continue;
		if (!/^https?:\/\/[^/]+\/.+/i.test(row.sourceUrl)) continue;
		usedOrgs.add(row.orgId);
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

/** Strict HTTP proof plus the organisation's own published legal identifier. */
export function sirenVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: ExpositionSelection,
): SirenVerdict {
	const base: SirenVerdict = {
		ok: false, motif: "", status, finalUrl, htmlLength: html.length, sirensOnPage: 0,
	};
	if (status !== 200) return { ...base, motif: "http-not-200" };
	if (normalizeDomain(finalUrl) !== selection.domain) return { ...base, motif: "redirect-off-root" };
	const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
	if (text.trim().length < 150) return { ...base, motif: "content-too-short" };
	const sirens = new Set(text.match(/\b\d{9}\b/g) ?? []);
	const sirensOnPage = sirens.size;
	if (sirensOnPage > MAX_SIRENS_ON_PAGE) return { ...base, motif: "directory-page", sirensOnPage };
	if (!sirens.has(selection.organisation.siren!)) return { ...base, motif: "no-published-siren", sirensOnPage };
	return { ok: true, motif: "http200-published-siren", status, finalUrl, htmlLength: html.length, sirensOnPage };
}

/** Live re-check of one registry URL, with the unchanged strict HTTP proof. */
export async function verifySirenCandidate(
	selection: ExpositionSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<SirenVerdict | null> {
	let page: Awaited<ReturnType<PageFetch>>;
	try {
		page = await fetcher(selection.row.sourceUrl);
	} catch {
		return null;
	}
	const verdict = sirenVerdict(page.html, page.status, page.finalUrl, selection);
	return verdict.ok ? verdict : null;
}

/** Provenance row tying the published SIREN to the live strict check. */
export function provenanceForSiren(selection: ExpositionSelection, verdict: SirenVerdict) {
	return {
		source: SOURCE,
		confiance: 0.9,
		preuve: {
			serviceId: selection.row.serviceId,
			registre: selection.row.source,
			provider: selection.row.provider,
			urlSource: selection.row.sourceUrl,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			siren: selection.organisation.siren,
			sirensOnPage: verdict.sirensOnPage,
			motif: verdict.motif,
			verifieLe: new Date().toISOString(),
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
	const limit = Math.max(1, Number(option("limit", "500")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "16"))));
	const outputPath = option("output", "bench/results/domains-from-siren.json");
	const before = await measure();
	const selected = selectSirenCandidates(await expositionCandidates(), await provenOrganisationIds()).slice(0, limit);
	const results = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifySirenCandidate(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: results[index] }))
		.filter((entry): entry is { selection: ExpositionSelection; verdict: SirenVerdict } => !!entry.verdict);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForSiren(entry.selection, entry.verdict);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.organisation.id, entry.selection.domain, entry.selection.row.sourceUrl],
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
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length, verified: accepted.length, applied: apply, before, after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			siren: entry.selection.organisation.siren,
			name: entry.selection.organisation.name,
			domain: entry.selection.domain,
			page: entry.verdict.finalUrl,
			registry: entry.selection.row.source,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
