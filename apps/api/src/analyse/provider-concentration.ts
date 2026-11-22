/**
 * Digital provider map for Nouvelle-Aquitaine organizations.
 *
 * This module is pure: no database, no network. It receives NS/MX observations
 * (table `provider_domain`), the public provider catalogue (`dns_fournisseur`)
 * and the minimum organization references needed (id, department, coordinates).
 * It returns an aggregated map and the number of organizations depending on
 * the same provider.
 *
 * Privacy rule: no organization name enters or leaves this module. The SIRENE
 * referential contains individuals; a public map may expose only identifiers
 * and aggregates. Provider and domain names are public technical data.
 */

import {
	MX_CATEGORIES,
	NS_CATEGORIES,
	providerFor,
	type DnsProvider,
	type DnsProviderCategory,
} from "../dns/historique.js";

/** The twelve departments of Nouvelle-Aquitaine, in regional order. */
export const NA_DEPARTMENTS = [
	"16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87",
] as const;

export type NaDepartment = (typeof NA_DEPARTMENTS)[number];

const NA_SET: ReadonlySet<string> = new Set(NA_DEPARTMENTS);

export function isNaDepartment(value: string | null | undefined): value is NaDepartment {
	return value != null && NA_SET.has(value);
}

/** One NS/MX observation of a domain, as stored in `provider_domain`. */
export interface ProviderObservation {
	domain: string;
	/** Organizations carrying this domain (org.domain or website host). */
	orgIds: number[];
	ns: string[];
	mx: string[];
	/** Errors per lookup, prefixed `doh:NS:` or `doh:MX:`. */
	errors: string[];
	observedAt?: string;
}

/** Minimum organization reference: never its name. */
export interface OrganizationRef {
	id: number;
	dept: string | null;
	lat: number | null;
	lon: number | null;
}

export interface ProviderMatch {
	name: string;
	categories: DnsProviderCategory[];
}

export interface ProviderUse {
	name: string;
	categories: DnsProviderCategory[];
	domains: number;
	organizations: number;
	/** Organizations per department (only the twelve NA departments). */
	departments: Record<string, number>;
}

export interface DepartmentConcentration {
	dept: NaDepartment;
	organizationsWithDomain: number;
	organizationsAttributed: number;
	providers: number;
	topProvider: { name: string; organizations: number } | null;
}

/** One map point: identifier and coordinates, never a name. */
export interface OrganizationPoint {
	orgId: number;
	dept: NaDepartment;
	lat: number | null;
	lon: number | null;
	providers: string[];
}

export interface UnknownHost {
	host: string;
	domains: number;
	records: Array<"NS" | "MX">;
}

export interface ProviderConcentrationReport {
	generatedAt: string;
	scope: {
		departments: readonly NaDepartment[];
		organizations: number;
	};
	totals: {
		organizations: number;
		organizationsWithDomain: number;
		organizationsAttributed: number;
		organizationsUnattributed: number;
		domainsObserved: number;
		domainsAttributed: number;
		domainsUnattributed: number;
		providers: number;
	};
	concentration: {
		topProvider: { name: string; organizations: number; share: number } | null;
		/** Share of attributed organizations using at least one of the top five. */
		top5Coverage: number;
		organizationsUsingMultipleProviders: number;
		organizationsUsingSingleProvider: number;
	};
	providers: ProviderUse[];
	departments: DepartmentConcentration[];
	organizationPoints: OrganizationPoint[];
	/** Unknown NS/MX hosts, kept as evidence to extend the catalogue. */
	unknownHosts: UnknownHost[];
}

export interface BuildProviderConcentrationInput {
	observations: readonly ProviderObservation[];
	organizations: readonly OrganizationRef[];
	catalogue: readonly DnsProvider[];
	/** Total NA organizations in the full referential. */
	totalOrganizations: number;
	generatedAt?: string;
}

/** True when the lookup failed for this type: no conclusion is possible. */
export function typeFailed(observation: ProviderObservation, type: "NS" | "MX"): boolean {
	return observation.errors.some((error) => error.startsWith(`doh:${type}:`));
}

/**
 * Providers of one observation, de-duplicated by name.
 *
 * A single provider can supply both DNS and mail (OVHcloud, Google): the
 * organization is counted once, but both categories remain visible as
 * evidence. A type whose lookup failed is never interpreted.
 */
export function attributeObservation(
	observation: ProviderObservation,
	catalogue: readonly DnsProvider[],
): ProviderMatch[] {
	const byName = new Map<string, Set<DnsProviderCategory>>();
	const collect = (hosts: readonly string[], categories: readonly DnsProviderCategory[]) => {
		for (const host of hosts) {
			const match = providerFor(host, catalogue, categories);
			if (!match) continue;
			const set = byName.get(match.name) ?? new Set<DnsProviderCategory>();
			set.add(match.category);
			byName.set(match.name, set);
		}
	};
	if (!typeFailed(observation, "NS")) collect(observation.ns, NS_CATEGORIES);
	if (!typeFailed(observation, "MX")) collect(observation.mx, MX_CATEGORIES);
	return [...byName.entries()]
		.map(([name, categories]) => ({ name, categories: [...categories].sort() }))
		.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

function countByDepartment(
	orgIds: Iterable<number>,
	orgById: ReadonlyMap<number, OrganizationRef>,
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const id of orgIds) {
		const org = orgById.get(id);
		if (!org || !isNaDepartment(org.dept)) continue;
		counts[org.dept] = (counts[org.dept] ?? 0) + 1;
	}
	return counts;
}

function topProviderFor(
	orgIds: Iterable<number>,
	providerByOrg: ReadonlyMap<number, ReadonlySet<string>>,
	orgById: ReadonlyMap<number, OrganizationRef>,
): { name: string; organizations: number } | null {
	const counts = new Map<string, number>();
	for (const id of orgIds) {
		const org = orgById.get(id);
		if (!org || !isNaDepartment(org.dept)) continue;
		for (const provider of providerByOrg.get(id) ?? []) {
			counts.set(provider, (counts.get(provider) ?? 0) + 1);
		}
	}
	let best: { name: string; organizations: number } | null = null;
	for (const [name, organizations] of counts) {
		if (
			!best ||
			organizations > best.organizations ||
			(organizations === best.organizations && name.localeCompare(best.name, "en") < 0)
		) {
			best = { name, organizations };
		}
	}
	return best;
}

/**
 * Builds the map and the concentration figures.
 *
 * An organization can depend on several providers (DNS at one, mail at
 * another): it is counted for each, and multi-provider organizations are
 * reported separately. An observation with no recognised provider is kept in
 * the totals but never attributed to a guessed suffix.
 */
export function buildProviderConcentration(
	input: BuildProviderConcentrationInput,
): ProviderConcentrationReport {
	const orgById = new Map<number, OrganizationRef>();
	for (const org of input.organizations) {
		if (isNaDepartment(org.dept)) orgById.set(org.id, org);
	}

	const organizationsWithDomain = new Set<number>();
	const providerByOrg = new Map<number, Set<string>>();
	const providerUses = new Map<
		string,
		{ categories: Set<DnsProviderCategory>; domains: Set<string>; orgIds: Set<number> }
	>();
	const unknownHosts = new Map<string, { domains: Set<string>; records: Set<"NS" | "MX"> }>();

	let domainsObserved = 0;
	let domainsAttributed = 0;

	for (const observation of input.observations) {
		const orgIds = observation.orgIds.filter((id) => orgById.has(id));
		if (orgIds.length === 0) continue;
		domainsObserved += 1;
		for (const id of orgIds) organizationsWithDomain.add(id);

		// Unknown hosts are recorded even when the other type yielded a
		// provider: they are the suffixes to add to the catalogue.
		const hosts: Array<{ host: string; record: "NS" | "MX" }> = [];
		if (!typeFailed(observation, "NS")) {
			for (const host of observation.ns) {
				if (!providerFor(host, input.catalogue)) {
					hosts.push({ host: host.trim().toLowerCase().replace(/\.$/, ""), record: "NS" });
				}
			}
		}
		if (!typeFailed(observation, "MX")) {
			for (const host of observation.mx) {
				if (!providerFor(host, input.catalogue)) {
					hosts.push({ host: host.trim().toLowerCase().replace(/\.$/, ""), record: "MX" });
				}
			}
		}
		for (const { host, record } of hosts) {
			const entry = unknownHosts.get(host) ?? { domains: new Set<string>(), records: new Set<"NS" | "MX">() };
			entry.domains.add(observation.domain);
			entry.records.add(record);
			unknownHosts.set(host, entry);
		}

		const matches = attributeObservation(observation, input.catalogue);
		if (matches.length === 0) continue;

		domainsAttributed += 1;
		for (const match of matches) {
			const use = providerUses.get(match.name) ?? {
				categories: new Set<DnsProviderCategory>(),
				domains: new Set<string>(),
				orgIds: new Set<number>(),
			};
			for (const category of match.categories) use.categories.add(category);
			use.domains.add(observation.domain);
			for (const id of orgIds) use.orgIds.add(id);
			providerUses.set(match.name, use);

			for (const id of orgIds) {
				const set = providerByOrg.get(id) ?? new Set<string>();
				set.add(match.name);
				providerByOrg.set(id, set);
			}
		}
	}

	const providers: ProviderUse[] = [...providerUses.entries()]
		.map(([name, use]) => ({
			name,
			categories: [...use.categories].sort(),
			domains: use.domains.size,
			organizations: use.orgIds.size,
			departments: countByDepartment(use.orgIds, orgById),
		}))
		.sort(
			(a, b) =>
				b.organizations - a.organizations ||
				b.domains - a.domains ||
				a.name.localeCompare(b.name, "en"),
		);

	const attributedOrgIds = new Set(providerByOrg.keys());
	let multiple = 0;
	let single = 0;
	for (const set of providerByOrg.values()) {
		if (set.size > 1) multiple += 1;
		else if (set.size === 1) single += 1;
	}

	const top = providers[0];
	const topProvider = top
		? {
				name: top.name,
				organizations: top.organizations,
				share: attributedOrgIds.size > 0 ? top.organizations / attributedOrgIds.size : 0,
			}
		: null;

	const top5OrgIds = new Set<number>();
	for (const provider of providers.slice(0, 5)) {
		for (const [name, use] of providerUses) {
			if (name !== provider.name) continue;
			for (const id of use.orgIds) top5OrgIds.add(id);
		}
	}
	const top5Coverage = attributedOrgIds.size > 0 ? top5OrgIds.size / attributedOrgIds.size : 0;

	const departments: DepartmentConcentration[] = NA_DEPARTMENTS.map((dept) => {
		const withDomain = [...organizationsWithDomain].filter((id) => orgById.get(id)?.dept === dept).length;
		const attributed = [...attributedOrgIds].filter((id) => orgById.get(id)?.dept === dept).length;
		const orgsInDept = [...attributedOrgIds].filter((id) => orgById.get(id)?.dept === dept);
		const providerCount = new Set<string>();
		for (const id of orgsInDept) {
			for (const provider of providerByOrg.get(id) ?? []) providerCount.add(provider);
		}
		return {
			dept,
			organizationsWithDomain: withDomain,
			organizationsAttributed: attributed,
			providers: providerCount.size,
			topProvider: topProviderFor(orgsInDept, providerByOrg, orgById),
		};
	});

	const organizationPoints: OrganizationPoint[] = [];
	for (const [orgId, providerSet] of providerByOrg) {
		const org = orgById.get(orgId);
		if (!org || !isNaDepartment(org.dept)) continue;
		organizationPoints.push({
			orgId,
			dept: org.dept,
			lat: org.lat,
			lon: org.lon,
			providers: [...providerSet].sort((a, b) => a.localeCompare(b, "en")),
		});
	}
	organizationPoints.sort((a, b) => a.orgId - b.orgId);

	const unknownList: UnknownHost[] = [...unknownHosts.entries()]
		.map(([host, entry]) => ({
			host,
			domains: entry.domains.size,
			records: [...entry.records].sort() as Array<"NS" | "MX">,
		}))
		.sort((a, b) => b.domains - a.domains || a.host.localeCompare(b.host, "en"))
		.slice(0, 25);

	return {
		generatedAt: input.generatedAt ?? new Date().toISOString(),
		scope: {
			departments: NA_DEPARTMENTS,
			organizations: input.totalOrganizations,
		},
		totals: {
			organizations: input.totalOrganizations,
			organizationsWithDomain: organizationsWithDomain.size,
			organizationsAttributed: attributedOrgIds.size,
			organizationsUnattributed: Math.max(0, organizationsWithDomain.size - attributedOrgIds.size),
			domainsObserved,
			domainsAttributed,
			domainsUnattributed: Math.max(0, domainsObserved - domainsAttributed),
			providers: providers.length,
		},
		concentration: {
			topProvider,
			top5Coverage,
			organizationsUsingMultipleProviders: multiple,
			organizationsUsingSingleProvider: single,
		},
		providers,
		departments,
		organizationPoints,
		unknownHosts: unknownList,
	};
}
