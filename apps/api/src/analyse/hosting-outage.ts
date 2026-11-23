/**
 * Deterministic simulation of a simultaneous outage of the main digital
 * providers observed in Nouvelle-Aquitaine.
 *
 * Only opaque organization ids, institutional domains and public DNS hostnames
 * are processed. No organization name, victim record or personal datum is read
 * or returned. All provider names come from public suffix facts (grey-source
 * nomenclature, no paid service).
 */
import {
	MX_CATEGORIES,
	NS_CATEGORIES,
	providerFor,
	type DnsProvider,
} from "../dns/historique.js";

export const DEFAULT_OUTAGE_SIZE = 5;
export const MAX_OUTAGE_SIZE = 20;

/**
 * Public suffixes actually observed on the regional perimeter. The entries are
 * naming facts, not exclusivity claims: the longest matching suffix wins.
 */
export const HOSTING_CATALOGUE: readonly DnsProvider[] = [
	{ suffix: "alienor.net", name: "Alienor", category: "dns", mode: "suffix" },
	{ suffix: "amenworld.com", name: "Amenworld", category: "dns", mode: "suffix" },
	{ suffix: "anycast.me", name: "OVHcloud", category: "dns", mode: "suffix" },
	{ suffix: "cloudflare.com", name: "Cloudflare", category: "dns", mode: "suffix" },
	{ suffix: "eolas-dns.eu", name: "Eolas", category: "dns", mode: "suffix" },
	{ suffix: "eolas.fr", name: "Eolas", category: "dns", mode: "suffix" },
	{ suffix: "gandi.net", name: "Gandi", category: "dns", mode: "suffix" },
	{ suffix: "gandi.net", name: "Gandi", category: "mail", mode: "suffix" },
	{ suffix: "girondenumerique.net", name: "Gironde Numérique", category: "dns", mode: "suffix" },
	{ suffix: "google.com", name: "Google Workspace", category: "mail", mode: "suffix" },
	{ suffix: "googledomains.com", name: "Google Cloud DNS", category: "dns", mode: "suffix" },
	{ suffix: "googlemail.com", name: "Google Workspace", category: "mail", mode: "suffix" },
	{ suffix: "hornetsecurity.com", name: "Hornetsecurity", category: "mail", mode: "suffix" },
	{ suffix: "hostinger.com", name: "Hostinger", category: "mail", mode: "suffix" },
	{ suffix: "hostinger.fr", name: "Hostinger", category: "mail", mode: "suffix" },
	{ suffix: "infomaniak.ch", name: "Infomaniak", category: "dns", mode: "suffix" },
	{ suffix: "infomaniak.ch", name: "Infomaniak", category: "mail", mode: "suffix" },
	{ suffix: "infomaniak.com", name: "Infomaniak", category: "dns", mode: "suffix" },
	{ suffix: "ionos.fr", name: "IONOS", category: "mail", mode: "suffix" },
	{ suffix: "nameshield.net", name: "Nameshield", category: "dns", mode: "suffix" },
	{ suffix: "o2switch.net", name: "o2switch", category: "dns", mode: "suffix" },
	{ suffix: "o2switch.net", name: "o2switch", category: "mail", mode: "suffix" },
	{ suffix: "one.com", name: "one.com", category: "mail", mode: "suffix" },
	{ suffix: "online.net", name: "Scaleway", category: "dns", mode: "suffix" },
	{ suffix: "online.net", name: "Scaleway", category: "mail", mode: "suffix" },
	{ suffix: "outlook.com", name: "Microsoft 365", category: "mail", mode: "suffix" },
	{ suffix: "ovh.net", name: "OVHcloud", category: "dns", mode: "suffix" },
	{ suffix: "ovh.net", name: "OVHcloud", category: "mail", mode: "suffix" },
	{ suffix: "phpnet.org", name: "PHPNET", category: "dns", mode: "suffix" },
	{ suffix: "planethoster.net", name: "PlanetHoster", category: "dns", mode: "suffix" },
	{ suffix: "prodomaines.com", name: "Prodomaines", category: "dns", mode: "suffix" },
	{ suffix: "wixdns.net", name: "Wix", category: "dns", mode: "suffix" },
	{ suffix: "wordpress.com", name: "WordPress.com", category: "dns", mode: "suffix" },
];

/** One institutional domain and the opaque ids of its Nouvelle-Aquitaine organizations. */
export interface HostingObservation {
	domain: string;
	organizationIds: readonly number[];
	nameServers: readonly string[];
	mailExchangers: readonly string[];
}

export interface ProviderImpact {
	name: string;
	organizations: number;
	domains: number;
}

export interface HostingOutageSimulation {
	scope: "nouvelle-aquitaine";
	outageSize: number;
	providers: ProviderImpact[];
	organizationsAffected: number;
	organizationsObserved: number;
	domainsObserved: number;
	attributedDomains: number;
	unknownHosts: number;
	sumProviderOrganizations: number;
	overlappingOrganizations: number;
}

interface Impact {
	organizations: Set<number>;
	domains: Set<string>;
}

/**
 * Rank providers by distinct organizations, then simulate their simultaneous
 * loss. An organization is affected once, even with several failing providers.
 */
export function simulateHostingOutage(
	observations: readonly HostingObservation[],
	outageSize = DEFAULT_OUTAGE_SIZE,
	catalogue: readonly DnsProvider[] = HOSTING_CATALOGUE,
): HostingOutageSimulation {
	if (!Number.isInteger(outageSize) || outageSize < 1 || outageSize > MAX_OUTAGE_SIZE) {
		throw new RangeError(`outageSize must be an integer between 1 and ${MAX_OUTAGE_SIZE}`);
	}

	const impacts = new Map<string, Impact>();
	const observed = new Set<number>();
	const attributedDomains = new Set<string>();
	const unknownHosts = new Set<string>();
	let domainsObserved = 0;

	for (const observation of observations) {
		const ids = new Set(observation.organizationIds);
		for (const id of ids) observed.add(id);
		const records = [
			...observation.nameServers.map((host) => ({ host, categories: NS_CATEGORIES })),
			...observation.mailExchangers.map((host) => ({ host, categories: MX_CATEGORIES })),
		];
		if (ids.size === 0 || records.length === 0) continue;
		domainsObserved += 1;

		let attributed = false;
		for (const { host, categories } of records) {
			const provider = providerFor(host, catalogue, categories);
			if (!provider) {
				unknownHosts.add(host.trim().toLowerCase().replace(/\.$/, ""));
				continue;
			}
			attributed = true;
			let impact = impacts.get(provider.name);
			if (!impact) {
				impact = { organizations: new Set(), domains: new Set() };
				impacts.set(provider.name, impact);
			}
			impact.domains.add(observation.domain);
			for (const id of ids) impact.organizations.add(id);
		}
		if (attributed) attributedDomains.add(observation.domain);
	}

	const ranked = [...impacts.entries()]
		.map(([name, impact]) => ({
			name,
			organizations: impact.organizations.size,
			domains: impact.domains.size,
		}))
		.sort((a, b) => b.organizations - a.organizations || a.name.localeCompare(b.name));
	const providers = ranked.slice(0, outageSize);
	const affected = new Set<number>();
	for (const provider of providers) {
		for (const id of impacts.get(provider.name)!.organizations) affected.add(id);
	}
	const sumProviderOrganizations = providers.reduce((total, provider) => total + provider.organizations, 0);

	return {
		scope: "nouvelle-aquitaine",
		outageSize,
		providers,
		organizationsAffected: affected.size,
		organizationsObserved: observed.size,
		domainsObserved,
		attributedDomains: attributedDomains.size,
		unknownHosts: unknownHosts.size,
		sumProviderOrganizations,
		overlappingOrganizations: sumProviderOrganizations - affected.size,
	};
}
