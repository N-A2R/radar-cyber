/**
 * Nouvelle route grise : les annuaires officiels versionnés (éducation, santé,
 * communes) publient le SIREN de l'organisation, son nom et l'URL de son site.
 * Un domaine n'est accepté que si ce SIREN est exactement celui d'une
 * organisation de Nouvelle-Aquitaine sans domaine, si le département concorde,
 * si la racine n'est pas déjà attribuée et si la page répond encore en direct
 * avec la preuve stricte inchangée (statut 200, racine stable après
 * redirection, contenu réel, nom de l'établissement publié par la page).
 *
 * Le SIREN est un identifiant légal public d'organisation, jamais une donnée
 * personnelle. Aucune URL n'est devinée, aucun service payant n'est utilisé,
 * rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-siren-officiel.mts \
 *       [--limit=200] [--concurrency=16] [--apply]
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	inNouvelleAquitaine, measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import { departmentCode } from "./expand-domains-corpus-sectoriel.mts";
import {
	distinctiveTokens, domainRoot, GENERIC_TOKENS, pageVerdict, withConcurrency, type Verdict,
} from "./expand-domains.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "source:annuaire-officiel:siren:http200";
export const OFFICIAL_CORPORA = [
	"institutions-complet.jsonl", "sante-enseignement.jsonl", "communes.jsonl",
] as const;

/** Hosting and directory roots are not the organisation's own site. */
const THIRD_PARTY_ROOTS: Record<string, true> = {
	"sante.fr": true, "annuaire-entreprises.data.gouv.fr": true, "sites.google.com": true,
	"wordpress.com": true, "blogspot.com": true, "wixsite.com": true, "facebook.com": true, "instagram.com": true,
};

/** Words shared by every school or town hall cannot identify one organisation. */
const GENERIC_LABEL_TOKENS: Record<string, true> = {
	college: true, lycee: true, ecole: true, prive: true, institut: true, saint: true, sainte: true,
	notre: true, dame: true, mairie: true, ville: true, commune: true, office: true, groupe: true,
};

export interface OfficialSiteRow {
	entryId: string;
	corpus: string;
	label: string;
	siren: string;
	url: string;
	department: string | null;
}

export interface OfficialOrganisation {
	id: number;
	name: string;
	city: string | null;
	dept: string | null;
	siren: string;
}

export interface OfficialSelection {
	row: OfficialSiteRow;
	organisation: OfficialOrganisation;
	domain: string;
	token: string;
}

/** Normalises three-digit INSEE departments as well as names such as « Gironde ». */
export function officialDepartment(value: string | null | undefined): string | null {
	const raw = String(value ?? "").trim();
	return departmentCode(/^0\d{2}$/.test(raw) ? raw.slice(1) : raw);
}

/** One line of an official corpus becomes a candidate only with a legal ID and a URL. */
export function parseOfficialSite(
	corpus: string,
	line: string,
): OfficialSiteRow | null {
	let item: Record<string, unknown>;
	try {
		item = JSON.parse(line) as Record<string, unknown>;
	} catch {
		return null;
	}
	const siren = item.siren;
	const url = item.url_preuve ?? item.url_finale ?? item.url_candidate ?? item.url;
	const label = item.nom ?? item.name ?? item.organisation;
	if (typeof siren !== "string" || !/^\d{9}$/.test(siren)
		|| typeof url !== "string" || !/^https?:\/\//i.test(url)
		|| typeof label !== "string" || label.trim().length < 5) return null;
	const department = item.departement ?? item["département"];
	return {
		entryId: typeof item.id === "string" ? item.id : `${corpus}:${siren}`,
		corpus,
		label: label.trim(),
		siren,
		url,
		department: typeof department === "string" ? department : null,
	};
}

/** A distinctive word of the published establishment name, not a city or a school type. */
export function labelToken(label: string, city: string | null): string | null {
	const cityTokens = new Set(distinctiveTokens(city ?? "", null));
	return distinctiveTokens(label, null).find((token) => token.length >= 5
		&& !GENERIC_TOKENS.has(token) && !GENERIC_LABEL_TOKENS[token]
		&& !/^(?:colleg|lyce|ecol|instit|professionnel|saint|sainte|notre|dame|marie)/.test(token)
		&& !cityTokens.has(token)) ?? null;
}

/** One strictly identified site per organisation, whatever other organisations share the root. */
export function selectOfficialSites(
	rows: OfficialSiteRow[],
	organisations: OfficialOrganisation[],
): OfficialSelection[] {
	const bySiren = new Map<string, OfficialOrganisation[]>();
	for (const organisation of organisations) {
		if (!inNouvelleAquitaine(organisation.dept) || !/^\d{9}$/.test(organisation.siren)) continue;
		bySiren.set(organisation.siren, [...(bySiren.get(organisation.siren) ?? []), organisation]);
	}
	const byScore = new Map<string, OfficialSelection>();
	const usedRoots = new Set<string>();
	for (const row of rows) {
		const matches = bySiren.get(row.siren) ?? [];
		if (matches.length !== 1) continue;
		const organisation = matches[0];
		const dept = officialDepartment(row.department);
		if (dept && dept !== organisation.dept?.trim().padStart(2, "0")) continue;
		const domain = normalizeDomain(domainRoot(row.url));
		if (!domain || !/\.[a-z]{2,}$/.test(domain) || THIRD_PARTY_ROOTS[domain]
			|| usedRoots.has(domain)) continue;
		const token = labelToken(row.label, organisation.city);
		if (!token) continue;
		let parsed: URL;
		try {
			parsed = new URL(row.url);
		} catch {
			continue;
		}
		if (parsed.pathname !== "/" && parsed.pathname !== ""
			&& !parsed.pathname.toLowerCase().includes(token)) continue;
		const score = (domain.includes(token) ? 2 : 0) + (parsed.pathname.includes(token) ? 1 : 0);
		const key = String(organisation.id);
		const previous = byScore.get(key);
		if (!previous || score > previous.score) {
			byScore.set(key, { score, selection: { row, organisation, domain, token } });
			if (previous) usedRoots.delete(previous.selection.domain);
			usedRoots.add(domain);
		}
	}
	return [...byScore.values()]
		.sort((left, right) => left.selection.organisation.id - right.selection.organisation.id)
		.map((entry) => entry.selection);
}

/** Strict live proof, with the identity published by the official corpus. */
export function officialVerdict(
	html: string,
	status: number,
	finalUrl: string,
	selection: OfficialSelection,
): Verdict {
	return pageVerdict(html, status, finalUrl, {
		...selection.organisation,
		name: selection.token,
		city: null,
	}, selection.domain);
}

/** Re-verifies the official URL live before accepting it. */
export async function verifyOfficialSite(
	selection: OfficialSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<Verdict | null> {
	let page: Awaited<ReturnType<PageFetch>>;
	try {
		page = await fetcher(selection.row.url);
	} catch {
		return null;
	}
	const verdict = officialVerdict(page.html, page.status, page.finalUrl, selection);
	return verdict.ok ? verdict : null;
}

/** Provenance tying the official directory entry to the live HTTP proof. */
export function provenanceForOfficial(selection: OfficialSelection, verdict: Verdict) {
	return {
		source: SOURCE,
		confiance: verdict.confidence,
		preuve: {
			siren: selection.row.siren,
			corpus: selection.row.corpus,
			entree: selection.row.entryId,
			libelleAnnuaire: selection.row.label,
			urlSource: selection.row.url,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: `${verdict.motif}:annuaire-officiel-http200`,
			verifieLe: new Date().toISOString(),
		},
	};
}

/** Official, versioned and non-paid corpora of Nouvelle-Aquitaine organisations. */
export async function officialSites(): Promise<OfficialSiteRow[]> {
	const rows: OfficialSiteRow[] = [];
	for (const corpus of OFFICIAL_CORPORA) {
		const content = await readFile(`bench/corpus/${corpus}`, "utf8");
		for (const line of content.split("\n")) {
			if (!line.trim()) continue;
			const row = parseOfficialSite(corpus, line);
			if (row) rows.push(row);
		}
	}
	return rows;
}

/** Organisations with no domain whose SIREN is published by an official corpus. */
export async function candidateOrganisations(sirens: string[]): Promise<OfficialOrganisation[]> {
	const unique = [...new Set(sirens)];
	if (!unique.length) return [];
	const { rows } = await query<OfficialOrganisation>(`
		SELECT id, name, city, dept, siren FROM org
		WHERE siren = ANY($1::text[])
		  AND dept = ANY($2::text[])
		  AND (domain IS NULL OR btrim(domain) = '')
	`, [unique, [...NOUVELLE_AQUITAINE_DEPTS]]);
	return rows;
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "200")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "16"))));
	const outputPath = option("output", "bench/results/domains-from-annuaire-officiel.json");
	const before = await measure();
	const rows = await officialSites();
	const selected = selectOfficialSites(
		rows, await candidateOrganisations(rows.map((row) => row.siren)),
	).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			return await verifyOfficialSite(selection);
		} catch {
			return null;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry): entry is { selection: OfficialSelection; verdict: Verdict } => !!entry.verdict);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForOfficial(entry.selection, entry.verdict);
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
			siren: entry.selection.row.siren,
			domain: entry.selection.domain,
			page: entry.verdict.finalUrl,
			corpus: entry.selection.row.corpus,
			label: entry.selection.row.label,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
