/** Pure rules for auditing TLS certificates of public Nouvelle-Aquitaine sites. */
export interface CorpusSite {
	url: string;
	departement?: string;
}

export interface SiteTarget {
	host: string;
	port: number;
	entries: number;
	departments: string[];
	httpsRequired: boolean;
}

export interface CertificateObservation {
	host: string;
	port?: number;
	scannedAt: string;
	ok: boolean;
	error?: string;
	protocol?: string;
	validFrom?: string;
	validTo?: string;
	signatureAlgorithm?: string;
	keyType?: string;
	keyBits?: number;
	namedCurve?: string;
	subject?: string;
	issuer?: string;
	subjectAltName?: string;
	authorizationError?: string | null;
	selfSigned?: boolean;
	chainComplete?: boolean;
	entries?: number;
	departments?: string[];
	httpsRequired?: boolean;
}

export type FindingStatus = "expired" | "misconfigured" | "weak" | "clean" | "no_tls" | "unknown";

export interface Finding {
	host: string;
	status: FindingStatus;
	reasons: string[];
	entries: number;
	departments: string[];
	validTo?: string;
}

export interface Summary {
	sites: number;
	hosts: number;
	defectiveSites: number;
	defectiveHosts: number;
	byStatus: Record<FindingStatus, number>;
	byReason: Record<string, number>;
}

const TRANSIENT_ERRORS: Record<string, true> = {
	ENOTFOUND: true,
	EAI_AGAIN: true,
	ETIMEDOUT: true,
	TIMEOUT: true,
	ECONNRESET: true,
	EHOSTUNREACH: true,
	ENETUNREACH: true,
	EADDRNOTAVAIL: true,
	BUDGET_EXCEEDED: true,
};

const DEFECTIVE: Record<FindingStatus, boolean> = {
	expired: true,
	misconfigured: true,
	weak: true,
	clean: false,
	no_tls: false,
	unknown: false,
};

const WEAK_REASONS: Record<string, true> = {
	weak_signature: true,
	small_ec_curve: true,
	small_key: true,
	deprecated_tls_version: true,
};

export function isDefectiveStatus(status: FindingStatus): boolean {
	return DEFECTIVE[status] === true;
}

export function isTransientError(error: string | undefined): boolean {
	return Boolean(error && TRANSIENT_ERRORS[error]);
}

export function hostFromUrl(raw: string): string | null {
	try {
		const url = new URL(raw);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		const host = url.hostname.toLowerCase().replace(/\.$/, "");
		return /^[a-z0-9.-]+$/.test(host) ? host : null;
	} catch {
		return null;
	}
}

export function tlsPortFromUrl(raw: string): number | null {
	try {
		const url = new URL(raw);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		if (url.port) return Number(url.port);
		return 443;
	} catch {
		return null;
	}
}

/** Groups corpus entries by host: one TLS handshake can cover several pages. */
export function buildTargets(sites: Iterable<CorpusSite>): SiteTarget[] {
	const targets = new Map<string, SiteTarget>();
	for (const site of sites) {
		const host = hostFromUrl(site.url);
		const port = tlsPortFromUrl(site.url);
		if (!host || port === null) continue;
		let target = targets.get(host);
		if (!target) {
			target = { host, port, entries: 0, departments: [], httpsRequired: false };
			targets.set(host, target);
		}
		target.entries += 1;
		if (site.departement && !target.departments.includes(site.departement)) {
			target.departments.push(site.departement);
		}
		if (site.url.startsWith("https://")) target.httpsRequired = true;
	}
	return [...targets.values()].sort((a, b) => a.host.localeCompare(b.host));
}

/** Matches DNS SAN entries, with single-label wildcards, and falls back to CN. */
export function matchesHostname(
	subjectAltName: string | undefined,
	subject: string | undefined,
	host: string,
): boolean {
	const names: string[] = [];
	if (subjectAltName) {
		for (const entry of subjectAltName.split(",")) {
			const match = /^\s*DNS:\s*([^,\s]+)/i.exec(entry);
			if (match) names.push(match[1].toLowerCase().replace(/\.$/, ""));
		}
	}
	if (names.length === 0 && subject) {
		const cn = /(?:^|,\s*)CN=([^,]+)/i.exec(subject);
		if (cn) names.push(cn[1].trim().toLowerCase().replace(/\.$/, ""));
	}
	const target = host.toLowerCase().replace(/\.$/, "");
	return names.some((name) => {
		if (name.startsWith("*.")) {
			const base = name.slice(2);
			return target.endsWith(`.${base}`) && target.split(".").length === base.split(".").length + 1;
		}
		return name === target;
	});
}

export function expiryReasons(
	observation: CertificateObservation,
	now: Date,
): string[] {
	if (!observation.ok) return [];
	const reasons: string[] = [];
	const end = Date.parse(observation.validTo ?? "");
	const start = Date.parse(observation.validFrom ?? "");
	if (Number.isFinite(end) && end <= now.getTime()) reasons.push("certificate_expired");
	if (Number.isFinite(start) && start > now.getTime()) reasons.push("certificate_not_yet_valid");
	const authorizationError = observation.authorizationError ?? "";
	if (/CERT_HAS_EXPIRED/.test(authorizationError) && !reasons.includes("certificate_expired")) {
		reasons.push("certificate_expired");
	}
	if (/CERT_NOT_YET_VALID/.test(authorizationError) && !reasons.includes("certificate_not_yet_valid")) {
		reasons.push("certificate_not_yet_valid");
	}
	return reasons;
}

export function weakReasons(observation: CertificateObservation): string[] {
	if (!observation.ok) return [];
	const reasons: string[] = [];
	if (/md5|sha1/i.test(observation.signatureAlgorithm ?? "")) reasons.push("weak_signature");
	const curve = observation.namedCurve ?? "";
	const curveSize = Number(/(\d+)/.exec(curve)?.[1] ?? 0);
	if (observation.keyType === "ec" && curveSize > 0 && curveSize < 256) reasons.push("small_ec_curve");
	if (observation.keyType !== "ec" && observation.keyBits !== undefined && observation.keyBits < 2048) {
		reasons.push("small_key");
	}
	if (/^TLSv1(?:\.1)?$/.test(observation.protocol ?? "")) reasons.push("deprecated_tls_version");
	return reasons;
}

export function configurationReasons(observation: CertificateObservation): string[] {
	if (!observation.ok) return [];
	const reasons: string[] = [];
	if (!matchesHostname(observation.subjectAltName, observation.subject, observation.host)) {
		reasons.push("hostname_mismatch");
	}
	const authorizationError = observation.authorizationError ?? "";
	if (observation.selfSigned || /SELF_SIGNED/.test(authorizationError)) {
		reasons.push("self_signed_certificate");
	}
	if (/UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|CERT_UNTRUSTED|CERT_REJECTED|CERT_SIGNATURE_FAILURE/.test(authorizationError)) {
		reasons.push("untrusted_chain");
	}
	if (observation.chainComplete === false) reasons.push("incomplete_chain");
	return reasons;
}

/** One verdict per site; reasons are kept together so no defect is lost. */
export function classifyObservation(
	observation: CertificateObservation,
	target: SiteTarget,
	now: Date,
): Finding {
	const finding: Finding = {
		host: observation.host,
		status: "clean",
		reasons: [],
		entries: target.entries,
		departments: target.departments,
		validTo: observation.validTo,
	};

	if (!observation.ok) {
		const error = observation.error ?? "UNKNOWN_ERROR";
		if (isTransientError(error)) {
			finding.status = "unknown";
			finding.reasons.push("endpoint_unreachable");
		} else if (target.httpsRequired) {
			finding.status = "misconfigured";
			finding.reasons.push("tls_handshake_failed");
		} else {
			finding.status = "no_tls";
			finding.reasons.push("no_tls_service");
		}
		return finding;
	}

	finding.reasons.push(...expiryReasons(observation, now));
	finding.reasons.push(...configurationReasons(observation));
	finding.reasons.push(...weakReasons(observation));

	if (finding.reasons.includes("certificate_expired")) finding.status = "expired";
	else if (finding.reasons.some((reason) => !WEAK_REASONS[reason])) finding.status = "misconfigured";
	else if (finding.reasons.length > 0) finding.status = "weak";
	return finding;
}

export function summarizeFindings(findings: Finding[]): Summary {
	const summary: Summary = {
		sites: 0,
		hosts: findings.length,
		defectiveSites: 0,
		defectiveHosts: 0,
		byStatus: { expired: 0, misconfigured: 0, weak: 0, clean: 0, no_tls: 0, unknown: 0 },
		byReason: {},
	};
	for (const finding of findings) {
		summary.sites += finding.entries;
		summary.byStatus[finding.status] += finding.entries;
		if (isDefectiveStatus(finding.status)) {
			summary.defectiveSites += finding.entries;
			summary.defectiveHosts += 1;
		}
		for (const reason of finding.reasons) {
			summary.byReason[reason] = (summary.byReason[reason] ?? 0) + finding.entries;
		}
	}
	return summary;
}
