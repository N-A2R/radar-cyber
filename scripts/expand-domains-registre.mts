/**
 * Nouvelle route grise : les sites publics indexés par identifiant légal dans
 * l'export versionné `registry-id-sites-2026-11-22.tsv` (SIRET data.inclusion,
 * FINESS OSM). L'organisation n'est retenue que si son identifiant public
 * correspond exactement, si elle est en Nouvelle-Aquitaine et sans domaine,
 * et si la page répond encore en direct avec la preuve stricte inchangée.
 * Aucune écriture sans --apply, aucun nom deviné, aucune donnée personnelle.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-registre.mts \
 *       [--limit=500] [--concurrency=24] [--apply]
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	inNouvelleAquitaine, measure, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import {
	domainRoot, distinctiveTokens, GENERIC_TOKENS, pageVerdict, withConcurrency, type Verdict,
} from "./expand-domains.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "source:registre-identifiant:http200";
export const DEFAULT_INPUT = "bench/results/registry-id-sites-2026-11-22.tsv";

/** Hosting, directory and platform roots are never the organisation's own site. */
const THIRD_PARTY_ROOTS = [
	"sites.google.com", "wordpress.com", "blogspot.com", "facebook.com", "wixsite.com",
	"annuaire-entreprises.data.gouv.fr", "sante.fr", "mesoigner.fr", "unilabs.fr",
	"perfdrive.com", "giphar.fr", "elsan.care", "francetravail.fr", "mutuelle-mbv.fr",
	"annuaire.action-sociale.org", "techniciendesante.fr", "autourdemoi.pharmacielafayette.com",
];
/** Words shared by many legal entities cannot identify one organisation. */
const GENERIC_IDENTITY_TOKENS: Record<string, true> = {
	action: true, sociale: true, social: true, service: true, services: true,
	unite: true, maison: true, mission: true, groupement: true, direction: true,
	territorial: true, territoriale: true, intermediaire: true, emploi: true,
	formation: true, insertion: true, solidarite: true, quartier: true,
	regie: true, departementale: true, pharmacie: true, laboratoire: true,
	clinique: true, hopital: true, etablissement: true, association: true,
	entreprise: true, societe: true, centre: true, cabinet: true, groupe: true,
	office: true, syndicat: true,
};

function isThirdParty(domain: string): boolean {
	return THIRD_PARTY_ROOTS.some((root) => domain === root || domain.endsWith(`.${root}`));
}

export interface RegistrySite {
	kind: "siret" | "finess";
	id: string;
	url: string;
	domain: string;
}

export interface RegistryOrganisation {
	id: number;
	name: string;
	city: string | null;
	dept: string | null;
	siren: string | null;
	entity_code: string | null;
	entity_source: string | null;
}

export interface RegistrySelection {
	site: RegistrySite;
	organisation: RegistryOrganisation;
	domain: string;
	token: string;
}

/** One versioned public-identifier/website row becomes one candidate. */
export function parseRegistrySite(line: string): RegistrySite | null {
	const parts = line.split("\t");
	const [kind, id, rawUrl] = parts;
	if ((kind !== "siret" && kind !== "finess") || !/^\d{9,14}$/.test(id ?? "")) return null;
	if (!/^https?:\/\//i.test(rawUrl ?? "")) return null;
	const domain = domainRoot(rawUrl);
	if (!domain || !/\.[a-z]{2,}$/.test(domain) || isThirdParty(domain)) return null;
	return { kind, id, url: rawUrl, domain };
}

/** A distinctive word of the legal name that is also published by the site host. */
export function identityToken(
	organisation: RegistryOrganisation,
	domain: string,
	tokenCounts: ReadonlyMap<string, number>,
): string | null {
	const host = domain.replace(/[^a-z0-9]/g, "");
	if (/\(\d+\)\s*$/.test(organisation.name)) return null;
	const cityTokens = new Set(distinctiveTokens(organisation.city ?? "", null));
	return distinctiveTokens(organisation.name, null)
		.filter((token) => token.length >= 5 && !GENERIC_TOKENS.has(token)
			&& !GENERIC_IDENTITY_TOKENS[token] && !cityTokens.has(token)
			&& tokenCounts.get(token) === 1 && host.includes(token))
		.sort((left, right) => right.length - left.length)[0] ?? null;
}

/** Exact identifier match only; no name, location or similarity fallback. */
export function selectRegistrySites(
	sites: RegistrySite[],
	organisations: RegistryOrganisation[],
): RegistrySelection[] {
	const byCode = new Map<string, RegistryOrganisation>();
	const bySiren = new Map<string, RegistryOrganisation>();
	for (const organisation of organisations) {
		if (!inNouvelleAquitaine(organisation.dept)) continue;
		if (organisation.entity_code && !byCode.has(organisation.entity_code)) {
			byCode.set(organisation.entity_code, organisation);
		}
		if (organisation.siren && !bySiren.has(organisation.siren)) {
			bySiren.set(organisation.siren, organisation);
		}
	}
	const matches: { site: RegistrySite; organisation: RegistryOrganisation }[] = [];
	const usedOrgs = new Set<number>();
	const usedRoots = new Set<string>();
	for (const site of sites) {
		const organisation = byCode.get(site.id)
			?? (site.kind === "siret" ? bySiren.get(site.id.slice(0, 9)) : undefined);
		if (!organisation || usedOrgs.has(organisation.id) || usedRoots.has(site.domain)) continue;
		usedOrgs.add(organisation.id);
		usedRoots.add(site.domain);
		matches.push({ site, organisation });
	}
	/* A word shared by two matched legal entities cannot identify one of them. */
	const tokenCounts = new Map<string, number>();
	for (const match of matches) {
		for (const token of distinctiveTokens(match.organisation.name, null)) {
			tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
		}
	}
	const selected: RegistrySelection[] = [];
	for (const { site, organisation } of matches) {
		const token = identityToken(organisation, site.domain, tokenCounts);
		if (token) selected.push({ site, organisation, domain: site.domain, token });
	}
	return selected;
}

/** Strict live proof, anchored on the name published by the official identifier. */
export function registryVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: RegistrySelection,
): Verdict {
	const verdict = pageVerdict(html, status, finalUrl, {
		id: selection.organisation.id,
		name: selection.token,
		city: null,
		dept: selection.organisation.dept,
		siren: selection.organisation.siren,
		domain: null,
	}, selection.domain);
	if (!verdict.ok) return verdict;
	const title = (verdict.title ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.replace(/&#\d+;|&[a-z]+;/gi, " ").toLowerCase();
	return title.includes(selection.token)
		? verdict
		: { ...verdict, ok: false, motif: "title-missing-token", confidence: 0 };
}

/** Re-verifies the registered URL live before accepting it. */
export async function verifyRegistrySite(
	selection: RegistrySelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<Verdict | null> {
	let page: Awaited<ReturnType<PageFetch>>;
	try {
		page = await fetcher(selection.site.url);
	} catch {
		return null;
	}
	const verdict = registryVerdict(page.html, page.status, page.finalUrl, selection);
	return verdict.ok ? verdict : null;
}

/** Provenance tying the public identifier to the live HTTP proof. */
export function provenanceForRegistry(selection: RegistrySelection, verdict: Verdict) {
	return {
		source: SOURCE,
		confiance: verdict.confidence,
		preuve: {
			identifiant: selection.site.kind,
			valeur: selection.site.id,
			urlRegistre: selection.site.url,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: `${verdict.motif}:registre-identifiant-http200`,
			verifieLe: new Date().toISOString(),
		},
	};

}
/** The versioned export is local: no paid service and no personal record. */
export async function registrySites(input: string): Promise<RegistrySite[]> {
	const content = await readFile(input, "utf8");
	return content.split("\n").slice(1)
		.map((line) => parseRegistrySite(line))
		.filter((row): row is RegistrySite => row !== null);
}

/** Only Nouvelle-Aquitaine organisations without a domain are candidates. */
export async function candidateOrganisations(): Promise<RegistryOrganisation[]> {
	const { rows } = await query<RegistryOrganisation>(`
		SELECT id, name, city, dept, siren, entity_code, entity_source FROM org
		WHERE dept = ANY($1::text[])
		  AND (domain IS NULL OR btrim(domain) = '')
		  AND entity_code IS NOT NULL
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
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "24"))));
	const outputPath = option("output", "bench/results/domains-from-registre.json");
	const before = await measure();
	const sites = await registrySites(option("input", DEFAULT_INPUT));
	const selected = selectRegistrySites(sites, await candidateOrganisations()).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyRegistrySite(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry): entry is { selection: RegistrySelection; verdict: Verdict } => !!entry.verdict);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForRegistry(entry.selection, entry.verdict);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[
						entry.selection.organisation.id, entry.selection.domain,
						entry.selection.site.url,
					],
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
			name: entry.selection.organisation.name,
			identifier: `${entry.selection.site.kind}:${entry.selection.site.id}`,
			domain: entry.selection.domain,
			page: entry.verdict.finalUrl,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
