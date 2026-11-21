/**
 * Pages d'accueil HTML sans flux : ni `<item>`, ni cartes de revendication,
 * ni liens suffisants pour la détection générique. On ne fabrique pas des
 * événements : on ne retient que le texte d'un bloc d'annonce explicite
 * (`notice`, `top-band`, paragraphe substantiel) ou une page courte portant
 * une URL — par exemple le changement d'adresse d'un site de fuite.
 */

const NOTICE_RE =
	/<(?:div|section|p|header)\b[^>]*class=["'][^"']*(?:notice|top-band|announcement|alert|intro|information)[^"']*["'][^>]*>([\s\S]{40,3000}?)<\/(?:div|section|p|header)>/i;
const PARAGRAPH_RE = /<p\b[^>]*>([\s\S]{60,2000}?)<\/p>/i;

/** Retire les balises et normalise les espaces d'un fragment HTML. */
function plain(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&(?:nbsp|#160);/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Une annonce de page d'accueil, sous forme d'item unique.
 * Retourne `null` pour une page de challenge ou un simple squelette JS.
 */
export function parseLandingNotice(body: string): Record<string, unknown>[] | null {
	if (!/<(?:div|p|section|main|body|html)\b/i.test(body)) return null;
	const source = body.replace(/<(script|style|noscript|svg|pre)\b[\s\S]*?<\/\1\s*>/gi, " ");
	let text = "";
	const notice = source.match(NOTICE_RE);
	if (notice) text = plain(notice[1] ?? "");
	if (text.length < 60) {
		const paragraph = source.match(PARAGRAPH_RE);
		if (paragraph) text = plain(paragraph[1] ?? "");
	}
	if (text.length < 60) {
		const whole = plain(source);
		if (whole.length >= 60 && whole.length <= 1500 && /https?:\/\/|\.onion\b/i.test(whole)) text = whole;
	}
	if (text.length < 60 || /^(?:loading|please enable javascript|javascript is required)/i.test(text)) return null;

	const heading = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? body.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
	const title = plain(heading?.[1] ?? "").slice(0, 200) || text.slice(0, 100);
	const href = body.match(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["']/i)?.[1]
		?? text.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,;]+$/, "");
	return [{ title, summary: text.slice(0, 800), ...(href ? { link: href } : {}) }];
}
