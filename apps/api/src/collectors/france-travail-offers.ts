/**
 * Pure parser for the public France Travail job-search result page.
 * It extracts only organisation-level fields: offer id, employer name,
 * department, title, publication day and the public offer url. No candidate,
 * recruiter contact or victim field is read or returned.
 */
import type { RecruitmentOffer } from "../analyse/recruitment-claim.js";

export const OFFER_SOURCE = "france-travail-public-search";

const ENTITIES: Record<string, string> = {
	amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">",
	eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç",
	ugrave: "ù", ucirc: "û", icirc: "î", ocirc: "ô", oe: "œ",
};

export function decodeEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
		.replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

function visibleText(html: string): string {
	return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Day-precision publication date derived from the board's relative wording. */
export function publicationDateFromLabel(label: string, collectedAt: string): string | null {
	const days = /il y a\s+(\d+)\s+jours?/i.exec(label);
	const yesterday = /\bhier\b/i.test(label);
	const today = /\baujourd(?:'\s?hui|hui)\b|il y a\s+\d+\s+heures?/i.test(label);
	const offset = days ? Number(days[1]) : yesterday ? 1 : today ? 0 : null;
	if (offset === null) return null;
	const collected = Date.parse(collectedAt);
	if (!Number.isFinite(collected)) throw new RangeError("invalid collection date");
	return new Date(collected - offset * 86_400_000).toISOString().slice(0, 10) + "T00:00:00Z";
}

/**
 * Splits one search result page into normalised offers. Malformed or partially
 * rendered results are skipped rather than guessed: the department and the
 * publication day must both be present in the page.
 */
export function parseOfferPage(html: string, collectedAt: string, query: string): RecruitmentOffer[] {
	const offers: RecruitmentOffer[] = [];
	const seen = new Set<string>();
	const items = html.split("data-id-offre=").slice(1);

	for (const item of items) {
		const idMatch = /^"([A-Za-z0-9]+)"/.exec(item);
		const titleMatch = /class="media-heading-title">([^<]+)</.exec(item);
		const orgMatch = /<p translate="no" class="subtext">\s*([^<]+)</.exec(item);
		if (!idMatch || !titleMatch || !orgMatch) continue;
		const id = idMatch[1]!;
		if (seen.has(id)) continue;

		const text = visibleText(item);
		const department = /-\s*(\d{2})\s*-/.exec(text)?.[1] ?? null;
		const label = /Publié[^<]{0,60}/i.exec(text)?.[0] ?? "";
		const publishedAt = publicationDateFromLabel(label, collectedAt);
		const organisation = decodeEntities(orgMatch[1]!).split("\n")[0]!.replace(/\s+/g, " ").trim();
		if (!department || !publishedAt || organisation === "") continue;

		seen.add(id);
		offers.push({
			id,
			organisation,
			department,
			title: decodeEntities(titleMatch[1]!).replace(/\s+/g, " ").trim(),
			publishedAt,
			url: `https://candidat.francetravail.fr/offres/recherche/detail/${id}`,
			source: OFFER_SOURCE,
			query,
		});
	}
	return offers;
}
