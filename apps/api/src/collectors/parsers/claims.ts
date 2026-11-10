/**
 * Parseur de pages de revendication des sites de fuite.
 *
 * Le collecteur générique ramenait les liens de navigation de ces pages
 * (menus, boutons « acheter du BTC », liens de téléchargement) et le filtre
 * de pertinence les rejetait tous : 77 sources `.onion` joignables, 38
 * événements au total, 64 sources muettes.
 *
 * La donnée utile est ailleurs : chaque victime occupe une carte, avec un
 * titre, un secteur, un pays et un statut. Deux structures rencontrées en
 * pratique, sur des pages réellement récupérées :
 *
 *   1. Fenêtre modale (n0n, et la plupart des clones LockBit) :
 *      <div class="modal" id="v-xxxx"><div class="mbox">
 *        <h3>All Business Technologies</h3>
 *        <div class="meta">Accounting &amp; Tax Preparation (US) · Massachusetts, USA</div>
 *        <div class="summary">…</div>
 *
 *   2. Carte de projet (global-secret-group et dérivés) :
 *      <a href="/project/GBanBNFV7n43LsTc/" class="project-card">
 *        <h3 class="card-title">Novum Energy</h3>
 *        <div class="card-country">🇺🇸 United States</div>
 *        <p class="card-description">Country: Texas | Revenue: … | Industry: …</p>
 *
 * On ne devine pas : chaque motif ci-dessous correspond à un HTML observé.
 */

/** Une victime revendiquée, telle qu'elle apparaît sur la page. */
export interface ClaimVictim {
	/** Nom de l'organisation victime. */
	name: string
	/** Secteur d'activité, quand la page le donne. */
	sector?: string
	/** Pays ou région, quand la page le donne. */
	country?: string
	/** Statut affiché par le site (« Fucked », « published »…). */
	status?: string
	/** Lien vers la fiche détaillée, relatif ou absolu. */
	link?: string
	/** Description brute, tronquée. */
	summary?: string
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	middot: "·",
	ndash: "–",
	mdash: "—",
	rsquo: "'",
	lsquo: "'",
	hellip: "…",
}

/** Décode les entités HTML courantes, y compris numériques. */
export function decodeEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
		.replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
}

/** Texte visible d'un fragment HTML. */
function textOf(html: string): string {
	return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
}

/** Contenu d'un élément repéré par sa classe, arrêté au premier tag fermant. */
function classText(window: string, className: string): string | null {
	const re = new RegExp(`class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/`, "i")
	const match = window.match(re)
	return match ? textOf(match[1]) : null
}

/**
 * Texte court d'un élément repéré par sa classe, sans s'arrêter au premier
 * tag fermant.
 *
 * Nécessaire quand la valeur est enveloppée : `<div class="card-country">
 * <span class="card-flag">🇺🇸</span> United States</div>` — l'arrêt au premier
 * `</` ne rendrait que le drapeau. On prend donc une fenêtre bornée, puis on
 * retire les balises.
 */
function classWindow(window: string, className: string, maxLength = 400): string | null {
	const re = new RegExp(`class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, "i")
	const match = re.exec(window)
	if (!match || match.index === undefined) return null
	const start = match.index + match[0].length
	const raw = window.slice(start, start + maxLength)
	const value = textOf(raw)
	return value || null
}

/** Un titre est retenu comme nom de victime s'il ressemble à une organisation. */
function isVictimName(candidate: string): boolean {
	const name = candidate.trim()
	if (name.length < 2 || name.length > 140) return false
	if (/^(close|menu|home|news|faq|login|contact|about|blog|shop)$/i.test(name)) return false
	// Titres de section des sites : « [ ABOUT US ] », « [FILE SERVER] »,
	// « [ DATA EXPOSURE LOGS ] ». Observés en pratique sur n0n et gsg.
	if (/^[\[<(*•].*[\]>)*•]$/.test(name)) return false
	// Un chemin, un fichier ou une URL n'est pas un nom d'organisation.
	if (/^[\/#]|\.(?:html?|php|js|css|zip|xlsx?|pdf|rar|7z)$/i.test(name)) return false
	return /\p{L}/u.test(name)
}

/**
 * Extrait les victimes d'une page de revendication.
 *
 * Retourne `null` quand la page ne ressemble pas à une page de revendication —
 * l'appelant retombe alors sur la détection générique, sans régression.
 */
export function parseClaimCards(html: string): ClaimVictim[] | null {
	if (!html || html.length < 500) return null

	const victims: ClaimVictim[] = []
	const seen = new Set<string>()
	// Une carte porte une signature forte dès qu'elle expose un champ propre à
	// une page de revendication (secteur, statut, pays, description). Le nombre
	// de victimes ne suffit pas à décider : un site peut n'en publier qu'une.
	let strongCards = 0
	const headings = [...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)]

	for (let index = 0; index < headings.length; index += 1) {
		const heading = headings[index]
		if (!heading || heading.index === undefined) continue

		const name = textOf(heading[1] ?? "")
		if (!isVictimName(name)) continue

		// Fenêtre : jusqu'au titre suivant, plafonnée à 2 500 caractères.
		const start = heading.index
		const nextIndex = headings[index + 1]?.index ?? start + 2500
		const window = html.slice(start, Math.min(nextIndex, start + 2500))

		// Signature d'une carte de revendication : un secteur, un résumé ou un
		// statut accompagne le titre. Sans cela, c'est un titre décoratif.
		const meta = classText(window, "meta")
		const country = classWindow(window, "card-country", 160)
		const description = classWindow(window, "card-description", 700)
		const status = classText(window, "card-status")
		const summary = classWindow(window, "summary", 500)
		if (!meta && !country && !description && !status && !summary) continue
		strongCards += 1

		// La ligne « meta » de la structure modale mêle secteur et localisation :
		// « Accounting & Tax Preparation (US) · Massachusetts, USA ».
		let sector: string | undefined
		let location = country ?? undefined
		if (meta) {
			const parts = meta.split("·").map((part) => part.trim()).filter(Boolean)
			sector = parts[0]
			if (parts.length > 1) location = parts.slice(1).join(", ")
		}
		if (description) {
			const fields = new Map<string, string>()
			for (const chunk of description.split("|")) {
				const colon = chunk.indexOf(":")
				if (colon === -1) continue
				const key = chunk.slice(0, colon).trim().toLowerCase()
				const value = chunk.slice(colon + 1).trim()
				if (key && value) fields.set(key, value)
			}
			if (!sector) sector = fields.get("industry")
			// Le champ structuré « Country: … » est plus précis que le libellé
			// de carte, qui ne sert souvent qu'à porter le drapeau.
			const structuredCountry = fields.get("country")
			if (structuredCountry) location = structuredCountry
			else if (!location) location = undefined
		}

		// Lien vers la fiche : la balise <a> la plus proche avant le titre.
		const before = window.slice(0, window.indexOf(heading[1] ?? ""))
		const anchor = [...before.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].pop()
		const link = anchor?.[1]

		const key = name.toLowerCase()
		if (seen.has(key)) continue
		seen.add(key)

		// Le gabarit du site précède parfois la vraie description dans le même
		// bloc : « What will be published if no settlement is reached … ».
		// C'est une phrase de formulaire, pas une donnée.
		const cleanSummary = (summary ?? description ?? "")
			.replace(/^what will be published if no settlement is reached\s*/i, "")
			.trim()

		victims.push({
			name: name.slice(0, 200),
			sector: sector?.slice(0, 120),
			country: location?.slice(0, 120),
			status: status?.slice(0, 40),
			link,
			summary: cleanSummary ? cleanSummary.slice(0, 600) : undefined,
		})
	}

	// Décision. Une carte qui expose un champ de revendication (secteur,
	// statut, pays, description) est une signature forte : elle suffit, même
	// seule, parce qu'un site peut ne publier qu'une victime. Sans aucune
	// signature forte, il faut au moins trois titres pour ne pas confondre un
	// menu de navigation avec une page de revendication.
	if (strongCards === 0 && victims.length < 3) return null
	return victims
}
