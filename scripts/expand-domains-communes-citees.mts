/**
 * Tranche t32 — sites municipaux explicitement cités par le corpus versionné.
 *
 * `bench/corpus/presse-communale.jsonl` publie, pour chaque commune, une URL
 * officielle (`source_candidat`) déjà observée en HTTP 200. Cette route ne
 * devine aucune racine : elle ne reprend que cette URL, l'apparie à une
 * organisation « Commune de / Mairie de / Ville de <commune> » du même
 * département, puis applique la preuve stricte inchangée de la tranche t31
 * (HTTP 200 final sur la racine citée, contenu municipal, ancre locale).
 *
 * Aucune écriture sans --apply ; aucune racine déjà attribuée n'est réemployée.
 *
 * Usage :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-communes-citees.mts \
 *       [--limit=500] [--concurrency=16] --apply
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, withTransaction } from "../apps/api/src/db.js";
import { measure, NOUVELLE_AQUITAINE_DEPTS, normalizeDomain } from "./domain-coverage.mts";
import { domainRoot, withConcurrency, type Verdict } from "./expand-domains.mts";
import {
	attributedRoots, candidateOrganisations, compact,
	fetchCommunePage, loadCommunes, type Commune,
	type CommuneOrganisation, type CommuneSelection, type PageFetch,
} from "./expand-domains-communes-na.mts";

export const SOURCE = "source:presse-communale:url-citee:http200";
export const DEFAULT_CORPUS = "bench/corpus/presse-communale.jsonl";
export const DEFAULT_REFERENTIEL = "db/data/referentiel-na.json";

/** Hosting roots cannot be the commune's own site. */
const THIRD_PARTY_ROOTS = [
	"facebook.com", "wordpress.com", "blogspot.com", "wixsite.com", "sites.google.com",
	"actu.fr", "sudouest.fr", "francebleu.fr", "ici.fr", "lemonde.fr", "20minutes.fr",
];

export interface CitedSite {
	commune: string;
	dept: string;
	url: string;
	domain: string;
}

export interface CitedSelection extends CommuneSelection {
	sourceUrl: string;
}

/** Only HTTP 200 corpus rows with an official URL and a regional department. */
export function parseCitedSite(line: string): CitedSite | null {
	let row: Record<string, unknown>;
	try {
		row = JSON.parse(line) as Record<string, unknown>;
	} catch {
		return null;
	}
	if (row.statut_http !== 200 || typeof row.source_candidat !== "string"
		|| typeof row.commune !== "string" || typeof row.departement !== "string") return null;
	if (!NOUVELLE_AQUITAINE_DEPTS.has(row.departement.trim().padStart(2, "0"))) return null;
	const domain = domainRoot(row.source_candidat);
	if (!domain || THIRD_PARTY_ROOTS.some((root) => domain === root || domain.endsWith(`.${root}`))) {
		return null;
	}
	return { commune: row.commune, dept: row.departement, url: row.source_candidat, domain };
}

/** A root is accepted only when it actually names the commune. */
export function rootNamesCommune(site: CitedSite): boolean {
	const root = compact(site.domain);
	return compact(site.commune).split(" ").some((token) => token.length >= 3 && root.includes(token));
}

/** The name must equal the commune, not merely contain it (Ger ≠ Gerderest). */
export function nameDesignatesExactCommune(name: string, commune: Commune): boolean {
	const prefix = /^(?:commune|mairie|ville)\s+(?:de\s+|d['’]\s*|du\s+|des\s+)?/i.exec(name);
	if (!prefix) return false;
	return compact(name.slice(prefix[0].length)) === compact(commune.nom);
}

/** Exact commune identity, same department, one root and one organisation per commune. */
export function selectCitedDomains(
	organisations: CommuneOrganisation[],
	communes: Commune[],
	sites: CitedSite[],
	attributed: ReadonlySet<string> = new Set(),
): CitedSelection[] {
	const byCommune = new Map<string, Commune>();
	for (const commune of communes) {
		byCommune.set(`${commune.dept}:${compact(commune.nom)}`, commune);
	}
	const selected: CitedSelection[] = [];
	const usedOrgs = new Set<number>();
	const usedCommunes = new Set<string>();
	const usedRoots = new Set<string>();
	for (const site of sites) {
		if (!rootNamesCommune(site) || usedRoots.has(site.domain) || attributed.has(site.domain)) continue;
		const commune = byCommune.get(`${site.dept.trim().padStart(2, "0")}:${compact(site.commune)}`);
		if (!commune || usedCommunes.has(commune.code)) continue;
		const organisation = organisations.find((row) =>
			!usedOrgs.has(row.id) && row.dept === commune.dept && nameDesignatesExactCommune(row.name, commune));
		if (!organisation) continue;
		usedOrgs.add(organisation.id);
		usedCommunes.add(commune.code);
		usedRoots.add(site.domain);
		selected.push({ organisation, commune, domain: site.domain, sourceUrl: site.url });
	}
	return selected;
}

/**
 * Same strict municipal proof as t31, with the commune name itself as the
 * identity token: three-letter communes (Dax, Ger, Nay, Urt) are legitimate
 * names and must not be excluded by a four-letter minimum token length.
 */
export function citedCommuneVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: CitedSelection,
): Verdict {
	const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? null;
	const base: Verdict = {
		ok: false, motif: "", token: null, confidence: 0, title, status, finalUrl, htmlLength: html.length,
	};
	if (status !== 200) return { ...base, motif: "http-not-200" };
	if (normalizeDomain(finalUrl) !== selection.domain) return { ...base, motif: "redirect-off-root" };
	const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/gi, " ")
		.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
	if (text.length < 150) return { ...base, motif: "content-too-short" };
	if (/\b(domain (is )?for sale|domaine a vendre|sedo|parking page|buy this domain)\b/i.test(text)) {
		return { ...base, motif: "parking-page" };
	}
	const rejected = (motif: string): Verdict => ({ ...base, motif });
	if (!compact(`${title ?? ""} ${text}`).includes(compact(selection.commune.nom))) {
		return rejected("commune-name-absent");
	}
	if (!/\b(mairie|municipal|municipale|commune|conseil municipal|etat civil)\b/.test(text)) {
		return rejected("not-municipal-content");
	}
	const foreignDept = /\(\s*(\d{2})\s*\)/.exec(text);
	if (foreignDept && foreignDept[1] !== selection.commune.dept) return rejected("foreign-department-anchor");
	const localAnchor = selection.commune.postalCodes.some((code) => text.includes(code))
		|| text.includes(selection.commune.deptName);
	if (!localAnchor) return rejected("local-anchor-absent");
	return {
		...base, ok: true, motif: "http200-commune-citee", token: selection.commune.nom,
		confidence: 0.9,
	};
}

/** Re-verifies the cited URL live, then the bare root, with the strict proof. */
export async function verifyCitedDomain(
	selection: CitedSelection,
	fetcher: PageFetch = fetchCommunePage,
): Promise<Verdict | null> {
	for (const url of [selection.sourceUrl, `https://${selection.domain}/`]) {
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		const verdict = citedCommuneVerdict(page.html, page.status, page.finalUrl, selection);
		if (verdict.ok) return verdict;
	}
	return null;
}

/** Provenance tying the published corpus URL to the live HTTP proof. */
export function provenanceForCited(selection: CitedSelection, verdict: Verdict) {
	return {
		source: SOURCE,
		confiance: verdict.confidence,
		preuve: {
			codeCommune: selection.commune.code,
			commune: selection.commune.nom,
			departement: selection.commune.dept,
			reference: DEFAULT_CORPUS,
			urlSource: selection.sourceUrl,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: verdict.motif,
			verifieLe: new Date().toISOString(),
		},
	};
}

/** Reads only the versioned corpus — no paid service, no personal record. */
export async function citedSites(input: string): Promise<CitedSite[]> {
	const content = await readFile(input, "utf8");
	return content.split("\n")
		.map((line) => parseCitedSite(line))
		.filter((row): row is CitedSite => row !== null);
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "500")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "16"))));
	const outputPath = option("output", "bench/results/domains-from-communes-citees.json");
	const before = await measure();
	const communes = loadCommunes(await readFile(option("referentiel", DEFAULT_REFERENTIEL), "utf8"));
	const selected = selectCitedDomains(
		await candidateOrganisations(), communes,
		await citedSites(option("input", DEFAULT_CORPUS)), await attributedRoots(),
	).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyCitedDomain(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry): entry is { selection: CitedSelection; verdict: Verdict } => !!entry.verdict);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const { selection, verdict } of accepted) {
				const proof = provenanceForCited(selection, verdict);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND coalesce(btrim(domain), '') = ''",
					[selection.organisation.id, selection.domain, `https://${selection.domain}/`],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO NOTHING`,
					[
						selection.organisation.id, selection.domain,
						proof.source, proof.confiance, JSON.stringify(proof.preuve),
					],
				);
			}
		});
	}
	const after = await measure();
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length, verified: accepted.length, applied: apply, before, after,
		domains: accepted.map(({ selection, verdict }) => ({
			orgId: selection.organisation.id,
			name: selection.organisation.name,
			commune: selection.commune.nom,
			codeCommune: selection.commune.code,
			domain: selection.domain,
			page: verdict.finalUrl,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
