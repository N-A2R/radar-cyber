/**
 * Loads the provider map from the database into the pure report builder.
 *
 * Only organizations referenced by an observation are loaded (about 1,400,
 * not the 1.67 million-row referential). No organization name leaves SQL:
 * the public response contains identifiers, aggregates and map points only.
 */

import { query } from "../db.js";
import { chargerCatalogue } from "../dns/store.js";
import {
	buildProviderConcentration,
	NA_DEPARTMENTS,
	type BuildProviderConcentrationInput,
	type OrganizationRef,
	type ProviderConcentrationReport,
	type ProviderObservation,
} from "./provider-concentration.js";

export async function loadProviderConcentrationInputs(): Promise<BuildProviderConcentrationInput> {
	const [organizations, observations, catalogue, total] = await Promise.all([
		query<OrganizationRef>(
			`SELECT id, dept, lat, lon
			   FROM org
			  WHERE id IN (SELECT unnest(org_ids) FROM provider_domain)`,
		),
		query<ProviderObservation>(
			`SELECT domain,
			        org_ids AS "orgIds",
			        ns,
			        mx,
			        errors,
			        observed_at::text AS "observedAt"
			   FROM provider_domain
			  ORDER BY domain`,
		),
		chargerCatalogue(),
		query<{ n: string }>(
			`SELECT reltuples::bigint::text AS n
			   FROM pg_class
			  WHERE relname = 'org' AND relkind = 'r'`,
		),
	]);

	return {
		organizations: organizations.rows,
		observations: observations.rows.map((row) => ({ ...row, orgIds: row.orgIds ?? [] })),
		catalogue,
		totalOrganizations: Number(total.rows[0]?.n ?? 0),
	};
}

export async function loadProviderConcentration(
	generatedAt: Date = new Date(),
): Promise<ProviderConcentrationReport> {
	const inputs = await loadProviderConcentrationInputs();
	return buildProviderConcentration({ ...inputs, generatedAt: generatedAt.toISOString() });
}
