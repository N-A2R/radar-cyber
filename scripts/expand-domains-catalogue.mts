/**
 * Dix-neuvième route grise : les URL officielles du catalogue de sources et du
 * corpus « population » (mairies, villes, communes de Nouvelle-Aquitaine)
 * déjà contrôlées HTTP 200. Une commune n'est retenue que si son nom désigne
 * explicitement une organisation et si la page répond encore en direct sur la
 * même racine avec le nom de la commune. Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-catalogue.mts \
 *       [--limit=500] [--concurrency=16] [--apply]
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	inNouvelleAquitaine, measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import { domainRoot, pageVerdict, withConcurrency, type Verdict } from "./expand-domains.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "source:catalogue-communal:http200";
const CORPUS = "bench/corpus/sources-na-population.jsonl";

export interface SiteRow {
	sourceId: string;
	sourceName: string;
	url: string;
	department: string | null;
}

export interface OrganisationRow {
	id: number;
	name: string;
	city: string | null;
	dept: string | null;
	siren: string | null;
}

export interface SiteSelection {
	row: SiteRow;
	organisation: OrganisationRow;
	commune: string;
	domain: string;
}

/** Accent-free comparison key for a commune name. */
export function communeKey(value: string): string {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Only an explicit « mairie/ville/commune de X » designation names the organisation. */
export function extractCommune(sourceName: string): string | null {
	const match = /(?:^|[—|\-]\s*)(?:actualités\s+[—|\-]\s*)?(mairie|ville|commune)\s+(de|d'|d’|du|des)\s+([^()]+)/i.exec(sourceName);
	if (!match) return null;
	const commune = communeKey(match[3].replace(/[—|].*$/, ""));
	return commune.length >= 3 ? commune : null;
}

/** Third-party publishing platforms are not the organisation's own site. */
const THIRD_PARTY_ROOTS = new Set([
	"sites.google.com", "wordpress.com", "blogspot.com", "facebook.com", "wixsite.com",
]);

/** Corpus entries naming one school exactly, without a commune designation. */
export function organisationLabel(sourceName: string): string | null {
	const cleaned = sourceName.replace(/^actualités\s+[—-]\s*/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
	if (!/^(collège|lycée|école|groupe scolaire)/i.test(cleaned)) return null;
	const label = communeKey(cleaned);
	return label.length >= 5 ? label : null;
}

/** One official site per commune and per department, never an already used root. */
export function selectCatalogueSites(
	rows: SiteRow[],
	organisations: OrganisationRow[],
	attributed: ReadonlySet<string>,
): SiteSelection[] {
	const byCommune = new Map<string, OrganisationRow>();
	const byName = new Map<string, OrganisationRow[]>();
	for (const org of organisations) {
		if (!inNouvelleAquitaine(org.dept)) continue;
		const dept = org.dept!.trim().padStart(2, "0");
		const commune = extractCommune(org.name);
		if (commune && /^(commune|mairie|ville)\s+(de|d'|d’|du|des)\s/i.test(org.name)) {
			const key = `${dept}:${commune}`;
			if (!byCommune.has(key)) byCommune.set(key, org);
		}
		const nameKey = `${dept}:${communeKey(org.name)}`;
		byName.set(nameKey, [...(byName.get(nameKey) ?? []), org]);
	}
	const selected: SiteSelection[] = [];
	const usedOrgs = new Set<number>();
	const usedRoots = new Set<string>();
	for (const row of rows) {
		const dept = row.department?.trim().padStart(2, "0");
		if (!dept) continue;
		const commune = extractCommune(row.sourceName);
		const label = commune ?? organisationLabel(row.sourceName);
		if (!label) continue;
		const sameName = byName.get(`${dept}:${label}`) ?? [];
		const organisation = commune
			? byCommune.get(`${dept}:${commune}`)
			: sameName.length === 1 ? sameName[0] : undefined;
		if (!organisation || usedOrgs.has(organisation.id)) continue;
		const domain = normalizeDomain(row.url);
		if (!domain || !/\.fr$/.test(domain) || THIRD_PARTY_ROOTS.has(domain)
			|| attributed.has(domain) || usedRoots.has(domain)) continue;
		if (domainRoot(row.url) !== domain) continue;
		usedOrgs.add(organisation.id);
		usedRoots.add(domain);
		selected.push({ row, organisation, commune: label, domain });
	}
	return selected;
}

/** Strict live proof on the official URL, with the commune named on the page. */
export function siteVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: SiteSelection,
): Verdict {
	const verdict = pageVerdict(html, status, finalUrl, selection.organisation, selection.domain);
	if (!verdict.ok) return verdict;
	const text = html.replace(/<[^>]+>/g, " ").normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "").toLowerCase();
	return communeKey(text).includes(selection.commune)
		? verdict
		: { ...verdict, ok: false, motif: "commune-absente-de-la-page", token: null, confidence: 0 };
}

/** Live re-check of the catalogue URL with the unchanged strict proof. */
export async function verifySite(
	selection: SiteSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<Verdict | null> {
	let page: Awaited<ReturnType<PageFetch>>;
	try {
		page = await fetcher(selection.row.url);
	} catch {
		return null;
	}
	const verdict = siteVerdict(page.html, page.status, page.finalUrl, selection);
	return verdict.ok ? verdict : null;
}

/** Provenance tying the catalogue entry to the live HTTP proof. */
export function provenanceForSite(selection: SiteSelection, verdict: Verdict) {
	return {
		source: SOURCE,
		confiance: verdict.confidence,
		preuve: {
			sourceId: selection.row.sourceId,
			catalogue: selection.row.sourceName,
			urlSource: selection.row.url,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			commune: selection.commune,
			motif: `${verdict.motif}:catalogue-http200`,
			verifieLe: new Date().toISOString(),
		},
	};
}

/** Source catalogue entries already verified HTTP 200. */
export async function catalogueSites(): Promise<SiteRow[]> {
	const { rows } = await query<SiteRow>(`
		SELECT s.id AS "sourceId", s.name AS "sourceName", s.url, s.department
		FROM source s
		JOIN LATERAL (
			SELECT v.code_http FROM source_verification v
			WHERE v.source_id = s.id AND v.code_http = 200
			ORDER BY v.verifie_at DESC LIMIT 1
		) v ON true
		WHERE s.url ~ '^https?://'
		  AND (s.name ~* '(mairie|ville|commune)\\s+(de|d.|du|des)' OR s.department IS NOT NULL)
		ORDER BY s.id
	`);
	return rows;
}

/** The versioned population corpus of Nouvelle-Aquitaine municipal sites. */
export async function corpusSites(): Promise<SiteRow[]> {
	const content = await readFile(CORPUS, "utf8");
	return content.split("\n").flatMap((line) => {
		if (!line.trim()) return [];
		try {
			const item = JSON.parse(line) as { id: string; name: string; url: string; department: string };
			return [{
				sourceId: item.id, sourceName: item.name, url: item.url, department: item.department,
			}];
		} catch {
			return [];
		}
	});
}

/** Organisations explicitly named by a catalogue entry and still without domain. */
export async function communeOrganisations(): Promise<OrganisationRow[]> {
	const { rows } = await query<OrganisationRow>(`
		SELECT id, name, city, dept, siren FROM org
		WHERE dept = ANY($1::text[])
		  AND (domain IS NULL OR btrim(domain) = '')
		  AND (name_norm LIKE 'commune %' OR name_norm LIKE 'mairie %'
		    OR name_norm LIKE 'ville %' OR name_norm LIKE 'college %'
		    OR name_norm LIKE 'lycee %' OR name_norm LIKE 'ecole %'
		    OR name_norm LIKE 'groupe scolaire %')
	`, [[...NOUVELLE_AQUITAINE_DEPTS]]);
	return rows;
}

/** Domains already attributed to an organisation, whatever its provenance. */
export async function attributedDomains(): Promise<Set<string>> {
	const { rows } = await query<{ domain: string }>(
		"SELECT lower(domain) AS domain FROM org WHERE domain IS NOT NULL AND btrim(domain) <> ''",
	);
	return new Set(rows.map((row) => normalizeDomain(row.domain)).filter((value): value is string => !!value));
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "500")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "16"))));
	const outputPath = option("output", "bench/results/domains-from-catalogue.json");
	const before = await measure();
	const selected = selectCatalogueSites(
		[...await catalogueSites(), ...await corpusSites()],
		await communeOrganisations(),
		await attributedDomains(),
	).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifySite(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry): entry is { selection: SiteSelection; verdict: Verdict } => !!entry.verdict);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForSite(entry.selection, entry.verdict);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.organisation.id, entry.selection.domain, entry.selection.row.url],
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
			commune: entry.selection.commune,
			domain: entry.selection.domain,
			page: entry.verdict.finalUrl,
			catalogue: entry.selection.row.sourceName,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
