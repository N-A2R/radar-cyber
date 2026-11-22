/**
 * Qualification of Service-public.fr local-administration directory entries.
 *
 * Only three public technical fields are read: SIRET, postal code and the
 * declared website. No person in charge, email, phone or mission description
 * is copied into the candidate. The SIRET is reduced to its SIREN so the
 * organisation join is stable across establishments.
 */
import { normalizeDomainValue } from "../match/domaine.js";
import { isOwnDomain } from "./osm-siret.js";

export const DILA_SOURCE = "dila-http-200";

export type DilaService = {
	siret?: string;
	site_internet?: { valeur?: string }[];
	adresse?: { code_postal?: string }[];
};

export type DilaCandidate = {
	siren: string;
	website: string;
	domain: string;
	dept: string;
};

/** Returns one joinable website per directory entry, or `null` when proof is missing. */
export function dilaCandidate(
	service: DilaService,
	departments: readonly string[],
): DilaCandidate | null {
	const siret = String(service.siret ?? "").replace(/\D/g, "");
	if (!/^\d{14}$/.test(siret)) return null;
	const website = service.site_internet
		?.map((entry) => entry.valeur)
		.find((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value.trim()));
	if (!website) return null;
	const domain = normalizeDomainValue(website);
	if (!domain || !isOwnDomain(domain)) return null;
	const dept = service.adresse
		?.map((address) => String(address.code_postal ?? "").slice(0, 2))
		.find((value) => departments.includes(value));
	if (!dept) return null;
	return { siren: siret.slice(0, 9), website: website.trim(), domain, dept };
}
