/**
 * Shared qualification of websites declared by public French registries.
 *
 * Only the identifier, postal code and declared website are read. The URL is
 * normalised before it is used as service evidence: a protocol-relative value
 * is completed with HTTPS, and third-party directory or social hosts are not
 * accepted as an organisation's own service.
 */
import { normalizeDomainValue } from "../match/domaine.js";
import { isOwnDomain } from "./osm-siret.js";

export type PublicSiteCandidate = {
	siren: string;
	website: string;
	domain: string;
	dept: string;
};

/** Accepts a 9-digit SIREN or a 14-digit SIRET, nothing else. */
export function sirenFromIdentifier(value: unknown): string | null {
	const digits = String(value ?? "").trim();
	if (!/^\d{9}$/.test(digits) && !/^\d{14}$/.test(digits)) return null;
	return digits.slice(0, 9);
}

/** Returns an own, citable website URL and its normalised domain. */
export function publicWebsite(value: unknown): { website: string; domain: string } | null {
	if (typeof value !== "string") return null;
	let raw = value.trim();
	if (raw.startsWith("//")) raw = `https:${raw}`;
	if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return null;
	const domain = normalizeDomainValue(url.hostname);
	if (!domain || !isOwnDomain(domain)) return null;
	const path = url.pathname === "/" ? "" : url.pathname;
	return { website: `${url.protocol}//${url.host}${path}`, domain };
}

/** Returns one joinable public-registry website, or `null` when evidence is missing. */
export function publicSiteCandidate(
	identifier: unknown,
	site: unknown,
	postalCode: unknown,
	departments: readonly string[],
): PublicSiteCandidate | null {
	const siren = sirenFromIdentifier(identifier);
	const website = publicWebsite(site);
	const dept = String(postalCode ?? "").trim().slice(0, 2);
	if (!siren || !website || !departments.includes(dept)) return null;
	return { siren, website: website.website, domain: website.domain, dept };
}
