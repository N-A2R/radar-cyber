/**
 * Dix-neuvième route grise : le corpus versionné d'observations TLS/DMARC de
 * Nouvelle-Aquitaine contient 163 domaines publics jamais repris par les
 * routes de vérification. Un domaine n'est retenu que si un jeton distinctif
 * de sa racine nomme une seule organisation de la région sans domaine, puis
 * uniquement si la page passe la preuve stricte inchangée en direct (statut
 * 200, racine stable après redirection, contenu réel, jeton du nom publié).
 *
 * Le corpus est produit par collect-security-signals.mts à partir de sources
 * publiques et gratuites ; aucune donnée personnelle n'est lue ni écrite,
 * aucune racine déjà attribuée n'est reprise, rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@127.0.0.1:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-securite.mts \
 *       [--limit=500] [--concurrency=16] [--apply]
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS } from "./domain-coverage.mts";
import {
	distinctiveTokens, domainRoot, fetchPage, pageVerdict, withConcurrency, type Organisation, type Verdict,
} from "./expand-domains.mts";
import { attributedDomains } from "./expand-domains-exposition.mts";

export const SOURCE = "corpus:observations-securite:http200";
export const CORPUS = "bench/corpus/security-observations-na.jsonl";

export interface Observation {
	domain: string;
	sector: string | null;
	observedAt: string | null;
}
export interface NamedOrganisation extends Organisation {
	name_norm: string | null;
}

export interface ObservationSelection {
	observation: Observation;
	organisation: Organisation;
	domain: string;
	token: string;
}

export interface ObservationResult {
	verdict: Verdict;
	url: string;
}

/** One labelled public observation per unique valid domain root. */
export function parseObservations(lines: string[]): Observation[] {
	const seen = new Set<string>();
	const observations: Observation[] = [];
	for (const line of lines) {
		if (!line.trim()) continue;
		let row: Record<string, unknown>;
		try {
			row = JSON.parse(line) as Record<string, unknown>;
		} catch {
			continue;
		}
		const domain = normalizeDomain(typeof row.domain === "string" ? row.domain : null);
		if (!domain || domain.split(".").length !== 2 || seen.has(domain)) continue;

		seen.add(domain);
		observations.push({
			domain,
			sector: typeof row.sector === "string" ? row.sector : null,
			observedAt: typeof row.observedAt === "string" ? row.observedAt : null,
		});
	}
	return observations;
}

/** Directory words that cannot identify one organisation on their own. */
export const DOMAIN_STOPWORDS = new Set([
	"agglo", "agglomeration", "commune", "departement", "entreprise", "entreprises",
	"groupe", "index", "office", "service", "services", "site", "tourisme", "ville",
]);

/** Distinctive root labels of a domain, never the TLD or a numeric label. */
export function domainTokens(domain: string): string[] {
	const labels = domain.split(".").slice(0, -1).flatMap((label) => label.split("-"));
	return [...new Set(labels.flatMap((label) => distinctiveTokens(label, null))
		.filter((token) => token.length >= 5 && !DOMAIN_STOPWORDS.has(token)))];
}

/** Legal-form words distinguish an organisation from a personal name. */
export const LEGAL_FORMS = /\b(sarl|eurl|sas|sasu|sca|sci|scop|soc|coop|agricole|cave|commune|mairie|association|syndicat|etablissement|societe|societe civile|groupe|holding|clinique|hopital|lycee|college|ecole|universite|cabinet|atelier|garage|hotel|restaurant|boulangerie|boucherie|cooperative|banque|assurance|transport|logistique|immobilier|immobiliere)\b/i;

export function compactName(value: string): string {
	return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Exact root name first, then a single legal entity named by the token. */
export function chooseOrganisation(matches: NamedOrganisation[], domain: string, token: string): NamedOrganisation | null {
	const named = matches.filter((org) => matchesName(org.name_norm, token));
	if (named.length === 0) return null;
	const root = compactName(domain.split(".")[0] ?? "");
	const exact = named.filter((org) => compactName(org.name) === root);
	if (exact.length === 1) return exact[0];
	if (exact.length > 1 || named.length > 1) return null;
	return LEGAL_FORMS.test(named[0].name) ? named[0] : null;
}


/** An unambiguous whole-word match between a domain token and an org name. */
export function matchesName(nameNorm: string | null, token: string): boolean {
	if (!nameNorm) return false;
	return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`).test(nameNorm.toLowerCase());
}

/** Reads only NA organisations still without a domain, using the trigram index. */
export async function organisationsForToken(token: string): Promise<NamedOrganisation[]> {
	const { rows } = await query<NamedOrganisation>(`
		SELECT o.id, o.name, o.city, o.dept, o.siren, o.domain, o.name_norm
		FROM org o
		WHERE o.dept = ANY($1::text[])
		  AND (o.domain IS NULL OR btrim(o.domain) = '')
		  AND o.name_norm ILIKE $2
		LIMIT 20
	`, [[...NOUVELLE_AQUITAINE_DEPTS], `%${token}%`]);
	return rows;
}

/** One domain may only be attributed when a single organisation is named. */
export async function selectObservations(
	observations: Observation[],
	usedDomains: ReadonlySet<string>,
	limit = Number.POSITIVE_INFINITY,
): Promise<ObservationSelection[]> {
	const selected: ObservationSelection[] = [];
	for (const observation of observations) {
		if (selected.length >= limit) break;
		if (usedDomains.has(observation.domain)) continue;
		for (const token of domainTokens(observation.domain)) {
			const matches = await organisationsForToken(token);
			const organisation = chooseOrganisation(matches, observation.domain, token);
			if (!organisation) continue;
			selected.push({ observation, organisation, domain: observation.domain, token });
			break;
		}
	}
	return selected;
}

/** Strict live proof on the official root named by the public corpus. */
export async function verifyObservation(
	selection: ObservationSelection,
	fetcher: typeof fetchPage = fetchPage,
): Promise<ObservationResult | null> {
	const url = `https://${selection.domain}/`;
	try {
		const page = await fetcher(url);
		const verdict = pageVerdict(page.html, page.status, page.finalUrl, selection.organisation, selection.domain);
		return verdict.ok ? { verdict, url } : null;
	} catch {
		return null;
	}
}

/** Provenance tying the public observation, the org token and the live page. */
export function provenanceForObservation(selection: ObservationSelection, result: ObservationResult) {
	return {
		source: SOURCE,
		confiance: result.verdict.confidence,
		preuve: {
			corpus: CORPUS,
			secteur: selection.observation.sector,
			observeLe: selection.observation.observedAt,
			jetonRacine: selection.token,
			urlSource: result.url,
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
	const limit = Math.max(1, Number(option("limit", "500")));
	const concurrency = Math.max(1, Math.min(32, Number(option("concurrency", "16"))));
	const outputPath = option("output", "bench/results/domains-from-securite.json");
	const before = await measure();
	const observations = parseObservations((await readFile(CORPUS, "utf8")).split("\n"));
	const selected = await selectObservations(observations, await attributedDomains(), limit);
	const results = await withConcurrency(selected, concurrency, verifyObservation);
	const accepted = selected
		.map((selection, index) => ({ selection, result: results[index] }))
		.filter((entry): entry is { selection: ObservationSelection; result: ObservationResult } => entry.result !== null);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForObservation(entry.selection, entry.result);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.organisation.id, entry.selection.domain, `https://${entry.selection.domain}/`],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO UPDATE SET
					   valeur = EXCLUDED.valeur, source = EXCLUDED.source,
					   confiance = EXCLUDED.confiance, preuve = EXCLUDED.preuve, verifie_at = now()`,
					[entry.selection.organisation.id, entry.selection.domain, proof.source, proof.confiance, JSON.stringify(proof.preuve)],
				);
			}
		});
	}
	const after = await measure();
	await writeFile(outputPath, `${JSON.stringify({
		selected: selected.length,
		verified: accepted.length,
		applied: apply,
		before,
		after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			name: entry.selection.organisation.name,
			domain: entry.selection.domain,
			token: entry.selection.token,
			sector: entry.selection.observation.sector,
		})),
	}, null, 2)}\n`);
	console.log(`observations=${observations.length} selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
