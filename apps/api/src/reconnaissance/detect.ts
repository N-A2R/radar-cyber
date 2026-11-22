/**
 * Reconnaissance-phase detector for organizations in Nouvelle-Aquitaine.
 *
 * "Reconnaissance" means an observable attack-surface footprint: what a passive
 * observer can learn about an organization before any intrusion is claimed.
 * Three independent stores provide the observables:
 *   - exposition_service: a public service carrying a technology fingerprint;
 *   - ct_sous_domaine: subdomains disclosed by Certificate Transparency;
 *   - dns_domaine: an actively observed, successfully resolved DNS perimeter.
 *
 * A raw observable makes an organization a *candidate*. It becomes a detection
 * only when the attribution can be checked from a second fact: a hostname owned
 * by the organization (its registrable domain or a subdomain of it) for a
 * service, an unambiguous exact registered-domain match for CT, and a
 * successful active lookup for DNS.
 *
 * Candidates are counted only when a real observable exists. A DNS row that has
 * never resolved is a pending lookup, not an observation: counting it would
 * inflate the false-positive rate with rows that say nothing yet. An observable
 * that cannot be attributed is counted as a false positive, so the rate is
 * measured over candidates, never over the surviving subset.
 *
 * Pure module: no database, no network, no names, no IP addresses, no victim
 * data. Inputs and outputs carry identifiers, departments and counters only.
 */
import { isNouvelleAquitaineLabel } from "../cveNa/index.js";

export type ReconSignal =
	| "service_fingerprint"
	| "subdomain_enumeration"
	| "dns_observation";

export type ExposureRow = {
	orgId: number;
	dept: string | null;
	domain: string | null;
	website: string | null;
	/** Hostnames returned by the passive observation, untrusted for ownership. */
	hostnames: string[];
	/** URLs where the service was observed, untrusted for ownership. */
	observedUrls: string[];
	/** Distinct ports carrying a technology on a non-shared IP. */
	fingerprintPorts: number;
	/** At least one observed IP is also attributed to another organization. */
	sharedIp: boolean;
};

export type SubdomainRow = {
	orgId: number;
	dept: string | null;
	/** Domain registered on the organization, from an independent table. */
	registeredDomain: string | null;
	/** Domain named by the CT inventory. */
	observedDomain: string;
	subdomainCount: number;
	/** Several organizations claim the same registered domain. */
	ambiguous: boolean;
};

export type DnsRow = {
	orgId: number;
	dept: string | null;
	domain: string;
	/** The domain currently resolves. */
	active: boolean;
	/** Timestamp of the last successful lookup, null when it never resolved. */
	lastSuccess: string | null;
};

export type ReconInput = {
	exposures: ExposureRow[];
	subdomains: SubdomainRow[];
	dns: DnsRow[];
};

export type Detection = {
	orgId: number;
	/** Normalised INSEE code of the Nouvelle-Aquitaine department. */
	dept: string;
	/** Strongest verified signal for that organization. */
	signal: ReconSignal;
	/** Port count, subdomain count or 1 for a DNS observation. */
	evidence: number;
};

export type ReconResult = {
	/** NA organizations holding at least one raw observable. */
	candidates: number;
	/** Candidate organizations per raw observable (an org can count twice). */
	candidateSignals: Record<ReconSignal, number>;
	detections: Detection[];
	falsePositives: number;
	falsePositiveRate: number;
	/** Number of organizations verified by each signal (an org can count twice). */
	signals: Record<ReconSignal, number>;
};

const SIGNALS: readonly ReconSignal[] = [
	"service_fingerprint",
	"subdomain_enumeration",
	"dns_observation",
];

/** Strongest signal wins when one organization has several observables. */
const PRIORITY: readonly ReconSignal[] = [
	"service_fingerprint",
	"subdomain_enumeration",
	"dns_observation",
];

/**
 * Labels that describe a hosting suffix rather than an organization's domain.
 * Matching a hostname against one of them would attribute an entire provider.
 */
const PUBLIC_SUFFIXES: Readonly<Record<string, true>> = {
	com: true,
	net: true,
	org: true,
	fr: true,
	eu: true,
	io: true,
	co: true,
	"co.uk": true,
	"gouv.fr": true,
};

/** Strip scheme, path, port, wildcard, trailing dot and leading "www". */
export function normalizeHostname(value: string | null | undefined): string {
	if (!value) return "";
	return value
		.trim()
		.toLowerCase()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
		.replace(/[/?#].*$/, "")
		.replace(/:\d+$/, "")
		.replace(/^\*+\./, "")
		.replace(/\.$/, "")
		.replace(/^www\./, "");
}

/** A hostname that can plausibly name an organization's own domain. */
export function isPlausibleDomain(value: string): boolean {
	if (!value.includes(".") || PUBLIC_SUFFIXES[value]) return false;
	return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
		value,
	);
}

function inScope(dept: string | null): boolean {
	return dept !== null && isNouvelleAquitaineLabel(dept);
}

/**
 * A passive service row is a candidate when at least one technology was
 * fingerprinted. Ports without a technology are not a reconnaissance signal.
 */
export function hasServiceObservable(row: ExposureRow): boolean {
	return row.fingerprintPorts > 0;
}

/**
 * A service observation is attributable only when the observation names a host
 * belonging to the organization itself: its normalised domain or website, or a
 * subdomain of it. The host can come from the passive hostname list or from the
 * URL used by the HTTP observation. Shared IPs and generic hosts hosted
 * elsewhere are not ownership evidence.
 */
export function attributableService(row: ExposureRow): boolean {
	if (row.sharedIp || !hasServiceObservable(row)) return false;
	const owned = [row.domain, row.website]
		.map(normalizeHostname)
		.filter(isPlausibleDomain);
	if (owned.length === 0) return false;
	const observed = [...row.hostnames, ...row.observedUrls].map(normalizeHostname);
	return observed.some((host) => {
		if (!host) return false;
		return owned.some((domain) => host === domain || host.endsWith(`.${domain}`));
	});
}

/** CT subdomains are evidence only for an unambiguous exact domain match. */
export function attributableSubdomains(row: SubdomainRow): boolean {
	if (row.ambiguous || row.subdomainCount <= 0) return false;
	const observed = normalizeHostname(row.observedDomain);
	const registered = normalizeHostname(row.registeredDomain);
	return observed.length > 0 && observed === registered;
}

/**
 * A DNS perimeter is an observable only when the domain currently resolves and
 * carries a successful lookup. A row that never resolved is a pending
 * collection, not an observation, and never enters the candidate set.
 */
export function hasDnsObservable(row: DnsRow): boolean {
	return row.active && row.lastSuccess !== null && Number.isFinite(Date.parse(row.lastSuccess));
}

type Entry = { dept: string; signals: Map<ReconSignal, number> };

const emptySignals = (): Record<ReconSignal, number> => ({
	service_fingerprint: 0,
	subdomain_enumeration: 0,
	dns_observation: 0,
});

/**
 * Count detections and the false-positive rate in one pass.
 * An organization with no attributable observable is a false positive: counting
 * only survivors would make the false-positive rate structurally zero.
 */
export function detectReconnaissance(input: ReconInput): ReconResult {
	const candidates = new Map<number, Set<ReconSignal>>();
	const verified = new Map<number, Entry>();
	const candidate = (orgId: number, signal: ReconSignal): void => {
		const set = candidates.get(orgId) ?? new Set<ReconSignal>();
		set.add(signal);
		candidates.set(orgId, set);
	};
	const add = (
		orgId: number,
		dept: string,
		signal: ReconSignal,
		evidence: number,
	): void => {
		const entry = verified.get(orgId) ?? {
			dept,
			signals: new Map<ReconSignal, number>(),
		};
		entry.signals.set(signal, Math.max(entry.signals.get(signal) ?? 0, evidence));
		verified.set(orgId, entry);
	};

	for (const row of input.exposures) {
		if (!inScope(row.dept)) continue;
		if (!hasServiceObservable(row)) continue;
		candidate(row.orgId, "service_fingerprint");
		if (attributableService(row)) {
			add(row.orgId, row.dept as string, "service_fingerprint", row.fingerprintPorts);
		}
	}
	for (const row of input.subdomains) {
		if (!inScope(row.dept)) continue;
		if (row.subdomainCount <= 0) continue;
		candidate(row.orgId, "subdomain_enumeration");
		if (attributableSubdomains(row)) {
			add(row.orgId, row.dept as string, "subdomain_enumeration", row.subdomainCount);
		}
	}
	for (const row of input.dns) {
		if (!inScope(row.dept)) continue;
		if (!hasDnsObservable(row)) continue;
		candidate(row.orgId, "dns_observation");
		add(row.orgId, row.dept as string, "dns_observation", 1);
	}

	const candidateSignals = emptySignals();
	for (const set of candidates.values()) {
		for (const signal of set) candidateSignals[signal] += 1;
	}

	const detections: Detection[] = [];
	const signals = emptySignals();
	for (const [orgId, entry] of [...verified].sort((a, b) => a[0] - b[0])) {
		const strongest =
			PRIORITY.find((signal) => entry.signals.has(signal)) ?? "dns_observation";
		for (const signal of SIGNALS) if (entry.signals.has(signal)) signals[signal] += 1;
		detections.push({
			orgId,
			dept: entry.dept,
			signal: strongest,
			evidence: entry.signals.get(strongest) ?? 0,
		});
	}

	const falsePositives = [...candidates.keys()].filter((orgId) => !verified.has(orgId)).length;
	return {
		candidates: candidates.size,
		candidateSignals,
		detections,
		falsePositives,
		falsePositiveRate: candidates.size === 0 ? 0 : falsePositives / candidates.size,
		signals,
	};
}
