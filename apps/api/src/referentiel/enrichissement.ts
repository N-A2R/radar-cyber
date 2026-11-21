/**
 * Règles pures d'enrichissement du référentiel d'organisations.
 *
 * Aucun accès réseau ni base ici : ce module transforme des faits observés
 * (nom d'org, page HTML réellement téléchargée, réponse JSON d'une API
 * publique) en propositions vérifiables. Le CLI `scripts/enrichir-referentiel.mts`
 * décide seul des écritures, avec `--appliquer`.
 *
 * Doctrine : on ne propose que ce que l'observation prouve. Une page qui ne
 * parle pas de la commune n'est pas le site de la commune ; un nom qui ne
 * correspond pas à la raison sociale n'est pas le SIREN de l'org ; un code
 * postal ambigu n'est pas une coordonnée.
 */

/** Champs dont la valeur est tracée dans `org_enrichissement`. */
export type ChampEnrichi = "domaine" | "siren" | "code_postal" | "geo"

export interface OrgEnrichissable {
	id: number
	name: string
	city: string | null
	dept: string | null
	kind?: string | null
}

export interface CandidatDomaine {
	orgId: number
	host: string
	source: string
}

export interface VerdictDomaine {
	ok: boolean
	motif: string
	url: string | null
	host: string | null
	statut: number | null
	titre: string | null
	token: string | null
	confiance: number
}

export interface HitSiren {
	siren: string
	nom: string
	codePostal: string | null
	commune: string | null
	dept: string | null
	latitude: number | null
	longitude: number | null
	etat: string | null
	/** Établissements renvoyés par l'API : preuve d'une présence locale. */
	etablissements: { codePostal: string | null; commune: string | null }[]
}

export interface VerdictSiren {
	ok: boolean
	motif: string
	confiance: number
}

export interface CoordParCodePostal {
	lat: number
	lon: number
	nom: string
	code: string
	confiance: number
	motif: string
}

export interface VerdictCodePostal {
	ok: boolean
	motif: string
	coord: CoordParCodePostal | null
}

const MOTS_VIDES: Record<string, true> = {
	de: true, des: true, du: true, la: true, le: true, les: true, l: true, d: true,
	au: true, aux: true, et: true, en: true, sur: true, sous: true, dans: true,
	commune: true, ville: true, mairie: true, municipal: true, municipalite: true,
	departement: true, region: true, sarl: true, eurl: true, sa: true, sas: true,
	sasu: true, sca: true, asso: true, association: true, snc: true, scp: true,
}

const PREFIXES_COMMUNE = /^(?:commune|ville|mairie|municipalite)\s+(?:de\s+|d\s*'|des\s+|du\s+|de\s*l\s*'|l\s*)?/i

/** Normalisation ASCII commune aux autres règles du référentiel. */
export function normaliser(value: string | null | undefined): string {
	return (value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

function mots(value: string | null | undefined): string[] {
	return [...new Set(normaliser(value).split(" ").filter((mot) => mot.length >= 3 && !MOTS_VIDES[mot]))]
}

/** Slug de commune : « Commune d'Angoulême » → `angouleme`, jamais un mot vide. */
export function slugCommune(org: OrgEnrichissable): string | null {
	const source = PREFIXES_COMMUNE.test(org.name)
		? org.name.replace(PREFIXES_COMMUNE, "")
		: org.city ?? org.name
	const slug = normaliser(source).replace(/ /g, "-")
	if (slug.length < 3 || slug.length > 60 || /^\d+$/.test(slug)) return null
	return slug
}

/** Noms d'hôtes déduits du nom, dans l'ordre de préférence. */
export function candidatsDomaine(org: OrgEnrichissable): CandidatDomaine[] {
	const commune = org.kind === "collectivite" || PREFIXES_COMMUNE.test(org.name)
	if (!commune) return []
	const slug = slugCommune(org)
	if (!slug) return []
	return [
		{ orgId: org.id, host: `ville-${slug}.fr`, source: "nom:ville-<slug>.fr" },
		{ orgId: org.id, host: `mairie-${slug}.fr`, source: "nom:mairie-<slug>.fr" },
	]
}

function retirerBalises(html: string): string {
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
		.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<[^>]+>/g, " ")
}

function decoderEntites(texte: string): string {
	return texte
		.replace(/&nbsp;?/gi, " ")
		.replace(/&amp;?/gi, "&")
		.replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d{1,7});/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
		.replace(/&eacute;?/gi, "e")
		.replace(/&egrave;?/gi, "e")
		.replace(/&agrave;?/gi, "a")
		.replace(/&ccedil;?/gi, "c")
		.replace(/&[a-z]{2,12};/gi, " ")
}

function titreDe(html: string): string {
	return decoderEntites(html.match(/<title[^>]*>([\s\S]{0,500}?)<\/title>/i)?.[1] ?? "")
}

function present(mot: string, texte: string): boolean {
	return new RegExp(`(?<![a-z0-9])${mot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(texte)
}

/**
 * Cohérence d'une page réellement reçue : le contenu doit parler de la
 * commune et tenir au moins 150 caractères. Un domaine qui répond 200 mais
 * affiche une page de parking ou le site d'un tiers n'est pas accepté.
 */
export function evaluerCoherence(html: string, org: OrgEnrichissable, titre = titreDe(html)): VerdictDomaine {
	const txtNormalise = normaliser(decoderEntites(retirerBalises(html))).slice(0, 200_000)
	const titreNormalise = normaliser(titre)
	const ville = mots(org.city)
	const nom = mots(org.name)
	const villeTrouvee = ville.filter((mot) => present(mot, txtNormalise))
	const nomTrouve = nom.filter((mot) => present(mot, txtNormalise))
	const titreVille = ville.filter((mot) => present(mot, titreNormalise))
	const marqueur = /mairie|ville de|commune de|municipal|conseil municipal|service technique|centre communal/.test(
		`${titreNormalise} ${txtNormalise.slice(0, 8000)}`,
	)
	const parking = /domaine a vendre|domaine en vente|achat de domaine|parking de domaines|site en construction|page introuvable|404/.test(
		`${titreNormalise} ${txtNormalise.slice(0, 4000)}`,
	)

	const base = { url: null, host: null, statut: null, titre: titre.slice(0, 200) || null }
	if (txtNormalise.length < 150) {
		return { ok: false, motif: "contenu-trop-court", ...base, token: null, confiance: 0 }
	}
	if (villeTrouvee.length === 0 && nomTrouve.length === 0) {
		return { ok: false, motif: "contenu-sans-nom", ...base, token: null, confiance: 0 }
	}
	if (!marqueur && titreVille.length === 0) {
		return { ok: false, motif: "contenu-sans-marqueur-institutionnel", ...base, token: null, confiance: 0 }
	}
	if (parking && villeTrouvee.length === 0) {
		return { ok: false, motif: "page-de-parking", ...base, token: null, confiance: 0 }
	}

	const token = villeTrouvee[0] ?? nomTrouve[0] ?? ""
	const confiance = titreVille.length > 0 && marqueur ? 0.95 : villeTrouvee.length > 0 ? 0.85 : 0.7
	return {
		ok: true,
		motif: titreVille.length > 0 ? "titre-et-corps" : marqueur ? "marqueur-et-corps" : "nom-dans-corps",
		...base,
		token,
		confiance,
	}
}

function estRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null
}

function chaine(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null
}

function nombre(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** Code postal français : exactement cinq chiffres, pas une année ni un SIREN. */
export function estCodePostal(value: string | null | undefined): value is string {
	return typeof value === "string" && /^\d{5}$/.test(value.trim())
}

/** Réponse de recherche-entreprises.api.gouv.fr → faits utiles, sans invention. */
export function parserResultatsRecherche(json: unknown): HitSiren[] {
	const root = estRecord(json)
	const resultats = root?.results
	if (!Array.isArray(resultats)) return []
	const hits: HitSiren[] = []
	for (const brut of resultats) {
		const row = estRecord(brut)
		if (!row) continue
		const siren = chaine(row.siren) ?? ""
		if (!/^\d{9}$/.test(siren)) continue
		const siege = estRecord(row.siege) ?? {}
		const cp = chaine(siege.code_postal)
		const etablissements = (Array.isArray(row.matching_etablissements) ? row.matching_etablissements : [])
			.map((brutEtab) => estRecord(brutEtab))
			.filter((etab): etab is Record<string, unknown> => etab !== null)
			.map((etab) => {
				const etabCp = chaine(etab.code_postal)
				return {
					codePostal: estCodePostal(etabCp) ? etabCp : null,
					commune: chaine(etab.libelle_commune),
				}
			})
		hits.push({
			siren,
			nom: chaine(row.nom_complet) ?? chaine(row.nom_raison_sociale) ?? "",
			codePostal: estCodePostal(cp) ? cp : null,
			commune: chaine(siege.libelle_commune),
			dept: chaine(siege.departement),
			latitude: nombre(siege.latitude),
			longitude: nombre(siege.longitude),
			etat: chaine(row.etat_administratif),
			etablissements,
		})
	}
	return hits
}

/**
 * Comparaison stricte : un SIREN n'est écrit que si la raison sociale
 * correspondent. Le suffixe « (VILLE) » des noms d'établissements du
 * référentiel est une indication de lieu, pas une partie du nom légal.
 */
export function evaluerCorrespondanceSiren(org: OrgEnrichissable, hit: HitSiren): VerdictSiren {
	const nomBase = org.name.replace(/\s*\([^)]*\)\s*$/, "") || org.name
	const nomOrg = normaliser(nomBase)
	const nomHit = normaliser(hit.nom)
	const tokensOrg = mots(nomBase)
	const tokensHit = mots(hit.nom)
	if (!nomHit || tokensOrg.length === 0 || tokensHit.length === 0) {
		return { ok: false, motif: "nom-api-inexploitable", confiance: 0 }
	}
	const exact = nomOrg === nomHit || nomOrg === nomHit.replace(/^commune /, "") ||
		nomOrg.replace(PREFIXES_COMMUNE, "") === nomHit
	const memesTokens = tokensOrg.length === tokensHit.length && tokensOrg.every((mot) => tokensHit.includes(mot))
	const villeOrg = normaliser(org.city)
	const villeHit = normaliser(hit.commune)
	const villeOk = !villeOrg || !villeHit ? null : villeOrg === villeHit || villeOrg.includes(villeHit) || villeHit.includes(villeOrg)
	const deptOk = Boolean(org.dept && hit.dept && normaliser(org.dept) === normaliser(hit.dept))
	// « RANGER (BRUGES) » et « RANGER » à Paris peuvent être deux sociétés
	// différentes. Sans établissement dans la ville ou le département de
	// l'org, un nom court identique ne suffit pas à attribuer un SIREN.
	const etabOk = hit.etablissements.some((etab) => {
		const communeEtab = normaliser(etab.commune)

		return (
			(villeOrg !== null && villeOrg !== "" && communeEtab !== "" &&
				(communeEtab === villeOrg || communeEtab.includes(villeOrg) || villeOrg.includes(communeEtab))) ||
			(org.dept !== null && org.dept !== "" && etab.codePostal?.startsWith(org.dept) === true)
		)
	})

	if (exact || memesTokens) {
		// Le siège peut être dans une autre commune : le SIREN identifie
		// l'entreprise, pas le lieu de l'établissement observé.
		if (villeOk) return { ok: true, motif: "nom-exact-et-ville", confiance: 0.97 }
		if (deptOk) return { ok: true, motif: "nom-exact-dept", confiance: 0.88 }
		if (etabOk) return { ok: true, motif: "nom-exact-et-etablissement-local", confiance: 0.9 }
		return { ok: false, motif: "etablissement-local-introuvable", confiance: 0 }
	}
	// Un seul mot en commun ne prouve rien : « Bordeaux » ne désigne pas
	// « Bordeaux ville sans SIDA ». La correspondance approchée exige deux
	// mots distinctifs, un nom API quasi identique et la même ville.
	const contient = tokensOrg.length >= 2 && tokensOrg.every((mot) => tokensHit.includes(mot)) &&
		tokensHit.length <= tokensOrg.length + 1
	if (contient && villeOk && deptOk) {
		return { ok: true, motif: "tokens-et-ville", confiance: 0.78 }
	}
	return { ok: false, motif: "nom-insuffisant", confiance: 0 }
}

/** Réponse de geo.api.gouv.fr/communes?codePostal=… → coordonnée ou refus explicite. */
export function parserCommunes(json: unknown, codePostal: string, org: OrgEnrichissable): VerdictCodePostal {
	if (!Array.isArray(json)) return { ok: false, motif: "reponse-api-inattendue", coord: null }
	const candidats: CoordParCodePostal[] = []
	for (const brut of json) {
		const row = estRecord(brut)
		if (!row) continue
		const codes = Array.isArray(row.codesPostaux) ? row.codesPostaux : []
		if (!codes.some((code) => typeof code === "string" && code.trim() === codePostal)) continue
		const coordonnees = estRecord(row.centre)?.coordinates
		if (!Array.isArray(coordonnees) || coordonnees.length < 2) continue
		const lon = nombre(coordonnees[0])
		const lat = nombre(coordonnees[1])
		if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
		candidats.push({
			lat,
			lon,
			nom: chaine(row.nom) ?? "",
			code: chaine(row.code) ?? "",
			confiance: 0.85,
			motif: "code-postal-unique",
		})
	}
	if (candidats.length === 0) {
		return { ok: false, motif: "code-postal-sans-commune", coord: null }
	}
	const ville = normaliser(org.city)
	if (ville) {
		const nomme = candidats.find((c) => {
			const cv = normaliser(c.nom)
			return cv === ville || cv.includes(ville) || ville.includes(cv)
		})
		if (nomme) {
			return {
				ok: true,
				motif: "code-postal-et-ville",
				coord: { ...nomme, confiance: 0.95, motif: "code-postal-et-ville" },
			}
		}
	}
	if (candidats.length > 1) {
		return { ok: false, motif: "code-postal-ambiguenom", coord: null }
	}
	return { ok: true, motif: candidats[0]!.motif, coord: candidats[0]! }
}
