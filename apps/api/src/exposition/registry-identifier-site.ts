/**
 * Qualification of websites declared in public registries keyed by a French
 * organisation identifier.
 *
 * Two registries are consumed without any key or payment: the data.inclusion
 * structures directory (SIRET and declared website) and OpenStreetMap features
 * carrying `ref:FR:FINESS` and `website`. Only the public identifier and the
 * declared website are read: no name, address, email or phone number enters a
 * candidate or a report.
 */
import { publicWebsite } from "./public-site.js";

export const REGISTRY_IDENTIFIER_SOURCE = "registry-id-http-200";

export type RegistryIdentifierKind = "siret" | "finess";

export type RegistryIdentifierCandidate = {
	kind: RegistryIdentifierKind;
	id: string;
	website: string;
	domain: string;
};

/** Maps one registry identifier and its declared website to a joinable candidate. */
export function registryIdentifierCandidate(
	kind: RegistryIdentifierKind,
	identifier: unknown,
	site: unknown,
): RegistryIdentifierCandidate | null {
	const id = String(identifier ?? "").trim();
	if (kind === "siret" ? !/^\d{14}$/.test(id) : !/^\d{9}$/.test(id)) return null;
	const website = publicWebsite(site);
	if (!website) return null;
	return { kind, id, website: website.website, domain: website.domain };
}
