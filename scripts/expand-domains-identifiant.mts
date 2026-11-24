/**
 * Dix-huitième route grise : les pages d'établissement déjà prouvées HTTP 200
 * par un registre public, hébergées sur une racine partagée, dont l'adresse ne
 * nomme pas l'organisation mais dont la réponse publie son identifiant légal :
 * FINESS (9 chiffres) ou SIRET (14 chiffres). Ces identifiants sont publics et
 * non personnels. La preuve HTTP reste stricte : statut 200, racine inchangée
 * après redirection, contenu réel, au plus trois identifiants sur la page.
 * Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-identifiant.mts \
 *       [--limit=500] [--concurrency=16] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	inNouvelleAquitaine, measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import { domainRoot, withConcurrency } from "./expand-domains.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "exposition-service:identifiant-public:http200";
export const MAX_IDENTIFIERS_ON_PAGE = 3;

export interface IdentifierRow {
	serviceId: number;
	orgId: number;
	name: string;
	city: string | null;
	dept: string | null;
	siren: string | null;
	source: string;
	sourceUrl: string;
	provider: string | null;
	evidenceDomain: string | null;
	identifier: string;
	identifierKind: "finess" | "siret";
}

export interface IdentifierSelection {
	row: IdentifierRow;
	domain: string;
}

export interface IdentifierVerdict {
	ok: boolean;
	motif: string;
	status: number | null;
	finalUrl: string;
	htmlLength: number;
	identifiersOnPage: number;
}

/** Registry rows carrying a public FINESS or SIRET and a dedicated address. */
export function selectIdentifierCandidates(
	rows: IdentifierRow[],
	alreadyProven: ReadonlySet<number> = new Set(),
): IdentifierSelection[] {
	const usedOrgs = new Set<number>();
	const selected: IdentifierSelection[] = [];
	for (const row of rows) {
		if (usedOrgs.has(row.orgId) || alreadyProven.has(row.orgId)) continue;
		if (!inNouvelleAquitaine(row.dept)) continue;
		if (row.identifierKind === "finess" && !/^\d{9}$/.test(row.identifier)) continue;
		if (row.identifierKind === "siret" && !/^\d{14}$/.test(row.identifier)) continue;
		const domain = normalizeDomain(row.evidenceDomain);
		if (!domain || domainRoot(row.sourceUrl) !== domain) continue;
		if (!/^https?:\/\/[^/]+\/.+/i.test(row.sourceUrl)) continue;
		usedOrgs.add(row.orgId);
		selected.push({ row, domain });
	}
	return selected;
}

/** Contiguous or grouped digits, without merging adjacent identifiers. */
export function pageIdentifiers(html: string, length: number): Set<string> {
	const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ");
	const patterns = [
		new RegExp(`\\b\\d{${length}}\\b`, "g"),
		length === 9 ? /\b\d{3}[ .]\d{3}[ .]\d{3}\b/g : /\b\d{3}[ .]\d{3}[ .]\d{3}[ .]\d{5}\b/g,
	];
	const found = new Set<string>();
	for (const pattern of patterns) {
		for (const match of text.match(pattern) ?? []) found.add(match.replace(/[ .]/g, ""));
	}
	return found;
}

/** Strict HTTP proof plus the organisation's own published legal identifier. */
export function identifierVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: IdentifierSelection,
): IdentifierVerdict {
	const base: IdentifierVerdict = {
		ok: false, motif: "", status, finalUrl, htmlLength: html.length, identifiersOnPage: 0,
	};
	const length = selection.row.identifierKind === "finess" ? 9 : 14;
	if (status !== 200) return { ...base, motif: "http-not-200" };
	if (normalizeDomain(finalUrl) !== selection.domain) return { ...base, motif: "redirect-off-root" };
	const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
	if (text.trim().length < 150) return { ...base, motif: "content-too-short" };
	const identifiers = pageIdentifiers(html, length);
	if (identifiers.size > MAX_IDENTIFIERS_ON_PAGE) {
		return { ...base, motif: "directory-page", identifiersOnPage: identifiers.size };
	}
	if (!identifiers.has(selection.row.identifier)) {
		return { ...base, motif: "no-published-identifier", identifiersOnPage: identifiers.size };
	}
	return {
		ok: true, motif: `http200-published-${selection.row.identifierKind}`,
		status, finalUrl, htmlLength: html.length, identifiersOnPage: identifiers.size,
	};
}

/** Live re-check of one registry URL, with the unchanged strict HTTP proof. */
export async function verifyIdentifierCandidate(
	selection: IdentifierSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<IdentifierVerdict | null> {
	let page: Awaited<ReturnType<PageFetch>>;
	try {
		page = await fetcher(selection.row.sourceUrl);
	} catch {
		return null;
	}
	const verdict = identifierVerdict(page.html, page.status, page.finalUrl, selection);
	return verdict.ok ? verdict : null;
}

/** Provenance row tying the published identifier to the live strict check. */
export function provenanceForIdentifier(selection: IdentifierSelection, verdict: IdentifierVerdict) {
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
			identifiant: selection.row.identifier,
			typeIdentifiant: selection.row.identifierKind,
			identifiantsSurPage: verdict.identifiersOnPage,
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

/** FINESS/SIRET rows published by a registry for a Nouvelle-Aquitaine organisation. */
export async function identifierCandidates(): Promise<IdentifierRow[]> {
	const { rows } = await query<IdentifierRow>(`
		SELECT e.id AS "serviceId", e.org_id AS "orgId", o.name, o.city, o.dept, o.siren,
		       e.source, e.source_url AS "sourceUrl", e.evidence->>'provider' AS provider,
		       e.evidence->>'domain' AS "evidenceDomain", o.entity_code AS identifier,
		       CASE WHEN o.entity_source = 'finess' THEN 'finess' ELSE 'siret' END AS "identifierKind"
		FROM exposition_service e
		JOIN org o ON o.id = e.org_id
		WHERE o.dept = ANY($1::text[])
		  AND (o.domain IS NULL OR btrim(o.domain) = '')
		  AND e.evidence->>'status' = '200'
		  AND e.evidence ? 'domain'
		  AND e.source_url ~ '^https?://[^/]+/.+'
		  AND ((o.entity_source = 'finess' AND o.entity_code ~ '^[0-9]{9}$')
		    OR (o.entity_source = 'sirene-site' AND o.entity_code ~ '^[0-9]{14}$'))
		ORDER BY e.consulted_at DESC
	`, [[...NOUVELLE_AQUITAINE_DEPTS]]);
	return rows;
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "500")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "16"))));
	const outputPath = option("output", "bench/results/domains-from-identifiant.json");
	const before = await measure();
	const selected = selectIdentifierCandidates(
		await identifierCandidates(), await provenOrganisationIds(),
	).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyIdentifierCandidate(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry): entry is { selection: IdentifierSelection; verdict: IdentifierVerdict } => !!entry.verdict);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForIdentifier(entry.selection, entry.verdict);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.row.orgId, entry.selection.domain, entry.selection.row.sourceUrl],
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
			identifier: entry.selection.row.identifier,
			kind: entry.selection.row.identifierKind,
			name: entry.selection.row.name,
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
