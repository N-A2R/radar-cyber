/**
 * Qualification of OpenStreetMap web-service candidates keyed by SIREN/SIRET.
 *
 * Only public technical tags are read: `ref:FR:SIREN`, `ref:FR:SIRET`,
 * `website` and `contact:website`. No name, address or personal field is
 * copied into the candidate. A SIRET is reduced to its SIREN so the referential
 * join stays on the organisation, not on one of its establishments.
 */
import { normalizeDomainValue } from "../match/domaine.js";
export const OSM_SIRET_SOURCE = "osm-siret-http-200";

const THIRD_PARTY_HOST: Record<string, true> = {
	"facebook.com": true, "instagram.com": true, "linkedin.com": true,
	"twitter.com": true, "x.com": true, "youtube.com": true,
	"google.com": true, "google.fr": true, "wikipedia.org": true,
	"wikidata.org": true, "tripadvisor.fr": true, "yellowpages.fr": true,
	"pagesjaunes.fr": true, "sites.google.com": true,
};

export type OsmSiretFeature = {
	properties: Record<string, unknown> & {
		"@osmId"?: string;
		"ref:FR:SIREN"?: string;
		"ref:FR:SIRET"?: string;
		website?: string;
		"contact:website"?: string;
	};
};

export type OsmSiretCandidate = {
	osmId: string;
	siren: string;
	website: string;
	domain: string;
};

/** SIREN from its own tag, or from the first nine digits of a SIRET. */
export function sirenFromTags(tags: OsmSiretFeature["properties"]): string | null {
	const raw = tags["ref:FR:SIREN"] ?? String(tags["ref:FR:SIRET"] ?? "").slice(0, 9);
	const digits = String(raw).replace(/\D/g, "");
	return /^\d{9}$/.test(digits) ? digits : null;
}

/** Own website tag only; social profiles and directory pages are not service evidence. */
export function websiteFromTags(tags: OsmSiretFeature["properties"]): string | null {
	const value = tags.website ?? tags["contact:website"];
	return typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;

}
export function isOwnDomain(domain: string): boolean {
	const parts = domain.split(".");
	return parts.length >= 2 && !THIRD_PARTY_HOST[parts.slice(-2).join(".")!];
}

/** Returns one joinable candidate per OSM feature, or `null` when evidence is missing. */
export function osmSiretCandidate(feature: OsmSiretFeature): OsmSiretCandidate | null {
	const tags = feature.properties;
	const siren = sirenFromTags(tags);
	const website = websiteFromTags(tags);
	if (!siren || !website) return null;
	const domain = normalizeDomainValue(website);
	if (!domain || !isOwnDomain(domain)) return null;
	return { osmId: tags["@osmId"] ?? "", siren, website, domain };
}
