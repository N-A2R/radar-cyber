#!/usr/bin/env -S npx tsx
/**
 * Domaines réels d'organisations : trois pistes mesurées, zéro domaine deviné.
 *
 *   Piste 1 — liens et corps des événements déjà collectés (event.source_url,
 *             title, summary, evidence.references, quarantine_raw.raw_body) ;
 *   Piste 2 — 100 SIREN maximum sur recherche-entreprises.api.gouv.fr ;
 *   Piste 3 — corpus à URL connue : 457 santé/enseignement + 74 communes.
 *
 * Chaque proposition passe par HTTP 200 réel, reste sur le même domaine
 * racine et doit contenir un jeton distinctif de l'organisation. Sans
 * ces trois preuves, rien n'est écrit. `--appliquer` est la seule porte
 * d'écriture : sans lui, le script ne fait que mesurer.
 *
 * Usage :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/domaines-reels.mts \
 *       [--appliquer] [--siren-n=100] [--max-http=120] [--communes=chemin]
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { closePools, ingestQuery, query } from "../apps/api/src/db.js"
import { domaineRacine, normalizeDomainValue } from "../apps/api/src/match/domaine.js"

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..")
const UA = "RadarCyberNA/1.2 (domaines-reels; https://github.com/j0ltdevv/radar-cyber)"
const TIMEOUT_MS = 10_000
const MAX_OCTETS = 500_000
const CONCURRENCE = 16
const DELAI_API_MS = 160 // ≈ 6 req/s : sous la limite documentée de l'API SIREN
const SPARQL_URL = "https://query.wikidata.org/sparql"
const NA_QID = "Q18678082" // Nouvelle-Aquitaine
const SEARCH_URL = "https://recherche-entreprises.api.gouv.fr/search"

/** Hôtes qui hébergent une citation, un annuaire ou un service tiers. */
const HOTES_TIERS = new Set([
	"sante.fr", "wikipedia.org", "sites.google.com", "google.com", "google.fr",
	"news.google.com", "facebook.com", "youtube.com", "linkedin.com",
	"ransomware.live", "ransomlook.io", "databreaches.net", "github.com",
	"raw.githubusercontent.com", "nvd.nist.gov", "cisa.gov", "mitre.org",
	"t.me", "telegram.me", "twitter.com", "x.com", "reddit.com",
	"haveibeenpwned.com", "pastebin.com", "wordpress.com", "blogspot.com",
])

const MOTS_GENERIQUES = new Set([
	"commune", "ville", "mairie", "municipal", "municipalite", "departement",
	"region", "centre", "hopital", "hopitaux", "hotel", "ecole", "college",
	"lycee", "universite", "clinique", "association", "societe", "sarl",
	"sa", "sas", "sasu", "saint", "sainte", "les", "des", "du", "de", "la",
	"le", "et", "en", "du", "au", "aux", "d", "l", "groupe", "group",
])

interface Org {
	id: number
	name: string
	city: string | null
	dept: string | null
	domain: string | null
	website: string | null
}

interface Candidat {
	org: Org
	piste: 1 | 2 | 3 | 4 | 5
	origine: string
	confiance: number
	preuve: Record<string, unknown>
}

interface Verification {
	ok: boolean
	motif: string
	urlFinale: string | null
	statut: number | null
	titre: string | null
	token: string | null
	confiance: number
}

interface Stat {
	tentatives: number
	reussites: number
	echecs: number
	motifs: Record<string, number>
	rejetes: number
	rejets: Record<string, number>
}

interface MesureApi {
	examines: number
	ok: number
	avecSite: number
	dureesMs: number[]
	erreurs: Record<string, number>
}

function stat(): Stat {
	return { tentatives: 0, reussites: 0, echecs: 0, motifs: {}, rejetes: 0, rejets: {} }
}

function echec(s: Stat, motif: string): void {
	s.echecs += 1
	s.motifs[motif] = (s.motifs[motif] ?? 0) + 1
}

/** Rejet avant vérification HTTP : ce n'est pas une erreur de mesure. */
function rejet(s: Stat, motif: string): void {
	s.rejetes += 1
	s.rejets[motif] = (s.rejets[motif] ?? 0) + 1
}

type Option = { appliquer: boolean; sirenN: number; maxHttp: number; maxWikidata: number; maxCorpus: number; communes: string; only: number[] }
function lireOptions(argv: string[]): Option {
	const opt: Option = { appliquer: false, sirenN: 100, maxHttp: 160, maxWikidata: 20_000, maxCorpus: 2_000, communes: "bench/corpus/communes.jsonl", only: [1, 2, 3, 4, 5] }
	for (const arg of argv) {
		if (arg === "--appliquer") opt.appliquer = true
		else if (arg.startsWith("--siren-n=")) opt.sirenN = Number(arg.split("=")[1])
		else if (arg.startsWith("--max-http=")) opt.maxHttp = Number(arg.split("=")[1])
		else if (arg.startsWith("--max-wikidata=")) opt.maxWikidata = Number(arg.split("=")[1])
		else if (arg.startsWith("--max-corpus=")) opt.maxCorpus = Number(arg.split("=")[1])
		else if (arg.startsWith("--only=")) opt.only = arg.slice(7).split(",").map(Number)
		else if (arg.startsWith("--communes=")) opt.communes = arg.slice("--communes=".length)
		else if (arg === "--help" || arg === "-h") {
			console.log("usage : domaines-reels.mts [--appliquer] [--siren-n=100] [--max-http=160] [--max-wikidata=20000] [--max-corpus=2000] [--only=1,2,3,4,5] [--communes=chemin]")
			process.exit(0)
		} else throw new Error(`option inconnue : ${arg}`)
	}
	if (!Number.isInteger(opt.sirenN) || opt.sirenN < 0 || opt.sirenN > 100) {
		throw new Error("--siren-n doit être un entier entre 0 et 100 (plafond de l'échantillon)")
	}
	for (const [nom, valeur] of [["--max-http", opt.maxHttp], ["--max-wikidata", opt.maxWikidata], ["--max-corpus", opt.maxCorpus]] as const) {
		if (!Number.isInteger(valeur) || valeur < 0) throw new Error(`${nom} invalide`)
	}
	if (!opt.only.length || opt.only.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) throw new Error("--only invalide")
	return opt
}
export function normaliser(value: string | null | undefined): string {
	return (value ?? "")
		.replace(/œ/g, "oe")
		.replace(/æ/g, "ae")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
}

function compact(value: string): string {
	return normaliser(value).replace(/ /g, "")
}

/** Jeton distinctif : au moins 4 lettres, hors mots génériques. */
function jetons(...values: (string | null | undefined)[]): string[] {
	const out = new Set<string>()
	for (const value of values) {
		for (const mot of normaliser(value).split(" ")) {
			if (mot.length >= 4 && !MOTS_GENERIQUES.has(mot)) out.add(mot)
		}
	}
	return [...out]
}

/** Racine enregistrable, sans www ni sous-domaine. */
function racine(value: string | null | undefined): string | null {
	const hote = normalizeDomainValue(value)
	return hote ? domaineRacine(hote) : null
}

export function domainesDansTexte(texte: string | null | undefined): Set<string> {
	const out = new Set<string>()
	if (!texte) return out
	const regex = /(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?)*\.(?:gouv\.fr|ac\.fr|com|fr|org|net|eu|be|ch|de|es|it|nl|co\.uk|io|info|biz|us|ca|app|ai|me|eus)/gi
	for (const m of texte.matchAll(regex)) {
		const d = racine(m[0])
		if (d && d.split(".")[0]!.length >= 4 && !HOTES_TIERS.has(d)) out.add(d)
	}
	return out
}

function hoteCoherent(finalHost: string, attendu: string): boolean {
	const f = finalHost.toLowerCase().replace(/\.$/, "")
	const a = attendu.toLowerCase().replace(/\.$/, "")
	return f === a || f.endsWith(`.${a}`) || racine(f) === racine(a)
}

function retirerBalises(html: string): string {
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;?/gi, " ")
		.replace(/&amp;?/gi, "&")
		.replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d{1,7});/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
}

function titreDe(html: string): string {
	return normaliser(html.match(/<title[^>]*>([\s\S]{0,500}?)<\/title>/i)?.[1] ?? "")
}

/**
 * HTTP 200 + même domaine racine + présence d'un jeton distinctif dans la
 * page réellement servie. Une page d'annuaire qui « cite » l'org n'est pas
 * son site : le jeton doit apparaître et le domaine doit être le sien.
 */
export function verifierPage(html: string, statut: number, urlFinale: string, org: Org, extra: string[]): Verification {
	const hoteFinal = racine(urlFinale)
	if (!hoteFinal) return { ok: false, motif: "url-finale-invalide", urlFinale, statut, titre: null, token: null, confiance: 0 }
	if (statut !== 200) return { ok: false, motif: `http-${statut}`, urlFinale, statut, titre: null, token: null, confiance: 0 }
	const titre = titreDe(html)
	const texte = normaliser(retirerBalises(html))
	if (texte.length < 150) return { ok: false, motif: "contenu-trop-court", urlFinale, statut, titre, token: null, confiance: 0 }
	if (/domaine a vendre|domaine en vente|achat de domaine|parking de domaine|site en construction/.test(`${titre} ${texte.slice(0, 3000)}`)) {
		return { ok: false, motif: "page-de-parking", urlFinale, statut, titre, token: null, confiance: 0 }
	}
	const distinctifs = jetons(org.name, ...extra)
	const token = distinctifs.find((mot) => {
		const c = compact(mot)
		return c.length >= 4 && (texte.includes(c) || titre.includes(c))
	})
	if (!token) {
		return { ok: false, motif: "contenu-sans-jeton-distinctif", urlFinale, statut, titre, token: null, confiance: 0 }
	}
	const titreOk = titre.includes(compact(token))
	return {
		ok: true,
		motif: titreOk ? "http200-titre-et-corps" : "http200-corps",
		urlFinale,
		statut,
		titre: titre.slice(0, 200) || null,
		token,
		confiance: titreOk ? 0.95 : 0.85,
	}
}

function messageErreur(err: unknown): string {
	return err instanceof Error ? err.message : String(err)
}

function codeCause(err: unknown): string {
	if (!err || typeof err !== "object" || !("cause" in err)) return ""
	const cause = err.cause
	if (!cause || typeof cause !== "object" || !("code" in cause)) return ""
	return typeof cause.code === "string" ? cause.code : ""
}

async function getPage(url: string): Promise<{ ok: true; statut: number; url: string; html: string } | { ok: false; motif: string }> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
			signal: controller.signal,
			redirect: "follow",
		})
		if (!res.ok) return { ok: false, motif: `http-${res.status}` }
		const lecteur = res.body?.getReader()
		if (!lecteur) {
			const html = (await res.text()).slice(0, MAX_OCTETS)
			return { ok: true, statut: res.status, url: res.url, html }
		}
		const morceaux: Uint8Array[] = []
		let total = 0
		for (;;) {
			const { done, value } = await lecteur.read()
			if (done) break
			morceaux.push(value)
			total += value.byteLength
			if (total > MAX_OCTETS) {
				await lecteur.cancel()
				break
			}
		}
		const octets = new Uint8Array(total)
		let pos = 0
		for (const morceau of morceaux) {
			octets.set(morceau, pos)
			pos += morceau.byteLength
		}
		return { ok: true, statut: res.status, url: res.url, html: new TextDecoder("utf-8").decode(octets) }
	} catch (err) {
		const cause = codeCause(err)
		if (["ENOTFOUND", "EAI_AGAIN", "ENODATA"].includes(cause)) return { ok: false, motif: "dns-introuvable" }
		if (err instanceof Error && err.name === "AbortError") return { ok: false, motif: "timeout" }
		return { ok: false, motif: "reseau" }
	} finally {
		clearTimeout(timer)
	}
}

/** Deux schémas : beaucoup de sites scolaires publics ne servent que HTTP. */
async function verifierUrl(url: string, org: Org, extra: string[]): Promise<Verification> {
	let dernier = "aucune-tentative"
	for (const scheme of ["https", "http"] as const) {
		const candidat = url.replace(/^https?:\/\//i, `${scheme}://`)
		const res = await getPage(candidat)
		if (!res.ok) {
			dernier = res.motif
			continue
		}
		let hote: string
		try {
			hote = new URL(res.url).hostname
		} catch {
			dernier = "url-finale-invalide"
			continue
		}
		if (!hoteCoherent(hote, racine(url) ?? "")) {
			dernier = "redirection-hors-domaine"
			continue
		}
		const v = verifierPage(res.html, res.statut, res.url, org, extra)
		if (v.ok) return v
		dernier = v.motif
	}
	return { ok: false, motif: dernier, urlFinale: null, statut: null, titre: null, token: null, confiance: 0 }
}

async function avecConcurrence<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const resultats = new Array<R>(items.length)
	let cursor = 0
	async function travailleur(): Promise<void> {
		for (;;) {
			const i = cursor++
			if (i >= items.length) return
			resultats[i] = await fn(items[i]!)
		}
	}
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, travailleur))
	return resultats
}

function corpusJsonl(chemin: string, branche = "origin/big/CorpusCommunes-2"): any[] {
	const local = join(RACINE, chemin)
	if (existsSync(local)) return readFileSync(local, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
	// Les corpus fusionnés vivent sur main ; sinon sur leur branche dédiée, sinon sur le commit d'origine.
	for (const ref of [branche, "origin/main", "1cb5d91"]) {
		try {
			const sortie = execFileSync("git", ["-C", RACINE, "show", `${ref}:${chemin}`], {
				encoding: "utf8", maxBuffer: 40_000_000, stdio: ["ignore", "pipe", "ignore"],
			})
			return sortie.trim().split("\n").filter(Boolean).map(JSON.parse)
		} catch { /* référence absente : suivante */ }
	}
	throw new Error(`corpus introuvable : ${chemin}`)
}

function domainDejaRenseigne(org: Org): boolean {
	return Boolean(org.domain && org.domain.trim()) || Boolean(org.website && org.website.trim())
}

/** Racine distinctive : le nom de l'org doit apparaître dans le domaine. */
export function racineDistinctive(host: string, org: Org, extra: string[]): boolean {
	const label = compact(host.split(".")[0] ?? "")
	if (label.length < 4) return false
	const distinctifs = jetons(org.name, ...extra)
	return distinctifs.some((mot) => {
		const c = compact(mot)
		return c.length >= 4 && (label.includes(c) || (c.length >= 6 && c.includes(label)))
	})
}

/** Piste 1 — extraire les domaines cités, les rattacher, puis les vérifier. */
async function piste1(maxHttp: number): Promise<{ candidats: Candidat[]; stat: Stat; examinees: number; proposes: number }> {
	const s = stat()
	const candidats: Candidat[] = []
	const vus = new Set<string>()
	const ajouter = (org: Org, host: string, url: string, origine: string, extra: string[]) => {
		const h = racine(host)
		if (!h || HOTES_TIERS.has(h) || domainDejaRenseigne(org) || vus.has(`${org.id}:${h}`)) return
		if (!racineDistinctive(h, org, extra)) return
		vus.add(`${org.id}:${h}`)
		candidats.push({ org, host: h, url, piste: 1, origine, confiance: 0, preuve: {} })
	}

	// a) événements rattachés à une org : une seule requête, pas une par ligne.
	const { rows: evenements } = await query<Org & {
		event_id: number; title: string; summary: string | null; source_url: string | null; evidence: any
	}>(`SELECT e.id AS event_id, e.title, e.summary, e.source_url, e.evidence,
	             o.id, o.name, o.city, o.dept, o.domain, o.website
	      FROM event e JOIN org o ON o.id=e.org_id
	      WHERE (o.domain IS NULL OR btrim(o.domain)='')
	        AND (o.website IS NULL OR btrim(o.website)='')`)
	for (const e of evenements) {
		const refs: string[] = Array.isArray(e.evidence?.references) ? e.evidence.references : []
		const textes = [e.title, e.summary ?? "", e.source_url ?? "", ...refs, e.evidence?.description ?? "", e.evidence?.org_hint ?? ""]
		for (const h of domainesDansTexte(textes.join(" "))) {
			ajouter(e, h, `https://${h}/`, `event:${e.event_id}`, [e.title])
		}
	}

	// b) corps bruts collectés : les orgs citées sont chargées en une seule fois.
	const { rows: bruts } = await query<{ id: number; org_hint: string | null; raw_body: string | null }>(
		"SELECT id,org_hint,raw_body FROM quarantine_raw WHERE raw_body ~* 'https?://' OR org_hint ~* '[.]'",
	)
	const cles = new Set<string>()
	for (const brut of bruts) {
		const hint = (brut.org_hint ?? "").trim()
		if (!hint) continue
		cles.add(normaliser(hint))
		const h = racine(hint)
		if (h) cles.add(normaliser(h))
	}
	const { rows: orgsCitees } = await query<Org>(
		`SELECT id,name,city,dept,domain,website FROM org
		 WHERE name_norm = ANY($1::text[]) AND (domain IS NULL OR btrim(domain)='')`,
		[[...cles]],
	)
	const orgsParNom = new Map(orgsCitees.map((o) => [normaliser(o.name), o]))
	for (const brut of bruts) {
		const hint = (brut.org_hint ?? "").trim()
		const org = orgsParNom.get(normaliser(racine(hint) ?? hint)) ?? orgsParNom.get(normaliser(hint))
		if (!org || domainDejaRenseigne(org)) continue
		for (const h of domainesDansTexte(`${hint} ${brut.raw_body ?? ""}`)) {
			ajouter(org, h, `https://${h}/`, `quarantine:${brut.id}`, [hint])
		}
	}

	// c) un événement dont le texte contient le domaine qui EST le nom de l'org.
	const { rows: domainOrg } = await query<Org>(
		`SELECT id,name,city,dept,domain,website FROM org
		 WHERE (domain IS NULL OR btrim(domain)='') AND name ~* '^[a-z0-9][a-z0-9.-]*[.][a-z]{2,}$'`,
	)
	const orgsParDomain = new Map(domainOrg.map((o) => [o.name.toLowerCase(), o]))
	const { rows: textesEvenements } = await query<{ id: number; title: string; summary: string | null }>(
		"SELECT id,title,summary FROM event WHERE source_url IS NOT NULL",
	)
	for (const e of textesEvenements) {
		for (const h of domainesDansTexte(`${e.title} ${e.summary ?? ""}`)) {
			const org = orgsParDomain.get(h) ?? orgsParDomain.get(`www.${h}`)
			if (org) ajouter(org, h, `https://${h}/`, `event:${e.id}`, [e.title])
		}
	}

	const proposes = candidats.length
	const aVerifier = candidats.slice(0, Math.max(0, maxHttp))
	const resultats = await avecConcurrence(aVerifier, CONCURRENCE, async (c) => {
		s.tentatives += 1
		const v = await verifierUrl(c.url, c.org, [String(c.preuve.origine ?? "")])
		if (!v.ok) {
			echec(s, v.motif)
			return false
		}
		c.confiance = v.confiance
		c.url = v.urlFinale ?? c.url
		c.preuve = {
			statut: v.statut, urlFinale: v.urlFinale, titre: v.titre, token: v.token,
			motif: v.motif, origine: c.origine,
		}
		s.reussites += 1
		return true
	})
	return {
		candidats: aVerifier.filter((_, i) => resultats[i]),
		stat: s,
		examinees: evenements.length + bruts.length + textesEvenements.length,
		proposes,
	}
}

/** Piste 2 — échantillon borné de 100 SIREN, mesure du champ site web. */
async function piste2(n: number): Promise<{ mesure: MesureApi; sites: Candidat[] }> {
	const mesure: MesureApi = { examines: 0, ok: 0, avecSite: 0, dureesMs: [], erreurs: {} }
	const sites: Candidat[] = []
	const { rows } = await query<Org & { siren: string }>(
		`SELECT id,name,city,dept,domain,website,siren FROM org
		 WHERE siren IS NOT NULL AND (domain IS NULL OR btrim(domain)='')
		 ORDER BY md5(siren) LIMIT $1`,
		[n],
	)
	const cleSite = /^(?:site[_ ]?web|website|url[_ ]?site|site[_ ]?internet|site_officiel|official_website)$/i
	const estUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v.trim())
	const collecterSites = (value: unknown, found: string[]): void => {
		if (Array.isArray(value)) return void value.forEach((v) => collecterSites(v, found))
		if (!value || typeof value !== "object") return
		for (const [cle, v] of Object.entries(value as Record<string, unknown>)) {
			if (cleSite.test(cle) && estUrl(v)) found.push(v.trim())
			collecterSites(v, found)
		}
	}
	for (const org of rows) {
		mesure.examines += 1
		const debut = Date.now()
		let json: unknown
		let obtenu = false
		for (let tentative = 0; tentative < 2 && !obtenu; tentative++) {
			try {
				const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(org.siren)}&per_page=1`, {
					headers: { "User-Agent": UA, Accept: "application/json" },
					signal: AbortSignal.timeout(20_000),
				})
				if (!res.ok) {
					mesure.erreurs[`http-${res.status}`] = (mesure.erreurs[`http-${res.status}`] ?? 0) + 1
					break
				}
				json = await res.json()
				mesure.ok += 1
				obtenu = true
			} catch (err) {
				if (tentative === 1) {
					const motif = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "reseau"
					const detail = messageErreur(err).slice(0, 80)
					mesure.erreurs[`${motif}:${detail}`] = (mesure.erreurs[`${motif}:${detail}`] ?? 0) + 1
				} else await new Promise((r) => setTimeout(r, 400))
			} finally {
				if (tentative === 0) mesure.dureesMs.push(Date.now() - debut)
			}
		}
		await new Promise((r) => setTimeout(r, DELAI_API_MS))
		if (!obtenu) continue
		const urls: string[] = []
		collecterSites(json, urls)
		if (urls.length) {
			mesure.avecSite += 1
			const h = racine(urls[0])
			if (h && !HOTES_TIERS.has(h) && racineDistinctive(h, org, [])) {
				sites.push({ org, host: h, url: urls[0]!, piste: 2, origine: "recherche-entreprises:site-web", confiance: 0, preuve: {} })
			}
		}
	}
	return { mesure, sites }
}

/** Piste 3 — corpus à URL connue, rattachement par SIREN ou nom exact. */
async function piste3(cheminCommunes: string, max: number): Promise<{ candidats: Candidat[]; stat: Stat; examinees: number; proposes: number }> {
	const s = stat()
	const candidats: Candidat[] = []
	const communes = corpusJsonl(cheminCommunes)
	const sante = readFileSync(join(RACINE, "bench/corpus/sante-enseignement.jsonl"), "utf8")
		.trim().split("\n").filter(Boolean).map(JSON.parse)
	const sirens = [...new Set([...communes, ...sante].map((r) => String(r.siren ?? "")).filter((v) => /^\d{9}$/.test(v)))]
	const noms = [...new Set([...communes.map((r) => normaliser(r.nom)), ...sante.map((r) => normaliser(r.organisation || r.nom))].filter(Boolean))]
	const { rows: orgs } = await ingestQuery<Org & { siren: string | null; name_norm: string | null }>(
		`SELECT id,name,city,dept,domain,website,siren,name_norm FROM org
		 WHERE (siren = ANY($1::text[]) OR name_norm = ANY($2::text[]))
		   AND (domain IS NULL OR btrim(domain)='')
		   AND (website IS NULL OR btrim(website)='')`,
		[sirens, noms],
	)
	const parSiren = new Map<string, Org[]>()
	const parNom = new Map<string, Org[]>()
	for (const org of orgs) {
		if (org.siren) parSiren.set(org.siren, [...(parSiren.get(org.siren) ?? []), org])
		if (org.name_norm) parNom.set(org.name_norm, [...(parNom.get(org.name_norm) ?? []), org])
	}
	const orgPour = (siren: string, nom: string): Org | undefined => {
		const parSirenOrg = siren ? (parSiren.get(siren) ?? []) : []
		return parSirenOrg.length === 1 ? parSirenOrg[0] : (parNom.get(nom)?.length === 1 ? parNom.get(nom)![0] : undefined)
	}

	for (const row of communes) {
		const org = orgPour(String(row.siren ?? ""), normaliser(row.nom))
		if (!org || domainDejaRenseigne(org) || org.kind !== "collectivite") {
			rejet(s, org ? "domaine-deja-present-ou-type" : "org-commune-introuvable")
			continue
		}
		const nomVille = normaliser(row.nom)
		const villeOrg = normaliser(org.city)
		if (nomVille && villeOrg && !nomVille.includes(villeOrg) && !villeOrg.includes(nomVille)) {
			rejet(s, "commune-incompatible")
			continue
		}
		const host = racine(row.url_finale || row.url_candidate)
		if (!host || HOTES_TIERS.has(host)) {
			rejet(s, "hote-tiers")
			continue
		}
		candidats.push({
			org, host, url: row.url_finale || row.url_candidate, piste: 3,
			origine: `communes:${row.id}`, confiance: 0,
			preuve: { corpus: row.id, source: "wikidata/corpus-communes", siren: row.siren, statutCorpus: row.statut_http },
		})
	}

	for (const row of sante) {
		const host = racine(row.url)
		if (!host || HOTES_TIERS.has(host)) {
			rejet(s, "hote-tiers")
			continue
		}
		const nomCorpusBrut = row.organisation || row.nom
		const org = orgPour(String(row.siren ?? ""), normaliser(nomCorpusBrut))
		if (!org) {
			rejet(s, "org-introuvable")
			continue
		}
		if (domainDejaRenseigne(org)) {
			rejet(s, "domaine-deja-present")
			continue
		}
		const nomOrg = normaliser(org.name)
		const nomCorpus = normaliser(nomCorpusBrut)
		const sirenOk = Boolean(row.siren) && String(row.siren) === org.siren
		if (!sirenOk && nomOrg !== nomCorpus) {
			rejet(s, "nom-incoherent")
			continue
		}
		const ville = normaliser(row.commune)
		const villeOrg = normaliser(org.city)
		if (ville && villeOrg && !ville.includes(villeOrg) && !villeOrg.includes(ville)) {
			rejet(s, "ville-incompatible")
			continue
		}
		if (!racineDistinctive(host, org, [nomCorpusBrut])) {
			rejet(s, "domaine-non-distinctif")
			continue
		}
		candidats.push({
			org, host, url: row.url, piste: 3, origine: `sante-enseignement:${row.id}`,
			confiance: 0,
			preuve: {
				corpus: row.id, source: row.source, siren: row.siren || null,
				appariement: sirenOk ? "siren" : "nom-exact", nomCorpus: row.nom,
			},
		})
	}

	const proposes = candidats.length
	const aVerifier = candidats.slice(0, Math.max(0, max))
	const resultats = await avecConcurrence(aVerifier, CONCURRENCE, async (c) => {
		s.tentatives += 1
		const extra = [c.origine, String(c.preuve.nomCorpus ?? "")]
		const v = await verifierUrl(c.url, c.org, extra)
		if (!v.ok) {
			echec(s, v.motif)
			return false
		}
		if (!racine(v.urlFinale ?? "")) {
			echec(s, "url-finale-invalide")
			return false
		}
		c.confiance = v.confiance
		c.url = v.urlFinale ?? c.url
		c.preuve = { ...c.preuve, statut: v.statut, urlFinale: v.urlFinale, titre: v.titre, token: v.token, motif: v.motif }
		s.reussites += 1
		return true
	})
	return {
		candidats: aVerifier.filter((_, i) => resultats[i]),
		stat: s, examinees: communes.length + sante.length, proposes,
	}
}

interface LigneWikidata {
	qid: string
	siren: string
	site: string
	label: string
	labelNorm: string
}

async function fetchJson<T>(url: string): Promise<T> {
	for (let tentative = 0; tentative < 3; tentative++) {
		try {
			const res = await fetch(url, {
				headers: { "User-Agent": UA, Accept: "application/json" },
				signal: AbortSignal.timeout(25_000),
			})
			if (!res.ok) throw new Error(`http-${res.status}`)
			return (await res.json()) as T
		} catch (err) {
			if (tentative === 2) throw err
			await new Promise((r) => setTimeout(r, 600 * (tentative + 1)))
		}
	}
	throw new Error("wikidata: réponse impossible")
}

interface BindingWikidata { item: { value: string }; site?: { value: string }; siren?: { value: string }; label?: { value: string } }

/** Piste 4 — sites officiels Wikidata (P856) des organisations de Nouvelle-Aquitaine. */
async function wikidataSitesNa(): Promise<{ lignes: LigneWikidata[]; requetes: number }> {
	const requete = `SELECT ?item ?site ?siren WHERE {
		?item wdt:P856 ?site ; wdt:P131* wd:${NA_QID} .
		OPTIONAL { ?item wdt:P1616 ?siren }
	}`
	const url = `${SPARQL_URL}?query=${encodeURIComponent(requete)}&format=json`
	const json = await fetchJson<{ results: { bindings: BindingWikidata[] } }>(url)
	const brut = json.results.bindings.map((b) => ({
		qid: b.item.value.split("/").at(-1) ?? "",
		site: b.site?.value ?? "",
		siren: b.siren?.value ?? "",
	})).filter((l) => l.qid && l.site)
	const ids = [...new Set(brut.map((l) => l.qid))]
	const lots: string[][] = []
	for (let i = 0; i < ids.length; i += 150) lots.push(ids.slice(i, i + 150))
	const labels = new Map<string, string>()
	await avecConcurrence(lots, 3, async (lot) => {
		const q = `SELECT ?item ?label WHERE {
			VALUES ?item { ${lot.map((id) => `wd:${id}`).join(" ")} }
			?item rdfs:label ?label FILTER(lang(?label)="fr")
		}`
		const j = await fetchJson<{ results: { bindings: BindingWikidata[] } }>(
			`${SPARQL_URL}?query=${encodeURIComponent(q)}&format=json`,
		)
		for (const b of j.results.bindings) {
			labels.set(b.item.value.split("/").at(-1) ?? "", b.label?.value ?? "")
		}
	})
	return {
		lignes: brut.map((l) => {
			const label = labels.get(l.qid) ?? ""
			return { ...l, label, labelNorm: normaliser(label) }
		}),
		requetes: 1 + lots.length,
	}
}

async function piste4(max: number): Promise<{ candidats: Candidat[]; stat: Stat; examinees: number; requetes: number; proposes: number }> {
	const s = stat()
	const { lignes, requetes } = await wikidataSitesNa()
	const sirens = [...new Set(lignes.map((l) => l.siren).filter(Boolean))]
	const noms = [...new Set(lignes.map((l) => l.labelNorm).filter(Boolean))]
	// Une seule requête sur les 1,6 M d'orgs : les listes sont bornées par le corpus Wikidata.
	const { rows: orgs } = await ingestQuery<Org & { siren: string | null; name_norm: string | null }>(
		`SELECT id,name,city,dept,domain,website,siren,name_norm FROM org
		 WHERE (siren = ANY($1::text[]) OR name_norm = ANY($2::text[]))
		   AND (domain IS NULL OR btrim(domain)='')
		   AND (website IS NULL OR btrim(website)='')`,
		[sirens, noms],
	)
	const parSiren = new Map<string, Org[]>()
	const parNom = new Map<string, Org[]>()
	for (const org of orgs) {
		if (org.siren) parSiren.set(org.siren, [...(parSiren.get(org.siren) ?? []), org])
		if (org.name_norm) parNom.set(org.name_norm, [...(parNom.get(org.name_norm) ?? []), org])
	}
	const candidats: Candidat[] = []
	const vusHosts = new Set<string>()
	for (const l of lignes) {
		const parSirenOrg = l.siren ? (parSiren.get(l.siren) ?? []) : []
		const org = parSirenOrg.length === 1 ? parSirenOrg[0]! : (parNom.get(l.labelNorm)?.length === 1 ? parNom.get(l.labelNorm)![0]! : undefined)
		if (!org) continue
		const host = racine(l.site)
		if (!host || HOTES_TIERS.has(host) || vusHosts.has(`${org.id}:${host}`)) continue
		if (!racineDistinctive(host, org, [l.label])) continue
		vusHosts.add(`${org.id}:${host}`)
		const parSirenOk = parSirenOrg.length === 1 && parSirenOrg[0]!.id === org.id
		candidats.push({
			org, host, url: l.site, piste: 4,
			origine: `wikidata:${l.qid}`,
			confiance: 0,
			preuve: {
				source: "wikidata:P856", qid: l.qid,
				urlItem: `https://www.wikidata.org/wiki/${l.qid}`,
				siteDeclare: l.site, label: l.label,
				appariement: parSirenOk ? "siren" : "nom-exact",
				verifie_le: new Date().toISOString().slice(0, 10),
			},
		})
	}
	const proposes = candidats.length
	const aVerifier = candidats.slice(0, Math.max(0, max))
	const resultats = await avecConcurrence(aVerifier, CONCURRENCE, async (c) => {
		s.tentatives += 1
		const v = await verifierUrl(c.url, c.org, [String(c.preuve.label ?? "")])
		if (!v.ok) {
			echec(s, v.motif)
			return false
		}
		c.confiance = v.confiance
		c.url = v.urlFinale ?? c.url
		c.preuve = { ...c.preuve, statut: v.statut, urlFinale: v.urlFinale, titre: v.titre, token: v.token, motif: v.motif }
		s.reussites += 1
		return true
	})
	const uniques = new Map<number, Candidat>()
	aVerifier.filter((_, i) => resultats[i]).forEach((c) => {
		if (!uniques.has(c.org.id)) uniques.set(c.org.id, c)
	})
	return { candidats: [...uniques.values()], stat: s, examinees: lignes.length, requetes, proposes }
}

/** Piste 5 — corpus institutionnel déjà vérifié (branche InstitutionsComplet). */
async function piste5(max: number): Promise<{ candidats: Candidat[]; stat: Stat; examinees: number; proposes: number }> {
	const s = stat()
	const lignes = corpusJsonl("bench/corpus/institutions-complet.jsonl", "origin/big/InstitutionsComplet")
	const sirens = [...new Set(lignes.map((r) => String(r.siren ?? "")).filter((v) => /^\d{9}$/.test(v)))]
	const noms = [...new Set(lignes.map((r) => normaliser(r.nom)).filter(Boolean))]
	const { rows: orgs } = await ingestQuery<Org & { siren: string | null; name_norm: string | null }>(
		`SELECT id,name,city,dept,domain,website,siren,name_norm FROM org
		 WHERE (siren = ANY($1::text[]) OR name_norm = ANY($2::text[]))
		   AND (domain IS NULL OR btrim(domain)='')
		   AND (website IS NULL OR btrim(website)='')`,
		[sirens, noms],
	)
	const parSiren = new Map<string, Org[]>()
	const parNom = new Map<string, Org[]>()
	for (const org of orgs) {
		if (org.siren) parSiren.set(org.siren, [...(parSiren.get(org.siren) ?? []), org])
		if (org.name_norm) parNom.set(org.name_norm, [...(parNom.get(org.name_norm) ?? []), org])
	}
	const candidats: Candidat[] = []
	const vus = new Set<string>()
	for (const row of lignes) {
		const parSirenOrg = String(row.siren ?? "") ? (parSiren.get(String(row.siren)) ?? []) : []
		const nom = normaliser(row.nom)
		const org = parSirenOrg.length === 1 ? parSirenOrg[0]! : (parNom.get(nom)?.length === 1 ? parNom.get(nom)![0]! : undefined)
		if (!org) { rejet(s, "org-introuvable"); continue }
		if (domainDejaRenseigne(org)) { rejet(s, "domaine-deja-present"); continue }
		const ville = normaliser(row.commune)
		const villeOrg = normaliser(org.city)
		if (ville && villeOrg && !ville.includes(villeOrg) && !villeOrg.includes(ville)) { rejet(s, "ville-incompatible"); continue }
		const url = row.url_preuve || row.url
		const host = racine(url)
		if (!host || HOTES_TIERS.has(host)) { rejet(s, "hote-tiers"); continue }
		if (!racineDistinctive(host, org, [row.nom])) { rejet(s, "domaine-non-distinctif"); continue }
		if (vus.has(`${org.id}:${host}`)) { rejet(s, "doublon"); continue }
		vus.add(`${org.id}:${host}`)
		candidats.push({
			org, host, url, piste: 5, origine: `institutions-complet:${row.id}`, confiance: 0,
			preuve: {
				source: row.source, corpus: row.id, siren: row.siren || null,
				urlPreuveCorpus: row.url_preuve || null, preuveCorpus: row.preuve || null,
				appariement: parSirenOrg.length === 1 && parSirenOrg[0]!.id === org.id ? "siren" : "nom-exact",
				verifie_le: new Date().toISOString().slice(0, 10),
			},
		})
	}
	const proposes = candidats.length
	const aVerifier = candidats.slice(0, Math.max(0, max))
	const resultats = await avecConcurrence(aVerifier, CONCURRENCE, async (c) => {
		s.tentatives += 1
		const v = await verifierUrl(c.url, c.org, [String(c.org.name), String(c.preuve.corpus ?? "")])
		if (!v.ok) { echec(s, v.motif); return false }
		c.confiance = v.confiance
		c.url = v.urlFinale ?? c.url
		c.preuve = { ...c.preuve, statut: v.statut, urlFinale: v.urlFinale, titre: v.titre, token: v.token, motif: v.motif }
		s.reussites += 1
		return true
	})
	return { candidats: aVerifier.filter((_, i) => resultats[i]), stat: s, examinees: lignes.length, proposes }
}
async function mesurerAvant(): Promise<{ total: number; domaine: number; website: number; provenance: number }> {
	const { rows } = await ingestQuery<{ total: number; domaine: number; website: number; provenance: number }>(
		`SELECT count(*)::int AS total,
		        count(*) FILTER (WHERE domain IS NOT NULL AND btrim(domain)<>'')::int AS domaine,
		        count(*) FILTER (WHERE website IS NOT NULL AND btrim(website)<>'')::int AS website,
		        (SELECT count(*)::int FROM org_enrichissement WHERE champ='domaine') AS provenance
		 FROM org`,
	)
	const brut = rows[0]
	if (!brut) throw new Error("mesure impossible : aucune ligne org")
	return { total: brut.total, domaine: brut.domaine, website: brut.website, provenance: brut.provenance }
}

async function ecrire(candidats: Candidat[]): Promise<number> {
	let ecrits = 0
	for (const c of candidats) {
		try {
			const { rowCount } = await query(
				`UPDATE org SET domain=$2, website=COALESCE(NULLIF(btrim(website),''), $3)
				 WHERE id=$1 AND (domain IS NULL OR btrim(domain)='')`,
				[c.org.id, c.host, c.url],
			)
			if (!rowCount) continue
			ecrits += 1
			await query(
				`INSERT INTO org_enrichissement (org_id,champ,valeur,source,confiance,preuve)
				 VALUES ($1,'domaine',$2,$3,$4,$5::jsonb)
				 ON CONFLICT (org_id,champ) DO UPDATE SET
				   valeur=EXCLUDED.valeur, source=EXCLUDED.source,
				   confiance=EXCLUDED.confiance, preuve=EXCLUDED.preuve, verifie_at=now()
				 WHERE org_enrichissement.confiance < EXCLUDED.confiance`,
				[c.org.id, c.host, `domaines-reels:piste${c.piste}:${String(c.preuve.qid ?? "http")}:http200`, c.confiance, JSON.stringify(c.preuve)],
			)
		} catch (err) {
			console.error(`  ! écriture org ${c.org.id} : ${messageErreur(err)}`)
		}
	}
	return ecrits
}

function afficherStat(nom: string, s: Stat, examinees: number): void {
	const total = s.reussites + s.echecs
	console.log(
		`${nom}: examinées=${examinees} rejetéesAvantHTTP=${s.rejetes} vérificationsHTTP=${total} ` +
			`trouvés=${s.reussites} échecs=${s.echecs} tauxErreurHTTP=${total ? ((100 * s.echecs) / total).toFixed(1) : "0.0"}%`,
	)
	const motifs = Object.entries(s.motifs).sort((a, b) => b[1] - a[1]).slice(0, 5)
	if (motifs.length) console.log(`  motifs HTTP : ${motifs.map(([m, n]) => `${m}=${n}`).join(", ")}`)
	const rejets = Object.entries(s.rejets).sort((a, b) => b[1] - a[1]).slice(0, 5)
	if (rejets.length) console.log(`  motifs de rejet : ${rejets.map(([m, n]) => `${m}=${n}`).join(", ")}`)
}

async function main(): Promise<void> {
	const opt = lireOptions(process.argv.slice(2))
	const avant = await mesurerAvant()
	console.log(`AVANT : orgs=${avant.total} domaine=${avant.domaine} website=${avant.website} provenance=${avant.provenance}`)
	const vide = () => ({ candidats: [] as Candidat[], stat: stat(), examinees: 0, proposes: 0 })

	const p1 = opt.only.includes(1) ? await piste1(opt.maxHttp) : vide()
	console.log(`Piste 1 mesurée : ${p1.candidats.length} vérifié(s), ${p1.proposes} proposé(s)`)
	const p2 = opt.only.includes(2) ? await piste2(opt.sirenN) : {
		mesure: { examines: 0, ok: 0, avecSite: 0, dureesMs: [] as number[], erreurs: {} as Record<string, number> }, sites: [] as Candidat[],
	}
	console.log(`Piste 2 mesurée : ${p2.mesure.avecSite}/${p2.mesure.examines} réponse(s) avec site`)
	const p3 = opt.only.includes(3) ? await piste3(opt.communes, opt.maxCorpus) : vide()
	console.log(`Piste 3 mesurée : ${p3.candidats.length} vérifié(s)`)
	const p4 = opt.only.includes(4) ? await piste4(opt.maxWikidata) : { ...vide(), requetes: 0 }
	console.log(`Piste 4 mesurée : ${p4.candidats.length} vérifié(s), ${p4.proposes} proposé(s), ${p4.requetes} requêtes Wikidata`)
	const p5 = opt.only.includes(5) ? await piste5(opt.maxCorpus) : vide()
	console.log(`Piste 5 mesurée : ${p5.candidats.length} vérifié(s), ${p5.proposes} proposé(s)`)

	const apiTentatives = p2.mesure.ok + Object.values(p2.mesure.erreurs).reduce((a, b) => a + b, 0)
	const durees = p2.mesure.dureesMs
	console.log("\n=== PISTES ===")
	afficherStat("Piste 1 (liens d'articles)", p1.stat, p1.examinees)
	afficherStat("Piste 3 (corpus à URL connue)", p3.stat, p3.examinees)
	afficherStat("Piste 4 (Wikidata P856)", p4.stat, p4.examinees)
	afficherStat("Piste 5 (corpus institutions)", p5.stat, p5.examinees)
	const moyenne = durees.length ? durees.reduce((a, b) => a + b, 0) / durees.length : 0
	console.log(
		`Piste 2 (SIREN) : interrogés=${p2.mesure.examines} réponses200=${p2.mesure.ok} ` +
			`avecSite=${p2.mesure.avecSite} tauxSite=${p2.mesure.examines ? ((100 * p2.mesure.avecSite) / p2.mesure.examines).toFixed(1) : "0.0"}% ` +
			`tempsMoyen=${moyenne.toFixed(0)}ms erreurs=${JSON.stringify(p2.mesure.erreurs)}`,
	)

	// Une seule provenance par org : sources publiques à identifiant, puis corpus, puis liens.
	const parOrg = new Map<number, Candidat>()
	for (const c of [...p4.candidats, ...p5.candidats, ...p3.candidats, ...p1.candidats]) {
		if (!parOrg.has(c.org.id)) parOrg.set(c.org.id, c)
	}
	const retenus = [...parOrg.values()]
	const ecrits = opt.appliquer ? await ecrire(retenus) : 0
	const apres = opt.appliquer ? await mesurerAvant() : avant
	const echecsTotal = p1.stat.echecs + p3.stat.echecs + p4.stat.echecs + p5.stat.echecs + apiTentatives - p2.mesure.ok
	const tentativesTotal = p1.stat.tentatives + p3.stat.tentatives + p4.stat.tentatives + p5.stat.tentatives + apiTentatives
	console.log("\n=== BILAN ===")
	console.log(`Piste 1 : ${p1.candidats.length} domaine(s) vérifié(s) sur ${p1.stat.tentatives} vérifications HTTP (${p1.proposes} propositions)`)
	console.log(`Piste 2 : ${p2.mesure.avecSite} site(s) dans ${p2.mesure.examines} réponses SIREN (taux ${p2.mesure.examines ? ((100 * p2.mesure.avecSite) / p2.mesure.examines).toFixed(1) : "0.0"} %)`)
	console.log(`Piste 3 : ${p3.candidats.length} domaine(s) vérifié(s) sur ${p3.stat.tentatives} vérifications HTTP (${p3.proposes} propositions)`)
	console.log(`Piste 4 : ${p4.candidats.length} domaine(s) vérifié(s) sur ${p4.stat.tentatives} vérifications HTTP (${p4.proposes} propositions, ${p4.examinees} items Wikidata, ${p4.requetes} requêtes)`)
	console.log(`Piste 5 : ${p5.candidats.length} domaine(s) vérifié(s) sur ${p5.stat.tentatives} vérifications HTTP (${p5.proposes} propositions, ${p5.examinees} lignes de corpus)`)
	console.log(`Organisations gagnant un domaine : ${ecrits}${opt.appliquer ? "" : " (rapport seul : aucune écriture)"}`)
	console.log(`Domaines en base : ${avant.domaine} → ${apres.domaine} (provenance ${avant.provenance} → ${apres.provenance})`)
	console.log(`Taux d'erreur constaté : ${tentativesTotal ? ((100 * echecsTotal) / tentativesTotal).toFixed(1) : "0.0"} % (${echecsTotal}/${tentativesTotal} tentatives)`)
	if (ecrits) {
		const parPiste: Record<number, number> = {}
		for (const c of retenus) parPiste[c.piste] = (parPiste[c.piste] ?? 0) + 1
		console.log(`Détail des propositions retenues : ${JSON.stringify(parPiste)}`)
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		await main()
	} finally {
		await closePools()
	}
}
