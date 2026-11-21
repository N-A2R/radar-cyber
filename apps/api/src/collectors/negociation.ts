/**
 * Public negotiation-chat index (ransomware.live) and leak-site posts
 * (RansomLook). Only the dates actually published by those sources are read;
 * chat identifiers that are not victim names are not guessed into identities.
 */
import type { LeakClaim, NegotiationChat } from "../analyse/negociation.js";

const NEGO_INDEX = "https://www.ransomware.live/nego";
const RANSOMLOOK = "https://www.ransomlook.io/api/posts";

export type FetchText = (url: string) => Promise<string>;

export const fetchText: FetchText = async (url) => {
	const res = await fetch(url, {
		headers: { accept: "text/html,application/json", "user-agent": "radar-cyber-negociation/1.0" },
		signal: AbortSignal.timeout(45_000),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	return res.text();
};

/**
 * The negotiation index renders each chat as a card. The visible date is the
 * chat start, and the bitcoin icon is the only explicit "paid" assertion;
 * its absence means unknown, not "did not pay".
 */
export function parseNegotiationCards(html: string): NegotiationChat[] {
	const cards = html.split('<div class="nego-card">').slice(1);
	const chats: NegotiationChat[] = [];
	for (const card of cards) {
		const link = card.match(/href="\/nego\/([^"/]+)\/([^"]+)"/);
		const date = card.match(/fa-regular fa-calendar"><\/i>\s*(\d{4}-\d{2}-\d{2})/);
		if (!link || !date) continue;
		chats.push({
			group: decodeURIComponent(link[1] as string),
			victim: decodeURIComponent(link[2] as string),
			startedAt: date[1] as string,
			paid: /title="Ransom paid"/.test(card) ? true : null,
		});
	}
	return chats;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export async function harvest(
	fetcher: FetchText = fetchText,
	years: readonly number[] = [],
): Promise<{ chats: NegotiationChat[]; claims: LeakClaim[] }> {
	const allYears = years.length > 0 ? years : defaultYears();
	const [negoHtml, ...payloads] = await Promise.all([
		fetcher(NEGO_INDEX),
		...allYears.map((year) => fetcher(`${RANSOMLOOK}/${year}`)),
	]);
	const chats = parseNegotiationCards(negoHtml);
	const claims: LeakClaim[] = [];
	for (const payload of payloads) {
		const posts: unknown = JSON.parse(payload);
		if (!Array.isArray(posts)) continue;
		for (const post of posts) {
			if (post === null || typeof post !== "object") continue;
			const p = post as Record<string, unknown>;
			const victim = text(p.post_title);
			const publishedAt = text(p.discovered);
			if (victim.length === 0 || publishedAt.length < 10) continue;
			claims.push({ group: text(p.group_name), victim, publishedAt });
		}
	}
	return { chats, claims };
}

function defaultYears(): number[] {
	const current = new Date().getUTCFullYear();
	return Array.from({ length: current - 2021 }, (_, i) => 2022 + i);
}
