/**
 * Parseur des aperçus publics de canaux Telegram (`t.me/s/<canal>`).
 *
 * Même cause que les pages `.onion` : le parseur générique ramenait les liens
 * de l'interface (« @vxunderground », « Download Telegram ») au lieu du
 * contenu. Résultat mesuré : 24 sources Telegram déclarées, 15 muettes, alors
 * que leurs canaux publient.
 *
 * La page publique d'un canal est du HTML simple, sans compte ni clé :
 *
 *   <div class="tgme_widget_message_wrap js-widget_message_wrap">
 *     <a class="tgme_widget_message_date" href="https://t.me/canal/1234">
 *       <time datetime="2026-11-10T20:00:00+00:00">
 *     <div class="tgme_widget_message_text js-message_text" dir="auto">
 *       …texte du message…
 *
 * Un message sans texte (photo seule, service) est ignoré : il n'y a rien à
 * en tirer pour un observatoire, et l'inventer serait pire que l'omettre.
 */

/** Un message public extrait d'un canal. */
export interface TelegramMessage {
	/** Texte du message, balises retirées. */
	text: string
	/** Date ISO du message, quand la page la donne. */
	datetime?: string
	/** Lien direct vers le message. */
	link?: string
}

const TEXT_RE = /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
const DATE_BEFORE_RE =
	/class="tgme_widget_message_date"[^>]*href="(https:\/\/t\.me\/[^"]+)"[\s\S]{0,400}?<time[^>]*datetime="([^"]+)"/gi

/**
 * Libellés d'interface que la page publique affiche à la place du contenu
 * quand le message est un média. Ce ne sont pas des messages : les ingérer
 * remplissait le fil de « Media is too big VIEW IN TELEGRAM ».
 */
const UI_LABELS = [
	/view in telegram/i,
	/media is too big/i,
	/this media is not supported/i,
	/^\d+:\d+$/,
	/^\d+\s*(sec|min|ko|mo|gb)$/i,
	/^join chat$/i,
	/^preview channel$/i,
]

function isInterfaceLabel(text: string): boolean {
	return UI_LABELS.some((pattern) => pattern.test(text))
}

/** Retire les balises et normalise les espaces. */
function plainText(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/\s+/g, " ")
		.trim()
}

/**
 * Extrait les messages d'une page `t.me/s/<canal>`.
 *
 * Retourne `null` si la page n'est pas un aperçu de canal (page d'invitation,
 * redirection, erreur) : l'appelant retombe alors sur la détection générique.
 */
export function parseTelegramMessages(html: string): TelegramMessage[] | null {
	if (!html || !html.includes("tgme_widget_message")) return null

	// Les liens et dates de tous les messages, dans l'ordre du document.
	const stamps: { index: number; link: string; datetime: string }[] = []
	for (const match of html.matchAll(DATE_BEFORE_RE)) {
		stamps.push({
			index: match.index ?? 0,
			link: match[1] ?? "",
			datetime: match[2] ?? "",
		})
	}

	const messages: TelegramMessage[] = []
	for (const match of html.matchAll(TEXT_RE)) {
		const text = plainText(match[1] ?? "")
		// Un message trop court est une réaction ou un fragment de compteur.
		if (text.length < 12) continue
		if (isInterfaceLabel(text)) continue
		const at = match.index ?? 0
		// La date qui précède le texte dans le document est celle du message.
		const stamp = [...stamps].reverse().find((candidate) => candidate.index < at)
		messages.push({ text, datetime: stamp?.datetime, link: stamp?.link })
	}

	return messages.length > 0 ? messages : null
}

/**
 * Page « Telegram: Contact @canal » : il n'y a aucun message public à ingérer.
 * On expose l'identité du compte comme item unique plutôt que de laisser le
 * collecteur jeter le corps dans `quarantine_raw` comme « format inconnu ».
 */
export function parseTelegramContact(html: string): { username: string; link: string } | null {
	const username = html.match(/class="tgme_username_link"[^>]*href="tg:\/\/resolve\?domain=([\w]{3,})"/i)?.[1]
		?? html.match(/content="tg:\/\/resolve\?domain=([\w]{3,})"/i)?.[1]
		?? html.match(/<title[^>]*>\s*Telegram:\s*Contact\s+@([\w]{3,})/i)?.[1]
	if (!username) return null
	if (!/<title[^>]*>\s*Telegram:\s*Contact\s+@/i.test(html) && !/tgme_page_(?:description|action)/i.test(html)) return null
	return { username, link: `https://t.me/${username}` }
}
