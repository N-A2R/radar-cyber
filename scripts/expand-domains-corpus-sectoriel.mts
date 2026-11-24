/**
 * Nouvelle route grise : les URL officielles publiées par les corpus
 * sectoriels versionnés de Nouvelle-Aquitaine (agriculture, industrie,
 * collectivités, santé, transport...). Une organisation n'est retenue que si
 * le libellé du corpus nomme exactement la sienne, dans le même département,
 * et si la page répond encore en direct avec la preuve stricte inchangée.
 * Aucune écriture sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-corpus-sectoriel.mts \
 *       [--limit=200] [--concurrency=16] [--apply]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	inNouvelleAquitaine, measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import { domainRoot, pageVerdict, withConcurrency, type Verdict } from "./expand-domains.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "source:corpus-sectoriel:http200";
const CORPUS_DIR = "bench/corpus";

/** Plateformes tierces : une page hébergée ailleurs n'est pas le site de l'organisation. */
const THIRD_PARTY_ROOTS = new Set([
	"sites.google.com", "wordpress.com", "blogspot.com", "facebook.com",
	"wixsite.com", "index-education.net", "annuaire-entreprises.data.gouv.fr",
]);

const DEPARTMENT_NAMES: Record<string, string> = {
	charente: "16", "charente maritime": "17", correze: "19", creuse: "23",
	dordogne: "24", gironde: "33", landes: "40", "lot et garonne": "47",
	"pyrenees atlantiques": "64", "deux sevres": "79", vienne: "86", "haute vienne": "87",
};

export interface SiteRow {
	sourceId: string;
	sourceName: string;
	url: string;
	department: string | null;
	corpus: string;
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
	domain: string;
}

/** Accent-free comparison key, identical for a corpus label and an organisation name. */
export function nameKey(value: string): string {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
		.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** Accepts a two-digit code or the full French name of a Nouvelle-Aquitaine department. */
export function departmentCode(value: string | null | undefined): string | null {
	const raw = String(value ?? "").trim();
	if (/^\d{1,2}$/.test(raw)) {
		const code = raw.padStart(2, "0");
		return inNouvelleAquitaine(code) ? code : null;
	}
	return DEPARTMENT_NAMES[nameKey(raw)] ?? null;
}

/** One unambiguous exact-name match per organisation and per domain root. */
export function selectSectorSites(
	rows: SiteRow[],
	organisations: OrganisationRow[],
	attributed: ReadonlySet<string>,
): SiteSelection[] {
	const byName = new Map<string, OrganisationRow[]>();
	for (const org of organisations) {
		if (!inNouvelleAquitaine(org.dept)) continue;
		const key = `${org.dept!.trim().padStart(2, "0")}:${nameKey(org.name)}`;
		byName.set(key, [...(byName.get(key) ?? []), org]);
	}
	const selected: SiteSelection[] = [];
	const usedOrgs = new Set<number>();
	const usedRoots = new Set<string>();
	for (const row of rows) {
		const dept = departmentCode(row.department);
		const label = nameKey(row.sourceName);
		if (!dept || label.length < 5) continue;
		const matches = byName.get(`${dept}:${label}`) ?? [];
		if (matches.length !== 1) continue;
		const organisation = matches[0];
		const domain = domainRoot(row.url);
		if (!domain || !/\.[a-z]{2,}$/.test(domain) || THIRD_PARTY_ROOTS.has(domain)
			|| attributed.has(domain) || usedRoots.has(domain) || usedOrgs.has(organisation.id)) continue;
		usedRoots.add(domain);
		usedOrgs.add(organisation.id);
		selected.push({ row, organisation, domain });
	}
	return selected;
}

/** Strict live proof, unchanged from the other domain routes. */
export function siteVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: SiteSelection,
): Verdict {
	return pageVerdict(html, status, finalUrl, selection.organisation, selection.domain);
}

/** Re-verifies the catalogue URL live before accepting it. */
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

/** Provenance tying the corpus entry to the live HTTP proof. */
export function provenanceForSite(selection: SiteSelection, verdict: Verdict) {
	return {
		source: SOURCE,
		confiance: verdict.confidence,
		preuve: {
			sourceId: selection.row.sourceId,
			corpus: selection.row.corpus,
			catalogue: selection.row.sourceName,
			urlSource: selection.row.url,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: `${verdict.motif}:corpus-sectoriel-http200`,
			verifieLe: new Date().toISOString(),
		},
	};
}

/** Versioned sector corpora of Nouvelle-Aquitaine sources. */
export async function sectorSites(): Promise<SiteRow[]> {
	const files = (await readdir(CORPUS_DIR)).filter(
		(file) => file.startsWith("sources-") && file.endsWith(".jsonl"),
	);
	const rows: SiteRow[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		const content = await readFile(`${CORPUS_DIR}/${file}`, "utf8");
		for (const line of content.split("\n")) {
			if (!line.trim()) continue;
			try {
				const item = JSON.parse(line) as Record<string, unknown>;
				const rawUrl = typeof item.url_site === "string" ? item.url_site : item.url;
				const sourceName = typeof item.nom === "string" ? item.nom : item.name;
				if (typeof rawUrl !== "string" || !/^https?:\/\//i.test(rawUrl)
					|| typeof sourceName !== "string") continue;
				const sourceId = typeof item.id === "string" ? item.id : `${file}:${rows.length}`;
				const key = `${sourceName}|${rawUrl}`;
				if (seen.has(key)) continue;
				seen.add(key);
				rows.push({
					sourceId, sourceName, url: rawUrl,
					department: typeof item.departement === "string" ? item.departement : null,
					corpus: file,
				});
			} catch {
				continue;
			}
		}
	}
	return rows;
}

/** Organisations named by a corpus entry and still without domain. */
export async function candidateOrganisations(labels: string[]): Promise<OrganisationRow[]> {
	const { rows } = await query<OrganisationRow>(`
		SELECT id, name, city, dept, siren FROM org
		WHERE dept = ANY($1::text[])
		  AND (domain IS NULL OR btrim(domain) = '')
		  AND regexp_replace(translate(lower(name_norm), 'éèêëàâîïôûùç', 'eeeeaiiouuc'),
		                     '[^a-z0-9]+', ' ', 'g') = ANY($2::text[])
	`, [[...NOUVELLE_AQUITAINE_DEPTS], [...new Set(labels)]]);
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
	const limit = Math.max(1, Number(option("limit", "200")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "16"))));
	const outputPath = option("output", "bench/results/domains-from-corpus-sectoriel.json");
	const before = await measure();
	const rows = await sectorSites();
	const labels = rows.map((row) => nameKey(row.sourceName)).filter((label) => label.length >= 5);
	const selected = selectSectorSites(
		rows, await candidateOrganisations(labels), await attributedDomains(),
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
			domain: entry.selection.domain,
			page: entry.verdict.finalUrl,
			corpus: entry.selection.row.corpus,
			catalogue: entry.selection.row.sourceName,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
