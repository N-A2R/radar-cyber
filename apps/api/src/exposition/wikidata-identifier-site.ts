/**
 * Qualification of websites declared with a French public identifier in Wikidata.
 *
 * P3215 (SIRET) and P3202 (UAI) are joined to organisations by SIREN and
 * `annuaire-education` entity code. Only the identifier and the official
 * website (P856) are read: no label, address, email or phone number enters a
 * candidate or a report.
 */
import { publicWebsite, sirenFromIdentifier } from "./public-site.js";

export const WIKIDATA_IDENTIFIER_SOURCE = "wikidata-id-http-200";

export type IdentifierKind = "siret" | "uai";

export type WikidataIdentifierCandidate = {
	kind: IdentifierKind;
	id: string;
	website: string;
	domain: string;
};

/** Maps one public identifier and its declared website to a joinable candidate, or `null`. */
export function wikidataIdentifierCandidate(
	kind: IdentifierKind,
	identifier: unknown,
	site: unknown,
): WikidataIdentifierCandidate | null {
	const id = kind === "siret" ? sirenFromIdentifier(identifier) : String(identifier ?? "").trim();
	if (!id || (kind === "uai" && !/^\d{7}[A-Z]$/.test(id))) return null;
	const website = publicWebsite(site);
	if (!website) return null;
	return { kind, id, website: website.website, domain: website.domain };
}
