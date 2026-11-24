/**
 * Tranche t31 — domaines municipaux déduits du référentiel territorial.
 *
 * Le référentiel versionné `db/data/referentiel-na.json` donne, pour chaque
 * commune de Nouvelle-Aquitaine, son nom, son département et ses codes
 * postaux. Une organisation sans domaine n'est candidate que si son nom
 * désigne explicitement cette commune (« Commune de », « Mairie de »,
 * « Ville de »). Deux racines sont essayées : `ville-<slug>.fr` et
 * `mairie-<slug>.fr`.
 *
 * Une racine n'est retenue que sur preuve live stricte : HTTP 200 final sur
 * la même racine, contenu réel, nom de la commune dans la page, vocabulaire
 * municipal et ancre locale (code postal ou nom du département de la
 * commune, sans code départemental contradictoire). Aucune racine déjà
 * attribuée n'est réemployée. Aucune écriture sans `--apply`.
 *
 * Usage :
 *   DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-communes-na.mts \
 *       [--limit=2000] [--concurrency=24] [--apply]
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	measure, NOUVELLE_AQUITAINE_DEPTS, normalizeDomain,
} from "./domain-coverage.mts";
import { pageVerdict, withConcurrency, type Verdict } from "./expand-domains.mts";

export const SOURCE = "source:referentiel-territorial:nom-domaine:http200";
export const DEFAULT_REFERENTIEL = "db/data/referentiel-na.json";
export const TIMEOUT_MS = 9_000;

/** Quatre motifs publics, essayés en passes successives pour ne pas écraser une racine prouvée. */
export const ROOT_PATTERNS = {
	slug: (slug: string) => `${slug}.fr`,
	mairie: (slug: string) => `mairie-${slug}.fr`,
	"slug-mairie": (slug: string) => `${slug}-mairie.fr`,
	ville: (slug: string) => `ville-${slug}.fr`,
};
export type RootPattern = keyof typeof ROOT_PATTERNS;

export interface Commune {
	code: string;
	nom: string;
	slug: string;
	dept: string;
	deptName: string;
	postalCodes: string[];
}

export interface CommuneOrganisation {
	id: number;
	name: string;
	dept: string | null;
}

export interface CommuneSelection {
	organisation: CommuneOrganisation;
	commune: Commune;
	domain: string;
}

export interface PageFetch {
	(url: string): Promise<{ html: string; status: number; finalUrl: string }>;
}

const normalize = (value: string): string => value
	.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
	.replace(/['’]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

export const compact = (value: string): string => normalize(value).replace(/[^a-z0-9]/g, "");

/** Racine ASCII utilisable dans un nom de domaine. */
export function communeSlug(name: string): string {
	return normalize(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface ReferentielRow {
	code: string;
	nom: string;
	type: string;
	dept?: string;
	departement?: string;
	codesPostaux?: string[];
}

/** Seules les communes de la région, avec une racine exploitable, sont gardées. */
export function loadCommunes(raw: string): Commune[] {
	const referentiel = JSON.parse(raw) as {
		communes: ReferentielRow[];
		departements: { code: string; nom: string }[];
	};
	const deptNames = new Map(referentiel.departements.map((dept) => [dept.code, normalize(dept.nom)]));
	return referentiel.communes
		.filter((commune) => NOUVELLE_AQUITAINE_DEPTS.has(commune.dept ?? commune.departement ?? ""))
		.map((commune) => {
			const dept = commune.dept ?? commune.departement ?? "";
			return {
				code: commune.code,
				nom: commune.nom,
				slug: communeSlug(commune.nom),
				dept,
				deptName: deptNames.get(dept) ?? "",
				postalCodes: commune.codesPostaux ?? [],
			};
		})
		.filter((commune) => commune.slug.length >= 3 && commune.deptName.length >= 3)
		.sort((left, right) => right.nom.length - left.nom.length);
}

/** Le nom doit désigner la commune, pas un commerce ou un EPCI homonyme. */
export function designatesCommune(organisationName: string, commune: Commune): boolean {
	if (!/^(commune|mairie|ville)\s+(de\s+|d\s+|du\s+|des\s+|d')/i.test(organisationName)) return false;
	return compact(organisationName).includes(compact(commune.nom));
}

/**
 * Une seule racine par commune, jamais une racine déjà portée par une autre
 * fiche, et seulement dans le département de la commune désignée.
 */
export function selectCommuneDomains(
	organisations: CommuneOrganisation[],
	communes: Commune[],
	attributed: ReadonlySet<string> = new Set(),
	motif: RootPattern = "slug",
): CommuneSelection[] {
	const selections: CommuneSelection[] = [];
	const usedOrgs = new Set<number>();
	const usedCommunes = new Set<string>();
	for (const organisation of organisations) {
		if (usedOrgs.has(organisation.id) || !organisation.dept) continue;
		const commune = communes.find((candidate) =>
			candidate.dept === organisation.dept && designatesCommune(organisation.name, candidate));
		if (!commune || usedCommunes.has(commune.code)) continue;
		const domain = ROOT_PATTERNS[motif](commune.slug);
		if (attributed.has(domain)) continue;
		usedOrgs.add(organisation.id);
		usedCommunes.add(commune.code);
		selections.push({ organisation, commune, domain });
	}
	return selections;
}

/** Preuve stricte : racine stable, nom communal, vocabulaire et ancre locale. */
export function communeVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: CommuneSelection,
): Verdict {
	const { commune, domain } = selection;
	const base = pageVerdict(html, status, finalUrl, {
		id: selection.organisation.id,
		name: commune.nom,
		city: null,
		dept: commune.dept,
		siren: null,
		domain: null,
	}, domain);
	if (!base.ok) return base;
	const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
	const text = `${title} ${html.replace(/<[^>]+>/g, " ")}`.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "").toLowerCase();
	const rejected = (motif: string): Verdict => ({ ...base, ok: false, motif, confidence: 0 });
	if (!compact(text).includes(compact(commune.nom))) return rejected("commune-name-absent");
	if (!/\b(mairie|municipal|municipale|commune|conseil municipal|etat civil)\b/.test(normalize(text))) {
		return rejected("not-municipal-content");
	}
	const foreignDept = /\(\s*(\d{2})\s*\)/.exec(text);
	if (foreignDept && foreignDept[1] !== commune.dept) return rejected("foreign-department-anchor");
	const localAnchor = commune.postalCodes.some((code) => text.includes(code))
		|| text.includes(commune.deptName);
	if (!localAnchor) return rejected("local-anchor-absent");
	return { ...base, motif: "http200-commune-locale", confidence: Math.max(0.85, base.confidence) };
}

/** Live fetch limited to a small public page, with a bounded time budget. */
export const fetchCommunePage: PageFetch = async (url) => {
	const response = await fetch(url, {
		redirect: "follow",
		signal: AbortSignal.timeout(TIMEOUT_MS),
		headers: { "user-agent": "RadarCyberNA/1.5 (public-domain-verification)" },
	});
	const html = (await response.text()).slice(0, 400_000);
	return { html, status: response.status, finalUrl: response.url || url };
};

/** https first, then the same host with www — never a different root. */
export async function verifyCommuneDomain(
	selection: CommuneSelection,
	fetcher: PageFetch = fetchCommunePage,
): Promise<Verdict | null> {
	const urls = [`https://${selection.domain}/`, `https://www.${selection.domain}/`];
	for (const url of urls) {
		let page: Awaited<ReturnType<PageFetch>>;
		try {
			page = await fetcher(url);
		} catch {
			continue;
		}
		const verdict = communeVerdict(page.html, page.status, page.finalUrl, selection);
		if (verdict.ok) return verdict;
	}
	return null;
}

/** Provenance tying the public territorial reference to the live HTTP proof. */
export function provenanceForCommune(selection: CommuneSelection, verdict: Verdict) {
	return {
		source: SOURCE,
		confiance: verdict.confidence,
		preuve: {
			codeCommune: selection.commune.code,
			commune: selection.commune.nom,
			departement: selection.commune.dept,
			reference: DEFAULT_REFERENTIEL,
			urlSource: `https://${selection.domain}/`,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: verdict.motif,
			verifieLe: new Date().toISOString(),
		},
	};
}

/** Only Nouvelle-Aquitaine organisations without a domain and a municipal name. */
export async function candidateOrganisations(): Promise<CommuneOrganisation[]> {
	const { rows } = await query<CommuneOrganisation>(`
		SELECT id, name, dept FROM org
		WHERE dept = ANY($1::text[])
		  AND coalesce(btrim(domain), '') = ''
		  AND coalesce(btrim(website), '') = ''
		  AND (name ILIKE 'commune de %' OR name ILIKE 'mairie de %' OR name ILIKE 'ville de %'
		       OR name ILIKE 'commune d%' OR name ILIKE 'mairie d%' OR name ILIKE 'ville d%')
		ORDER BY id
	`, [[...NOUVELLE_AQUITAINE_DEPTS]]);
	return rows;
}

/** Roots used by any organisation, including provenance-only rows. */
export async function attributedRoots(): Promise<Set<string>> {
	const domains = await query<{ domain: string | null }>(
		"SELECT domain FROM org WHERE domain IS NOT NULL AND btrim(domain) <> ''",
	);
	const enriched = await query<{ valeur: string | null }>(
		"SELECT valeur FROM org_enrichissement WHERE champ = 'domaine'",
	);
	const roots = [
		...domains.rows.map((row) => normalizeDomain(row.domain)),
		...enriched.rows.map((row) => normalizeDomain(row.valeur)),
	];
	return new Set(roots.filter((root): root is string => !!root));
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "2000")));
	const concurrency = Math.max(1, Math.min(48, Number(option("concurrency", "24"))));
	const motif = option("motif", "slug") as RootPattern;
	if (!(motif in ROOT_PATTERNS)) throw new Error(`unknown --motif=${motif}`);
	const outputPath = option("output", `bench/results/domains-from-communes-na-${motif}.json`);
	const before = await measure();
	const communes = loadCommunes(await readFile(option("input", DEFAULT_REFERENTIEL), "utf8"));
	const selected = selectCommuneDomains(
		await candidateOrganisations(), communes, await attributedRoots(), motif,
	).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyCommuneDomain(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry): entry is { selection: CommuneSelection; verdict: Verdict } => !!entry.verdict);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const { selection, verdict } of accepted) {
				const proof = provenanceForCommune(selection, verdict);
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
