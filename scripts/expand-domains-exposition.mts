/**
 * Septième source grise : les URL déjà prouvées HTTP 200 par la collecte
 * d'exposition (OSM apparié par SIREN, annuaires administration/éducation,
 * registres DILA/RNA, FINESS, Wikidata) deviennent des domaines vérifiés avec
 * provenance pour les organisations de Nouvelle-Aquitaine qui n'en ont pas.
 *
 * Chaque candidat est revérifié en direct : statut 200, racine inchangée après
 * redirection, contenu réel et jeton distinctif du nom de l'organisation.
 * Une seule organisation par racine de domaine. Rien n'est écrit sans --apply.
 *
 * Usage (DATABASE_URL sélectionne la base) :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/expand-domains-exposition.mts \
 *       [--limit=1000] [--concurrency=32] [--apply]
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import {
	inNouvelleAquitaine, measure, normalizeDomain, NOUVELLE_AQUITAINE_DEPTS,
} from "./domain-coverage.mts";
import {
	domainRoot, fetchPage, pageVerdict, withConcurrency, type Organisation, type Verdict,
} from "./expand-domains.mts";

export const SOURCE = "exposition-service:http200";

/** Registries whose URL is published for the organisation itself, not a marketplace. */
export const TRUSTED_SOURCES = new Set([
	"administration-http-200", "dila-http-200", "education-http-200", "finess-site-http-200",
	"osm-http-200", "osm-siret-http-200", "registry-id-http-200", "rna-http-200",
	"site-zone-http-200", "wikidata-http-200", "wikidata-id-http-200",
]);

/** Hosts that belong to a directory or a marketplace, never to one organisation. */
export const PLATFORM_ROOTS = new Set([
	"francetravail.fr", "orpi.com", "planity.com", "intramuros.org", "emeis.fr",
	"colisee.fr", "cmso.com", "retab.fr", "facebook.com", "instagram.com",
	"linkedin.com", "twitter.com", "youtube.com", "wikipedia.org", "google.fr", "google.com",
]);

export interface ExpositionRow {
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
	consultedAt: string;
}

export interface ExpositionSelection {
	row: ExpositionRow;
	organisation: Organisation;
	domain: string;
}

/** Only one candidate per organisation and per domain root, from trusted registries. */
export function selectExpositionCandidates(
	rows: ExpositionRow[],
	usedDomains: ReadonlySet<string>,
): ExpositionSelection[] {
	const usedOrgs = new Set<number>();
	const roots = new Set(usedDomains);
	const selected: ExpositionSelection[] = [];
	for (const row of rows) {
		if (!TRUSTED_SOURCES.has(row.source) || usedOrgs.has(row.orgId)) continue;
		if (!inNouvelleAquitaine(row.dept)) continue;
		const domain = normalizeDomain(row.evidenceDomain);
		if (!domain || PLATFORM_ROOTS.has(domain) || roots.has(domain)) continue;
		if (domainRoot(row.sourceUrl) !== domain) continue;
		usedOrgs.add(row.orgId);
		roots.add(domain);
		selected.push({
			row,
			organisation: {
				id: row.orgId, name: row.name, city: row.city, dept: row.dept, siren: row.siren, domain: row.evidenceDomain,
			},
			domain,
		});
	}
	return selected;
}

/** Provenance row tied to the original exposition evidence and the live HTTP check. */
export function provenanceForExposition(selection: ExpositionSelection, verdict: Verdict) {
	return {
		source: SOURCE,
		confiance: verdict.confidence,
		preuve: {
			serviceId: selection.row.serviceId,
			registre: selection.row.source,
			provider: selection.row.provider,
			urlSource: selection.row.sourceUrl,
			statut: verdict.status,
			urlFinale: verdict.finalUrl,
			titre: verdict.title,
			token: verdict.token,
			motif: verdict.motif,
		},
	};
}

/** Reads only registry rows already proved HTTP 200 and still without domain. */
export async function expositionCandidates(): Promise<ExpositionRow[]> {
	const { rows } = await query<ExpositionRow>(`
		SELECT e.id AS "serviceId", e.org_id AS "orgId", o.name, o.city, o.dept, o.siren,
		       e.source, e.source_url AS "sourceUrl", e.evidence->>'provider' AS provider,
		       e.evidence->>'domain' AS "evidenceDomain", e.consulted_at::text AS "consultedAt"
		FROM exposition_service e
		JOIN org o ON o.id = e.org_id
		WHERE o.dept = ANY($1::text[])
		  AND (o.domain IS NULL OR btrim(o.domain) = '')
		  AND e.evidence->>'status' = '200'
		  AND e.evidence ? 'domain'
		ORDER BY CASE e.source
			WHEN 'finess-site-http-200' THEN 1 WHEN 'administration-http-200' THEN 2
			WHEN 'education-http-200' THEN 3 WHEN 'osm-siret-http-200' THEN 4
			WHEN 'rna-http-200' THEN 5 WHEN 'dila-http-200' THEN 6
			WHEN 'registry-id-http-200' THEN 7 WHEN 'wikidata-http-200' THEN 8
			WHEN 'osm-http-200' THEN 9 ELSE 10 END,
			e.consulted_at DESC
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
	const limit = Math.max(1, Number(option("limit", "1000")));
	const concurrency = Math.max(1, Math.min(128, Number(option("concurrency", "64"))));
	const outputPath = option("output", "bench/results/domains-from-exposition.json");
	const before = await measure();
	const selected = selectExpositionCandidates(await expositionCandidates(), await attributedDomains()).slice(0, limit);
	const verdicts = await withConcurrency(selected, concurrency, async (selection) => {
		try {
			const page = await fetchPage(selection.row.sourceUrl);
			return pageVerdict(page.html, page.status, page.finalUrl, selection.organisation, selection.domain);
		} catch (error) {
			return {
				ok: false, motif: `fetch-${error instanceof Error ? error.name : "error"}`,
				token: null, confidence: 0, title: null, status: null, finalUrl: null, htmlLength: 0,
			} satisfies Verdict;
		}
	});
	const accepted = selected
		.map((selection, index) => ({ selection, verdict: verdicts[index] }))
		.filter((entry) => entry.verdict.ok);
	if (apply && accepted.length) {
		await withTransaction(async (client) => {
			for (const entry of accepted) {
				const proof = provenanceForExposition(entry.selection, entry.verdict);
				await client.query(
					"UPDATE org SET domain = $2, website = $3 WHERE id = $1 AND (domain IS NULL OR btrim(domain) = '')",
					[entry.selection.organisation.id, entry.selection.domain, entry.selection.row.sourceUrl],
				);
				await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
					 VALUES ($1, 'domaine', $2, $3, $4, $5::jsonb)
					 ON CONFLICT (org_id, champ) DO NOTHING`,
					[entry.selection.organisation.id, entry.selection.domain, proof.source, proof.confiance, JSON.stringify(proof.preuve)],
				);
			}
		});
	}
	const after = await measure();
	const report = {
		selected: selected.length,
		verified: accepted.length,
		applied: apply,
		before,
		after,
		domains: accepted.map((entry) => ({
			orgId: entry.selection.organisation.id,
			siren: entry.selection.organisation.siren,
			name: entry.selection.organisation.name,
			domain: entry.selection.domain,
			registry: entry.selection.row.source,
			confidence: entry.verdict.confidence,
		})),
	};
	await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
	console.log(`selected=${selected.length} verified=${accepted.length} applied=${apply}`);
	console.log(`verified_domain_coverage=${before.withVerifiedProvenance} -> ${after.withVerifiedProvenance}`);
	console.log(`coverage_percent=${before.coveragePercent} -> ${after.coveragePercent}`);
	await closePools();
}
