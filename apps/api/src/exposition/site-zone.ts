/**
 * Qualification of a declared website whose final host is inside the same
 * registrable domain. Registries often publish an apex domain while the live
 * service answers on `www.` or a named subdomain; the apex itself may have no
 * A record at all. The observed host is the one that receives the HTTP 200 and
 * the one whose public IPv4 address is stored as evidence.
 */
import { domaineRacine, isDomainHint } from "../match/domaine.js";
import { isOwnDomain } from "./osm-siret.js";

export const SITE_ZONE_SOURCE = "site-zone-http-200";

/** Exact lowercase host of a final URL, without port or trailing dot. */
export function hostFromUrl(value: string): string | null {
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		const host = url.hostname.toLowerCase().replace(/\.$/, "");
		return isDomainHint(host) ? host : null;
	} catch {
		return null;
	}
}

/** True when both hosts share one registrable domain and are not a third-party host. */
export function isSameSiteHost(finalHost: string, declaredDomain: string): boolean {
	const observed = domaineRacine(finalHost);
	const declared = domaineRacine(declaredDomain);
	if (!observed || !declared || observed !== declared) return false;
	return isOwnDomain(observed);
}
