/**
 * Qualification of websites declared in the public FINESS enrichment dataset.
 *
 * Only the establishment identifier, postal code and declared website are
 * read. No establishment name, address, phone number or personal field enters
 * a candidate. Public directory pages are not the establishment's own service
 * and are rejected before any network call.
 */
import { domaineRacine } from "../match/domaine.js";
import { isOwnDomain } from "./osm-siret.js";
import { publicWebsite } from "./public-site.js";
export const FINESS_SITE_SOURCE = "finess-site-http-200";
/** Public portals that host pages about establishments, not their own service. */
const PUBLIC_DIRECTORIES: Record<string, true> = {
	"gouv.fr": true, "sante.fr": true, "service-public.fr": true, "asso.fr": true,
	"jimdosite.com": true, "pagesjaunes.fr": true,
};

export type FinessSiteCandidate = {
	id: string;
	website: string;
	domain: string;
};

/** Maps one FINESS identifier and its declared website to a joinable candidate. */
export function finessSiteCandidate(identifier: unknown, site: unknown): FinessSiteCandidate | null {
	const id = String(identifier ?? "").trim();
	if (!/^\d{9}$/.test(id)) return null;
	const website = publicWebsite(site);
	if (!website || !isOwnDomain(website.domain)) return null;
	const root = domaineRacine(website.domain);
	if (!root || PUBLIC_DIRECTORIES[root]) return null;
	return { id, website: website.website, domain: website.domain };
}
