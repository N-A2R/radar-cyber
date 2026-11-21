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
import { fileURLToPath } from "node:url"
import { closePools, query } from "../apps/api/src/db.js"
import { domaineRacine, normalizeDomainValue } from "../apps/api/src/match/domaine.js"

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..")
const UA = "RadarCyberNA/1.2 (domaines-reels; https://github.com/j0ltdevv/radar-cyber)"
const TIMEOUT_MS = 10_000
const MAX_OCTETS = 500_000
const CONCURRENCE = 6
const DELAI_API_MS = 160 // ≈ 6 req/s : sous la limite documentée de l'API SIREN
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

type Option = { appliquer: boolean; sirenN: number; maxHttp: number; communes: string }

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
	host: string
	url: string
	piste: 1 | 3
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
}

interface MesureApi {
	examines: number
	ok: number
	avecSite: number
	dureesMs: number[]
	erreurs: Record<string, number>
}

function stat(): Stat {
	return { tentatives: 0, reussites: 0, echecs: 0, motifs: {} }
}

function echec(s: Stat, motif: string): void {
	s.echecs += 1
	s.motifs[motif] = (s.motifs[motif] ?? 0) + 1
}

function lireOptions(argv: string[]): Option {
	const opt: Option = { appliquer: false, sirenN: 100, maxHttp: 160, communes: "bench/corpus/communes.jsonl" }
	for (const arg of argv) {
		if (arg === "--appliquer") opt.appliquer = true
		else if (arg.startsWith("--siren-n=")) opt.sirenN = Number(arg.split("=")[1])
		else if (arg.startsWith("--max-http=")) opt.maxHttp = Number(arg.split("=")[1])
		else if (arg.startsWith("--communes=")) opt.communes = arg.slice("--communes=".length)
		else if (arg === "--help" || arg === "-h") {
			console.log("usage : domaines-reels.mts [--appliquer] [--siren-n=100] [--max-http=160] [--communes=chemin]")
			process.exit(0)
		} else throw new Error(`option inconnue : ${arg}`)
	}
	if (!Number.isInteger(opt.sirenN) || opt.sirenN < 0 || opt.sirenN > 100) {
		throw new Error("--siren-n doit être un entier entre 0 et 100 (plafond de l'échantillon)")
	}
	if (!Number.isInteger(opt.maxHttp) || opt.maxHttp < 0) throw new Error("--max-http invalide")
	return opt
}

function normaliser(value: string | null | undefined): string {
	return (value ?? "")
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

function domainesDansTexte(texte: string | null | undefined): Set<string> {
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
	const distinctifs = jetons(org.name, ...extra, hoteFinal.split(".")[0])
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

function corpusJsonl(chemin: string): any[] {
	const local = join(RACINE, chemin)
	if (existsSync(local)) return readFileSync(local, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
	// Le corpus des 74 communes vit sur la branche dédiée tant qu'elle n'est
	// pas fusionnée ; le contenu est lu sans modification.
	const sortie = execFileSync("git", ["-C", RACINE, "show", "origin/big/CorpusCommunes-2:bench/corpus/communes.jsonl"], { encoding: "utf8" })
	return sortie.trim().split("\n").filter(Boolean).map(JSON.parse)
}

async function orgParSiren(siren: string): Promise<Org | null> {
	if (!/^\d{9}$/.test(siren)) return null
	const { rows } = await query<Org>("SELECT id,name,city,dept,domain,website FROM org WHERE siren=$1 LIMIT 2", [siren])
	return rows.length === 1 ? rows[0]! : null
}

async function orgParNom(nom: string): Promise<Org | null> {
	const n = normaliser(nom)
	if (n.length < 4) return null
	const { rows } = await query<Org>("SELECT id,name,city,dept,domain,website FROM org WHERE name_norm=$1 LIMIT 2", [n])
	return rows.length === 1 ? rows[0]! : null
}

function domainDejaRenseigne(org: Org): boolean {
	return Boolean(org.domain && org.domain.trim()) || Boolean(org.website && org.website.trim())
}

/** Racine distinctive : le nom de l'org doit apparaître dans le domaine. */
function racineDistinctive(host: string, org: Org, extra: string[]): boolean {
	const label = compact(host.split(".")[0] ?? "")
	if (label.length < 4) return false
	const distinctifs = jetons(org.name, ...extra)
	return distinctifs.some((mot) => {
		const c = compact(mot)
		return c.length >= 4 && (label.includes(c) || (c.length >= 6 && c.includes(label)))
	})
}

/** Piste 1 — extraire les domaines cités, les rattacher, puis les vérifier. */
async function piste1(maxHttp: number): Promise<{ candidats: Candidat[]; stat: Stat; examinees: number }> {
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

	// a) événements rattachés à une org, avec URL source et/ou corps citant un site ;
	const { rows: events } = await query<{
		id: number; title: string; summary: string | null; source_url: string | null; evidence: any; org_id: number | null
	}>(`SELECT e.id,e.title,e.summary,e.source_url,e.evidence,e.org_id FROM event e
	     JOIN org o ON o.id=e.org_id
	     WHERE (o.domain IS NULL OR btrim(o.domain)='') AND (o.website IS NULL OR btrim(o.website)='')`)
	for (const e of events) {
		const { rows: orgs } = await query<Org>("SELECT id,name,city,dept,domain,website FROM org WHERE id=$1", [e.org_id])
		const org = orgs[0]
		if (!org) continue
		const refs: string[] = Array.isArray(e.evidence?.references) ? e.evidence.references : []
		const textes = [e.title, e.summary ?? "", e.source_url ?? "", ...refs, e.evidence?.description ?? "", e.evidence?.org_hint ?? ""]
		for (const h of domainesDansTexte(textes.join(" "))) {
			ajouter(org, h, `https://${h}/`, `event:${e.id}`, [e.title])
		}
	}

	// b) corps bruts collectés : l'indice org_hint et le texte peuvent porter le site ;
	const { rows: bruts } = await query<{ id: number; org_hint: string | null; raw_body: string | null }>(
		"SELECT id,org_hint,raw_body FROM quarantine_raw WHERE raw_body ~* 'https?://' OR org_hint ~* '[.]'",
	)
	for (const brut of bruts) {
		const hint = (brut.org_hint ?? "").trim()
		const hintRacine = racine(hint)
		const org = (hintRacine ? await orgParNom(hintRacine) : null) ?? (await orgParNom(hint))
		if (!org || domainDejaRenseigne(org)) continue
		for (const h of domainesDansTexte(`${hint} ${brut.raw_body ?? ""}`)) {
			ajouter(org, h, `https://${h}/`, `quarantine:${brut.id}`, [hint, brut.raw_body?.slice(0, 400) ?? ""])
		}
	}

	// c) un événement dont le texte contient un domaine qui EST le nom de l'org ;
	const { rows: domainOrg } = await query<Org>(
		`SELECT id,name,city,dept,domain,website FROM org
		 WHERE (domain IS NULL OR btrim(domain)='') AND name ~* '^[a-z0-9][a-z0-9.-]*[.][a-z]{2,}$'`,
	)
	const noms = new Set(domainOrg.map((o) => o.name.toLowerCase()))
	const { rows: textesEvenements } = await query<{ id: number; title: string; summary: string | null }>(
		"SELECT id,title,summary FROM event WHERE source_url IS NOT NULL",
	)
	for (const e of textesEvenements) {
		for (const h of domainesDansTexte(`${e.title} ${e.summary ?? ""}`)) {
			const org = domainOrg.find((o) => o.name.toLowerCase() === h || o.name.toLowerCase() === `www.${h}`)
			if (org && noms.has(org.name.toLowerCase())) ajouter(org, h, `https://${h}/`, `event:${e.id}`, [e.title])
		}
	}

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
		examinees: events.length + bruts.length + textesEvenements.length,
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
		try {
			const res = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(org.siren)}&per_page=1`, {
				headers: { "User-Agent": UA, Accept: "application/json" },
				signal: AbortSignal.timeout(TIMEOUT_MS),
			})
			if (!res.ok) {
				mesure.erreurs[`http-${res.status}`] = (mesure.erreurs[`http-${res.status}`] ?? 0) + 1
				continue
			}
			json = await res.json()
			mesure.ok += 1
		} catch (err) {
			const motif = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "reseau"
			mesure.erreurs[motif] = (mesure.erreurs[motif] ?? 0) + 1
			continue
		} finally {
			mesure.dureesMs.push(Date.now() - debut)
			await new Promise((r) => setTimeout(r, DELAI_API_MS))
		}
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
async function piste3(cheminCommunes: string): Promise<{ candidats: Candidat[]; stat: Stat; examinees: number }> {
	const s = stat()
	const candidats: Candidat[] = []
	const communes = corpusJsonl(cheminCommunes)
	const sante = readFileSync(join(RACINE, "bench/corpus/sante-enseignement.jsonl"), "utf8")
		.trim().split("\n").filter(Boolean).map(JSON.parse)

	for (const row of communes) {
		const org = await orgParSiren(String(row.siren ?? ""))
		if (!org || domainDejaRenseigne(org) || org.kind !== "collectivite") {
			echec(s, org ? "domaine-deja-present" : "org-commune-introuvable")
			continue
		}
		const nomVille = normaliser(row.nom)
		const villeOrg = normaliser(org.city)
		if (nomVille && villeOrg && !nomVille.includes(villeOrg) && !villeOrg.includes(nomVille)) {
			echec(s, "commune-incompatible")
			continue
		}
		const host = racine(row.url_finale || row.url_candidate)
		if (!host || HOTES_TIERS.has(host)) {
			echec(s, "hote-tiers")
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
			echec(s, "hote-tiers")
			continue
		}
		let org = await orgParSiren(String(row.siren ?? ""))
		if (!org) org = await orgParNom(row.organisation || row.nom)
		if (!org) {
			echec(s, "org-introuvable")
			continue
		}
		if (domainDejaRenseigne(org)) {
			echec(s, "domaine-deja-present")
			continue
		}
		const nomOrg = normaliser(org.name)
		const nomCorpus = normaliser(row.organisation || row.nom)
		const sirenOk = Boolean(row.siren) && String(row.siren) === org.siren
		if (!sirenOk && nomOrg !== nomCorpus) {
			echec(s, "nom-incoherent")
			continue
		}
		const ville = normaliser(row.commune)
		const villeOrg = normaliser(org.city)
		if (ville && villeOrg && !ville.includes(villeOrg) && !villeOrg.includes(ville)) {
			echec(s, "ville-incompatible")
			continue
		}
		if (!racineDistinctive(host, org, [row.organisation || row.nom])) {
			echec(s, "domaine-non-distinctif")
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

	const resultats = await avecConcurrence(candidats, CONCURRENCE, async (c) => {
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
	return { candidats: candidats.filter((_, i) => resultats[i]), stat: s, examinees: communes.length + sante.length }
}

async function mesurerAvant(): Promise<{ total: number; domaine: number; website: number; provenance: number }> {
	const { rows } = await query<{ total: number; domaine: number; website: number; provenance: number }>(
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
				[c.org.id, c.host, `domaines-reels:piste${c.piste}:http200`, c.confiance, JSON.stringify(c.preuve)],
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
		`${nom}: examinées=${examinees} vérifications=${total} ` +
			`trouvés=${s.reussites} échecs=${s.echecs} tauxErreur=${total ? ((100 * s.echecs) / total).toFixed(1) : "0.0"}%`,
	)
	const motifs = Object.entries(s.motifs).sort((a, b) => b[1] - a[1]).slice(0, 5)
	if (motifs.length) console.log(`  motifs : ${motifs.map(([m, n]) => `${m}=${n}`).join(", ")}`)
}

async function main(): Promise<void> {
	const opt = lireOptions(process.argv.slice(2))
	const avant = await mesurerAvant()
	console.log(`AVANT : orgs=${avant.total} domaine=${avant.domaine} website=${avant.website} provenance=${avant.provenance}`)

	const p1 = await piste1(opt.maxHttp)
	const p2 = await piste2(opt.sirenN)
	const p3 = await piste3(opt.communes)
	const apiTentatives = p2.mesure.ok + Object.values(p2.mesure.erreurs).reduce((a, b) => a + b, 0)
	const durees = p2.mesure.dureesMs
	console.log("\n=== PISTES ===")
	afficherStat("Piste 1 (liens d'articles)", p1.stat, p1.examinees)
	afficherStat("Piste 3 (corpus à URL connue)", p3.stat, p3.examinees)
	const moyenne = durees.length ? durees.reduce((a, b) => a + b, 0) / durees.length : 0
	console.log(
		`Piste 2 (SIREN) : interrogés=${p2.mesure.examines} réponses200=${p2.mesure.ok} ` +
			`avecSite=${p2.mesure.avecSite} tauxSite=${p2.mesure.examines ? ((100 * p2.mesure.avecSite) / p2.mesure.examines).toFixed(1) : "0.0"}% ` +
			`tempsMoyen=${moyenne.toFixed(0)}ms erreurs=${JSON.stringify(p2.mesure.erreurs)}`,
	)

	const retenus = [...p1.candidats, ...p3.candidats]
	const ecrits = opt.appliquer ? await ecrire(retenus) : 0
	const apres = opt.appliquer ? await mesurerAvant() : avant
	const echecsTotal = p1.stat.echecs + p3.stat.echecs + apiTentatives - p2.mesure.ok
	const tentativesTotal = p1.stat.tentatives + p3.stat.tentatives + apiTentatives
	console.log("\n=== BILAN ===")
	console.log(`Piste 1 : ${p1.candidats.length} domaine(s) vérifié(s) sur ${p1.stat.tentatives} vérifications HTTP`)
	console.log(`Piste 2 : ${p2.mesure.avecSite} site(s) dans ${p2.mesure.examines} réponses SIREN (taux ${p2.mesure.examines ? ((100 * p2.mesure.avecSite) / p2.mesure.examines).toFixed(1) : "0.0"} %)`)
	console.log(`Piste 3 : ${p3.candidats.length} domaine(s) vérifié(s) sur ${p3.stat.tentatives} vérifications HTTP`)
	console.log(`Organisations gagnant un domaine : ${ecrits}${opt.appliquer ? "" : " (rapport seul : aucune écriture)"}`)
	console.log(`Domaines en base : ${avant.domaine} → ${apres.domaine} (provenance ${avant.provenance} → ${apres.provenance})`)
	console.log(`Taux d'erreur constaté : ${tentativesTotal ? ((100 * echecsTotal) / tentativesTotal).toFixed(1) : "0.0"} % (${echecsTotal}/${tentativesTotal} tentatives)`)
	if (ecrits) {
		const parPiste: Record<number, number> = {}
		for (const c of retenus) parPiste[c.piste] = (parPiste[c.piste] ?? 0) + 1
		console.log(`Détail des propositions retenues : ${JSON.stringify(parPiste)}`)
	}
}

try {
	await main()
} finally {
	await closePools()
}
