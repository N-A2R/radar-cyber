/**
 * Seizième route grise (complément) : les communiqués officiels versionnés dans
 * bench/corpus/incidents-*.jsonl publient l'URL du site de l'organisation elle-
 * même, et non d'un article de presse. Une racine n'est acceptée que si le nom
 * de l'organisation du communiqué et celui d'une organisation de Nouvelle-
 * Aquitaine partagent un jeton distinctif, et si la racine répond encore en
 * direct avec la preuve stricte inchangée (statut 200, racine stable, contenu
 * réel, jeton du nom publié par la page). Aucune écriture sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-communiques.mts \
 *       [--limit=200] [--concurrency=16] [--apply]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	inNouvelleAquitaine, measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import {
	distinctiveTokens, domainRoot, GENERIC_TOKENS, pageVerdict, withConcurrency, type Verdict,
} from "./expand-domains.mts";
import { attributedDomains } from "./expand-domains-exposition.mts";
import { fetchRetryPage, type PageFetch } from "./expand-domains-retry.mts";

export const SOURCE = "corpus:communique-officiel:http200";
export const CORPUS_DIR = "bench/corpus";
const OFFICIAL = /\(communiqué officiel\)/i;

export interface CommuniqueRow {
	id: string;
	organisation: string;
	source: string;
	url: string;
}

export interface CommuniqueSelection {
	row: CommuniqueRow;
	orgId: number;
	name: string;
	siren: string | null;
	domain: string;
	token: string;
}

export interface CommuniqueResult {
	verdict: Verdict;
	url: string;
}

/** Only first-party official statements, never a press article or an aggregator. */
export function officialCommuniques(rows: CommuniqueRow[]): CommuniqueRow[] {
	return rows.filter((row) => OFFICIAL.test(row.source) && domainRoot(row.url) !== null);
}

/** The host label must name the organisation, not a city or a generic word. */
export function namedRoot(row: CommuniqueRow): { domain: string; token: string } | null {
	const domain = normalizeDomain(domainRoot(row.url));
	if (!domain) return null;
	const label = domain.split(".")[0];
	if (label.length < 5 || GENERIC_TOKENS.has(label)) return null;
	const tokens = distinctiveTokens(row.organisation, null);
	return tokens.includes(label) ? { domain, token: label } : null;
}

/** Loads every versioned incident corpus and keeps its official statements. */
export async function loadOfficialCommuniques(dir: string = CORPUS_DIR): Promise<CommuniqueRow[]> {
	const files = (await readdir(dir)).filter((name) => /^incidents-.*\.jsonl$/.test(name));
	const rows: CommuniqueRow[] = [];
	for (const file of files) {
		const lines = (await readFile(`${dir}/${file}`, "utf8")).split("\n").filter(Boolean);
		for (const line of lines) {
			const parsed = JSON.parse(line) as Partial<CommuniqueRow>;
			if (typeof parsed.id === "string" && typeof parsed.organisation === "string"
				&& typeof parsed.source === "string" && typeof parsed.url === "string") {
				rows.push(parsed as CommuniqueRow);
			}
		}
	}
	return officialCommuniques(rows);
}

/** A single NA organisation must carry the distinctive token of the statement. */
export async function matchOrganisations(
	rows: CommuniqueRow[],
	usedDomains: ReadonlySet<string> = new Set(),
): Promise<CommuniqueSelection[]> {
	const selected: CommuniqueSelection[] = [];
	const usedOrgs = new Set<number>();
	for (const row of rows) {
		const named = namedRoot(row);
		if (!named || usedDomains.has(named.domain)) continue;
		const { rows: matches } = await query<{
			id: number; name: string; city: string | null; dept: string | null; siren: string | null;
		}>(
			`SELECT id, name, city, dept, siren FROM org
			 WHERE name_norm ~* $1 AND dept = ANY($2::text[])
			   AND (domain IS NULL OR btrim(domain) = '') LIMIT 25`,
			[`\\y${named.token}\\y`, [...NOUVELLE_AQUITAINE_DEPTS]],
		);
		for (const match of matches) {
			if (usedOrgs.has(match.id) || !inNouvelleAquitaine(match.dept)) continue;
			if (!distinctiveTokens(match.name, match.city).includes(named.token)) continue;
			selected.push({ row, orgId: match.id, name: match.name, siren: match.siren, ...named });
			usedOrgs.add(match.id);
			break;
		}
	}
	return selected;
}

/** Strict live verification of the official root, never of the statement URL. */
export async function verifyCommuniqueRoot(
	selection: CommuniqueSelection,
	fetcher: PageFetch = fetchRetryPage,
): Promise<CommuniqueResult | null> {
	const url = `https://${selection.domain}/`;
	let page: Awaited<ReturnType<PageFetch>>;
	try {
		page = await fetcher(url);
	} catch {
		return null;
	}
	const verdict = pageVerdict(
		page.html, page.status, page.finalUrl,
		{ id: selection.orgId, name: selection.name, city: null, dept: null, siren: selection.siren },
		selection.domain,
	);
	return verdict.ok ? { verdict, url } : null;
}

/** Provenance tying the versioned official statement to the live strict proof. */
export function provenanceForCommunique(selection: CommuniqueSelection, result: CommuniqueResult) {
	return {
		source: SOURCE,
		confiance: result.verdict.confidence,
		preuve: {
			corpusId: selection.row.id,
			communique: selection.row.source,
			urlCommunique: selection.row.url,
			urlRacine: result.url,
			statut: result.verdict.status,
			urlFinale: result.verdict.finalUrl,
			titre: result.verdict.title,
			token: result.verdict.token,
			motif: result.verdict.motif,
			verifieLe: new Date().toISOString(),
		},
	};
}

function option(name: string, fallback: string): string {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const apply = process.argv.includes("--apply");
	const limit = Math.max(1, Number(option("limit", "200")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "16"))));
	const outputPath = option("output", "bench/results/domains-from-communiques.json");
	const before = await measure();
	const selected = (await matchOrganisations(await loadOfficialCommuniques(), await attributedDomains())).slice(0, limit);
	const results = await withConcurrency(selected, concurrency, (selection) => verifyCommuniqueRoot(selection));
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: CommuniqueSelection; result: CommuniqueResult } => !!entry.result);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForCommunique(entry.selection, entry.result);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.orgId, entry.selection.domain, proof.preuve.urlRacine],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO UPDATE SET
					   valeur = EXCLUDED.valeur, source = EXCLUDED.source,
					   confiance = EXCLUDED.confiance, preuve = EXCLUDED.preuve, verifie_at = now()`,
					[entry.selection.orgId, entry.selection.domain, proof.source, proof.confiance, JSON.stringify(proof.preuve)],
				);
			}
		});
	}
	const after = await measure();
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length, verified: accepted.length, applied: apply, before, after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.orgId, name: entry.selection.name,
			corpusId: entry.selection.row.id, domain: entry.selection.domain,
			page: entry.result.url, token: entry.result.verdict.token,
		})),
	}, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
