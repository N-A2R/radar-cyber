/**
 * Qualification of the national administration directory (Service-public.fr).
 *
 * The API exposes public establishments with a SIREN, an INSEE commune code
 * and declared websites. Only those three fields are read: no name, postal
 * address, email address or phone number enters a candidate or a report.
 */
import { publicWebsite, sirenFromIdentifier, type PublicSiteCandidate } from "./public-site.js";

export const ADMINISTRATION_SOURCE = "administration-http-200";

export type AdministrationRow = {
	siren?: unknown;
	code_insee_commune?: unknown;
	site_internet?: unknown;
};

export type AdministrationCandidate = PublicSiteCandidate & { insee: string };

/**
 * Returns the first own website declared by one directory entry. The API
 * exports `site_internet` as a JSON-encoded array; decoded arrays are also
 * accepted so a cached export can be replayed unchanged.
 */
export function administrationWebsite(value: unknown): { website: string; domain: string } | null {
	let entries: unknown = value;
	if (typeof entries === "string") {
		try {
			entries = JSON.parse(entries);
		} catch {
			return null;
		}
	}
	if (!Array.isArray(entries)) return null;
	for (const entry of entries) {
		const site = publicWebsite((entry as { valeur?: unknown } | null)?.valeur);
		if (site) return site;
	}
	return null;
}

/** Maps one public directory entry to a joinable website, or `null`. */
export function administrationCandidate(
	row: AdministrationRow,
	departments: readonly string[],
): AdministrationCandidate | null {
	const siren = sirenFromIdentifier(row.siren);
	const insee = String(row.code_insee_commune ?? "").trim();
	if (!/^\d{5}$/.test(insee)) return null;
	const dept = insee.slice(0, 2);
	if (!departments.includes(dept)) return null;
	const site = administrationWebsite(row.site_internet);
	if (!siren || !site) return null;
	return { siren, insee, website: site.website, domain: site.domain, dept };
}
