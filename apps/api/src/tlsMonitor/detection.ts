/**
 * Pure rules for TLS certificate change monitoring.
 *
 * No network, no clock and no database access live here. The baseline comes
 * from the versioned CT-log inventory; the current side comes from a versioned
 * TLS observation snapshot. Rules only describe changes that deserve review —
 * the verdict file decides afterwards whether an alert was a false positive.
 */

export interface BaselineCertificate {
	host: string;
	domain: string;
	organization: string;
	certificateId: string | null;
	issuer: string | null;
	firstSeen: string;
}

export interface CurrentCertificate {
	host: string;
	observedAt: string;
	ok: boolean;
	error?: string | null;
	issuerOrganization?: string | null;
	issuerCommonName?: string | null;
	subjectCommonName?: string | null;
	subjectAltName?: string | null;
	validFrom?: string | null;
	validTo?: string | null;
	fingerprint?: string | null;
	serialNumber?: string | null;
	authorized?: boolean;
	selfSigned?: boolean;
	hostnameMatch?: boolean;
}

export type ChangeRule = "issuer_change" | "new_ca_for_domain" | "identity_mismatch";

export interface ChangeAlert {
	key: string;
	host: string;
	domain: string;
	organization: string;
	rules: ChangeRule[];
	severity: number;
	summary: string;
	baseline: {
		certificateId: string | null;
		issuer: string | null;
		firstSeen: string;
	};
	current: {
		issuer: string | null;
		validFrom: string | null;
		validTo: string | null;
		fingerprint: string | null;
		hostnameMatch: boolean | null;
	};
}

export interface CtInventoryRow {
	sous_domaine: string;
	domaine: string;
	organisation: string;
	certificat_id: string | null;
	emetteur: string | null;
	premiere_vue: string;
}

export function issuerOrganization(distinguishedName: string | null | undefined): string | null {
	if (!distinguishedName) return null;
	const match = distinguishedName.match(/(?:^|,)\s*O\s*=\s*"?([^,"]*)/i);
	if (!match && distinguishedName.includes("=")) return null;
	const value = (match?.[1] ?? distinguishedName).trim();
	if (!value) return null;
	const key = value.toLowerCase().replace(/[^a-z0-9]/g, "");
	if (key.startsWith("letsencrypt")) return "letsencrypt";
	if (key.startsWith("gandi")) return "gandi";
	if (key.startsWith("digicert")) return "digicert";
	if (key.startsWith("globalsign")) return "globalsign";
	if (key.startsWith("certinomis")) return "certinomis";
	if (key.startsWith("cloudflare")) return "cloudflare";
	return key;
}

/** RFC 6125 style host check: SAN DNS names first, CN only when SAN is absent. */
export function hostnameMatches(
	host: string,
	subjectAltName: string | null | undefined,
	commonName: string | null | undefined,
): boolean {
	const name = host.trim().toLowerCase().replace(/\.$/, "");
	if (!name) return false;
	const sans = (subjectAltName ?? "")
		.split(/[,\s]+/)
		.map((entry) => entry.trim().replace(/^DNS:/i, "").toLowerCase().replace(/\.$/, ""))
		.filter((entry) => entry.length > 0);
	const candidates = sans.length > 0 ? sans : commonName ? [commonName.trim().toLowerCase()] : [];
	return candidates.some((candidate) => {
		if (candidate.startsWith("*.")) {
			const suffix = candidate.slice(2);
			const label = name.slice(0, name.length - suffix.length - 1);
			return name.endsWith(`.${suffix}`) && label.length > 0 && !label.includes(".");
		}
		return candidate === name;
	});
}

/** Maps the versioned CT inventory (French column names) onto the detector input. */
export function baselineFromInventory(rows: readonly CtInventoryRow[]): BaselineCertificate[] {
	return rows
		.filter((row) => row.sous_domaine && row.domaine)
		.map((row) => ({
			host: row.sous_domaine.toLowerCase(),
			domain: row.domaine.toLowerCase(),
			organization: row.organisation,
			certificateId: row.certificat_id,
			issuer: row.emetteur,
			firstSeen: row.premiere_vue,
		}))
		.sort((a, b) => a.host.localeCompare(b.host));
}

function expired(observation: CurrentCertificate): boolean {
	const validTo = Date.parse(observation.validTo ?? "");
	return Number.isFinite(validTo) && validTo < Date.parse(observation.observedAt);
}

/**
 * One alert per known host whose certificate changed in a way that needs
 * review. Renewals by the same CA are deliberately silent.
 */
export function detectCertificateChanges(
	baseline: readonly BaselineCertificate[],
	observations: readonly CurrentCertificate[],
): ChangeAlert[] {
	const byHost = new Map(observations.map((observation) => [observation.host.toLowerCase(), observation]));
	const casByDomain = new Map<string, Set<string>>();
	for (const entry of baseline) {
		const issuer = issuerOrganization(entry.issuer);
		if (!issuer) continue;
		const cas = casByDomain.get(entry.domain) ?? new Set<string>();
		cas.add(issuer);
		casByDomain.set(entry.domain, cas);
	}

	const alerts: ChangeAlert[] = [];
	for (const entry of baseline) {
		const current = byHost.get(entry.host);
		if (!current || !current.ok) continue;
		const baselineIssuer = issuerOrganization(entry.issuer);
		const currentIssuer = issuerOrganization(current.issuerOrganization);
		const rules: ChangeRule[] = [];
		if (baselineIssuer && currentIssuer && baselineIssuer !== currentIssuer) rules.push("issuer_change");
		if (currentIssuer && baselineIssuer && !casByDomain.get(entry.domain)?.has(currentIssuer)) {
			rules.push("new_ca_for_domain");
		}
		if (
			current.hostnameMatch === false ||
			current.selfSigned === true ||
			current.authorized === false ||
			expired(current)
		) {
			rules.push("identity_mismatch");
		}
		if (rules.length === 0) continue;
		const severity = rules.includes("identity_mismatch") ? 4 : rules.includes("new_ca_for_domain") ? 4 : 3;
		alerts.push({
			key: entry.host,
			host: entry.host,
			domain: entry.domain,
			organization: entry.organization,
			rules,
			severity,
			summary: rules.join("+"),
			baseline: {
				certificateId: entry.certificateId,
				issuer: entry.issuer,
				firstSeen: entry.firstSeen,
			},
			current: {
				issuer: current.issuerOrganization ?? null,
				validFrom: current.validFrom ?? null,
				validTo: current.validTo ?? null,
				fingerprint: current.fingerprint ?? null,
				hostnameMatch: current.hostnameMatch ?? null,
			},
		});
	}
	return alerts.sort((a, b) => b.severity - a.severity || a.host.localeCompare(b.host));
}

export type ReviewVerdict = "true" | "false" | "unclassified";

/** False positive share over classified alerts only; null when nothing was reviewed. */
export function falsePositiveRate(verdicts: readonly ReviewVerdict[]): number | null {
	const classified = verdicts.filter((verdict) => verdict !== "unclassified");
	if (classified.length === 0) return null;
	return Math.round((1000 * classified.filter((verdict) => verdict === "false").length) / classified.length) / 10;
}
