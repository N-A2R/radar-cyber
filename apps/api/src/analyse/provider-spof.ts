/**
 * Pure aggregation of digital single points of failure in Nouvelle-Aquitaine.
 *
 * A provider is a single point of failure when its outage would cut a service
 * used by more than `threshold` distinct organizations. An organization is
 * counted once per provider even when several domains, name servers or mail
 * exchangers point to it. Only public DNS observations and opaque organization
 * identifiers are consumed: no organization name, victim record or personal
 * data is read or returned.
 */
import {
	MX_CATEGORIES,
	NS_CATEGORIES,
	providerFor,
	type DnsProvider,
	type DnsProviderCategory,
} from "../dns/historique.js";

export interface ProviderObservation {
	domain: string;
	orgIds: readonly number[];
	ns: readonly string[];
	mx: readonly string[];
}

export interface SpofProvider {
	name: string;
	categories: DnsProviderCategory[];
	organizations: number;
	domains: number;
}

export interface SpofOptions {
	/** Strict threshold: exactly `threshold` organizations is not a SPOF. */
	threshold?: number;
	/** Optional second barrier: organization ids outside this set are ignored. */
	allowedOrgIds?: ReadonlySet<number>;
}

export interface SpofAnalysis {
	scope: "nouvelle-aquitaine";
	threshold: number;
	providers: SpofProvider[];
	organizationsObserved: number;
	organizationsAttributed: number;
	domainsObserved: number;
	unknownHosts: number;
}

export const SPOF_THRESHOLD = 100;

interface Impact {
	orgIds: Set<number>;
	domains: Set<string>;
	categories: Set<DnsProviderCategory>;
}

/**
 * Aggregate provider outages from NS and MX observations. Each record carries
 * the organizations already filtered to Nouvelle-Aquitaine by the store.
 */
export function analyzeProviderSpof(
	observations: readonly ProviderObservation[],
	catalogue: readonly DnsProvider[],
	options: SpofOptions = {},
): SpofAnalysis {
	const threshold = options.threshold ?? SPOF_THRESHOLD;
	const impacts = new Map<string, Impact>();
	const observedOrgs = new Set<number>();
	const attributedOrgs = new Set<number>();
	const unknownHosts = new Set<string>();
	let domainsObserved = 0;

	for (const observation of observations) {
		const orgIds = new Set<number>();
		for (const id of observation.orgIds ?? []) {
			if (options.allowedOrgIds && !options.allowedOrgIds.has(id)) continue;
			orgIds.add(id);
			observedOrgs.add(id);
		}
		// A domain with no organization in scope cannot make a provider critical.
		if (orgIds.size === 0) continue;
		domainsObserved += 1;

		const lookups: ReadonlyArray<{ hosts: readonly string[]; categories: readonly DnsProviderCategory[] }> = [
			{ hosts: observation.ns ?? [], categories: NS_CATEGORIES },
			{ hosts: observation.mx ?? [], categories: MX_CATEGORIES },
		];
		for (const { hosts, categories } of lookups) {
			for (const host of hosts) {
				const provider = providerFor(host, catalogue, categories);
				if (!provider) {
					unknownHosts.add(host.trim().toLowerCase());
					continue;
				}
				let impact = impacts.get(provider.name);
				if (!impact) {
					impact = { orgIds: new Set(), domains: new Set(), categories: new Set() };
					impacts.set(provider.name, impact);
				}
				impact.categories.add(provider.category);
				impact.domains.add(observation.domain);
				for (const id of orgIds) {
					impact.orgIds.add(id);
					attributedOrgs.add(id);
				}
			}
		}
	}

	const providers = [...impacts.entries()]
		.map(([name, impact]) => ({
			name,
			categories: [...impact.categories].sort(),
			organizations: impact.orgIds.size,
			domains: impact.domains.size,
		}))
		.filter((provider) => provider.organizations > threshold)
		.sort((a, b) => b.organizations - a.organizations || a.name.localeCompare(b.name));

	return {
		scope: "nouvelle-aquitaine",
		threshold,
		providers,
		organizationsObserved: observedOrgs.size,
		organizationsAttributed: attributedOrgs.size,
		domainsObserved,
		unknownHosts: unknownHosts.size,
	};
}
