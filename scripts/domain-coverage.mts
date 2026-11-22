/**
 * Reproducible measurement of verified organisation domains with provenance.
 *
 * Scope: Nouvelle-Aquitaine organisations only. A domain counts when the
 * organisation stores a clean domain and an `org_enrichissement` row records
 * the same value, its source, a confidence score and an HTTP-verified proof.
 *
 * Usage:
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/domain-coverage.mts
 */
import { closePools, query } from "../apps/api/src/db.js";
import { pathToFileURL } from "node:url";

export const NOUVELLE_AQUITAINE_DEPTS = new Set([
	"16", "17", "18", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
]);

export const MINIMUM_CONFIDENCE = 0.8;

export interface Organisation {
	id: number;
	dept: string | null;
	domain: string | null;
}

export interface Provenance {
	orgId: number;
	champ: string;
	valeur: string;
	source: string;
	confiance: number;
	preuve: Record<string, unknown> | null;
}

export interface CoverageRow {
	organisation: Organisation;
	provenance: Provenance | null;
}

export interface CoverageSummary {
	organisations: number;
	nouvelleAquitaine: number;
	withDomain: number;
	withVerifiedProvenance: number;
	coveragePercent: number;
}

/** Lowercase host without protocol, path, credentials or leading www. */
export function normalizeDomain(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) return null;
	const withoutProtocol = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
	const host = withoutProtocol.split(/[/?#@]/, 1)[0].replace(/:\d+$/, "");
	const root = host.replace(/^www\./, "").replace(/\.$/, "");
	if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(root)) return null;
	if (root.split(".").some((label) => label.startsWith("-") || label.endsWith("-"))) return null;
	if (!/^[a-z]{2,}$/.test(root.split(".").at(-1) ?? "")) return null;
	return root;
}

export function inNouvelleAquitaine(dept: string | null | undefined): boolean {
	return typeof dept === "string" && NOUVELLE_AQUITAINE_DEPTS.has(dept.trim().padStart(2, "0"));
}

/** Strict definition of "verified domain with provenance" for one organisation. */
export function hasVerifiedProvenance(row: CoverageRow): boolean {
	const domain = normalizeDomain(row.organisation.domain);
	if (!domain || !inNouvelleAquitaine(row.organisation.dept)) return false;
	const proof = row.provenance;
	if (!proof || proof.champ !== "domaine" || normalizeDomain(proof.valeur) !== domain) return false;
	if (!proof.source.trim() || !(proof.confiance >= MINIMUM_CONFIDENCE)) return false;
	const details = proof.preuve;
	if (!details || String(details.statut) !== "200") return false;
	return typeof details.urlFinale === "string" && normalizeDomain(details.urlFinale) === domain;
}

export function summarizeCoverage(rows: CoverageRow[], organisations: number, nouvelleAquitaineTotal: number): CoverageSummary {
	let withDomain = 0;
	let withVerifiedProvenance = 0;
	for (const row of rows) {
		if (!inNouvelleAquitaine(row.organisation.dept)) continue;
		if (!normalizeDomain(row.organisation.domain)) continue;
		withDomain += 1;
		if (hasVerifiedProvenance(row)) withVerifiedProvenance += 1;
	}
	return {
		organisations,
		nouvelleAquitaine: nouvelleAquitaineTotal,
		withDomain,
		withVerifiedProvenance,
		coveragePercent: nouvelleAquitaineTotal
			? Number(((100 * withVerifiedProvenance) / nouvelleAquitaineTotal).toFixed(4))
			: 0,
	};
}

export function formatCoverage(summary: CoverageSummary): string {
	return [
		`organisations_total=${summary.organisations}`,
		`organisations_nouvelle_aquitaine=${summary.nouvelleAquitaine}`,
		`organisations_avec_domaine=${summary.withDomain}`,
		`organisations_avec_domaine_verifie_et_provenance=${summary.withVerifiedProvenance}`,
		`couverture_pourcent=${summary.coveragePercent}`,
	].join("\n");
}

/** Reads only domain-bearing rows: 1.6 M organisations never leave the database. */
export async function measure(): Promise<CoverageSummary> {
	const totals = await query<{ total: string; na: string }>(
		"SELECT count(*)::text AS total, count(*) FILTER (WHERE dept = ANY($1::text[]))::text AS na FROM org",
		[[...NOUVELLE_AQUITAINE_DEPTS]],
	);
	const rows = await query<{
		id: number;
		dept: string | null;
		domain: string | null;
		e_org_id: number | null;
		champ: string | null;
		valeur: string | null;
		source: string | null;
		confiance: number | null;
		preuve: Record<string, unknown> | null;
	}>(`
		SELECT o.id, o.dept, o.domain, e.org_id AS e_org_id, e.champ, e.valeur,
		       e.source, e.confiance, e.preuve
		FROM org o
		LEFT JOIN org_enrichissement e ON e.org_id = o.id AND e.champ = 'domaine'
		WHERE (o.domain IS NOT NULL AND btrim(o.domain) <> '') OR e.org_id IS NOT NULL
	`);
	const coverage = rows.rows.map<CoverageRow>((row) => ({
		organisation: { id: row.id, dept: row.dept, domain: row.domain },
		provenance: row.e_org_id === null ? null : {
			orgId: row.e_org_id,
			champ: row.champ ?? "",
			valeur: row.valeur ?? "",
			source: row.source ?? "",
			confiance: Number(row.confiance ?? 0),
			preuve: row.preuve,
		},
	}));
	return summarizeCoverage(coverage, Number(totals.rows[0]?.total ?? 0), Number(totals.rows[0]?.na ?? 0));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const summary = await measure();
	console.log(formatCoverage(summary));
	console.log(JSON.stringify(summary));
	await closePools();
}
