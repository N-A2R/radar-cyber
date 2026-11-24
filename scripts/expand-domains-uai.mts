/**
 * Nouvelle route grise : les sites officiels indexés par UAI dans l'export
 * Wikidata P3202 (code établissement d'enseignement). L'organisation n'est
 * retenue que si son `entity_code` correspond exactement à l'UAI publiée,
 * si elle est en Nouvelle-Aquitaine et sans domaine, si la racine n'est pas
 * déjà attribuée à une autre organisation, et si le site répond encore en
 * direct avec la preuve stricte inchangée (HTTP 200, racine stable, contenu
 * réel, jeton distinctif du nom dans l'adresse et dans le titre).
 *
 * Aucune écriture sans --apply, aucun nom deviné, aucune donnée personnelle.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-uai.mts \
 *       [--limit=500] [--concurrency=16] [--apply]
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	inNouvelleAquitaine, measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import {
	domainRoot, distinctiveTokens, pageVerdict, withConcurrency, type Verdict,
} from "./expand-domains.mts";
import { fetchRetryPage, retryUrls, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "wikidata:P3202:uai:http200";
export const DEFAULT_INPUT = "bench/results/wikidata-id-sites-2026-11-22.tsv";

/** Hosting and academy roots cannot identify one establishment. */
const THIRD_PARTY_ROOTS = [
	"pagesperso-orange.fr", "sites.google.com", "wordpress.com", "blogspot.com",
	"wixsite.com", "ac-poitiers.fr", "ac-bordeaux.fr", "ac-limoges.fr",
	"education.gouv.fr", "oned.ac-bordeaux.fr", "annuaire-education.fr",
	"index-education.net", "free.fr",
];
/** Words shared by every school cannot identify one establishment. */
const GENERIC_SCHOOL_TOKENS: Record<string, true> = {
	college: true, lycee: true, ecole: true, enseignement: true, education: true,
	prive: true, public: true, professionnel: true, technique: true,
	etablissement: true, academie: true, academy: true, centre: true,
	formation: true, appui: true, orientation: true, information: true,
};

function isThirdParty(domain: string): boolean {
	return THIRD_PARTY_ROOTS.some((root) => domain === root || domain.endsWith(`.${root}`));
}

export interface UaiSite {
	uai: string;
	url: string;
	domain: string;
}

export interface UaiOrganisation {
	id: number;
	name: string;
	city: string | null;
	dept: string | null;
	entity_code: string | null;
}

export interface UaiSelection {
	site: UaiSite;
	organisation: UaiOrganisation;
	domain: string;
	token: string;
}

/** One versioned Wikidata UAI/website row becomes one candidate. */
export function parseUaiSite(line: string): UaiSite | null {
	const [kind, rawUai, rawUrl] = line.split("\t");
	if (kind !== "uai" || !/^\d{7}[A-Z0-9]$/.test(rawUai ?? "")) return null;
	if (!/^https?:\/\//i.test(rawUrl ?? "")) return null;
	const domain = domainRoot(rawUrl);
	if (!domain || !/\.[a-z]{2,}$/.test(domain) || isThirdParty(domain)) return null;
	return { uai: rawUai, url: rawUrl, domain };
}

/**
 * A distinctive word of the legal name anchors the live proof. The exact UAI
 * already binds the site to the establishment; the token is verified on the
 * page itself, so the host does not have to repeat the name.
 */
export function identityToken(organisation: UaiOrganisation, _site: UaiSite): string | null {
	if (/\(\d+\)\s*$/.test(organisation.name)) return null;
	const cityTokens = new Set(distinctiveTokens(organisation.city ?? "", null));
	return distinctiveTokens(organisation.name, null)
		.filter((token) => token.length >= 5 && !GENERIC_SCHOOL_TOKENS[token]
			&& !cityTokens.has(token))
		.sort((left, right) => right.length - left.length)[0] ?? null;
}

/** Exact UAI match only; no name, location or similarity fallback. */
export function selectUaiSites(
	sites: UaiSite[],
	organisations: UaiOrganisation[],
	attributedRoots: ReadonlySet<string> = new Set(),
): UaiSelection[] {
	const byUai = new Map<string, UaiOrganisation>();
	for (const organisation of organisations) {
		if (!inNouvelleAquitaine(organisation.dept) || !organisation.entity_code) continue;
		if (!byUai.has(organisation.entity_code)) byUai.set(organisation.entity_code, organisation);
	}
	const usedOrgs = new Set<number>();
	const usedRoots = new Set<string>();
	const selected: UaiSelection[] = [];
	for (const site of sites) {
		const organisation = byUai.get(site.uai);
		if (!organisation || usedOrgs.has(organisation.id) || usedRoots.has(site.domain)
			|| attributedRoots.has(site.domain)) continue;
		const token = identityToken(organisation, site);
		if (!token) continue;
		usedOrgs.add(organisation.id);
		usedRoots.add(site.domain);
		selected.push({ site, organisation, domain: site.domain, token });
	}
	return selected;
}

/** Strict live proof, with the name also required in the final page title. */
export function uaiVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: UaiSelection,
): Verdict {
	const verdict = pageVerdict(html, status, finalUrl, {
		id: selection.organisation.id, name: selection.token, city: null,
		dept: selection.organisation.dept, siren: null, domain: null,
	}, selection.domain);
	if (!verdict.ok) return verdict;
	const title = (verdict.title ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().replace(/[^a-z0-9]+/g, "");
	return title.includes(selection.token)
		? verdict
		: { ...verdict, ok: false, motif: "title-missing-token", confidence: 0 };
}

/** Tries http/https/www variants and keeps the first strictly verified page. */
export async function verifyUaiSite(
	selection: UaiSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<Verdict | null> {
	for (const url of retryUrls(selection.site.url)) {
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		const verdict = uaiVerdict(page.html, page.status, page.finalUrl, selection);
		if (verdict.ok) return verdict;
	}
	return null;
}

/** Provenance tying the public UAI to the live HTTP proof. */
export function provenanceForUai(selection: UaiSelection, verdict: Verdict) {
	return {
		source: SOURCE,
		confiance: verdict.confidence,
		preuve: {
			uai: selection.site.uai,
			reference: DEFAULT_INPUT,
			urlSource: selection.site.url,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: `${verdict.motif}:wikidata-uai-http200`,
			verifieLe: new Date().toISOString(),
		},
	};
}

/** The versioned export is local: no paid service and no personal record. */
export async function uaiSites(input: string): Promise<UaiSite[]> {
	const content = await readFile(input, "utf8");
	return content.split("\n")
		.map((line) => parseUaiSite(line))
		.filter((row): row is UaiSite => row !== null);
}

/** Only Nouvelle-Aquitaine organisations without a domain are candidates. */
export async function candidateOrganisations(): Promise<UaiOrganisation[]> {
	const { rows } = await query<UaiOrganisation>(`
		SELECT id, name, city, dept, entity_code FROM org
		WHERE dept = ANY($1::text[])
		  AND (domain IS NULL OR btrim(domain) = '')
		  AND entity_code IS NOT NULL
	`, [[...NOUVELLE_AQUITAINE_DEPTS]]);
	return rows;
}

/** Roots already used by another organisation are never reassigned. */
export async function attributedRoots(): Promise<Set<string>> {
	const { rows } = await query<{ domain: string | null }>(
		"SELECT domain FROM org WHERE domain IS NOT NULL AND btrim(domain) <> ''",
	);
	return new Set(rows.map((row) => normalizeDomain(row.domain)).filter((root): root is string => !!root));
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "500")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "16"))));
	const outputPath = option("output", "bench/results/domains-from-uai.json");
	const before = await measure();
	const sites = await uaiSites(option("input", DEFAULT_INPUT));
	const selected = selectUaiSites(
		sites, await candidateOrganisations(), await attributedRoots(),
	).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyUaiSite(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry): entry is { selection: UaiSelection; verdict: Verdict } => !!entry.verdict);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForUai(entry.selection, entry.verdict);
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
			uai: entry.selection.site.uai,
			domain: entry.selection.domain,
			page: entry.verdict.finalUrl,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
