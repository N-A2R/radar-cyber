#!/usr/bin/env -S npx tsx
/**
<<<<<<< HEAD
 * Enrichissement traçable du référentiel d'organisations : domaine, SIREN, géo.
 *
 * Usage :
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/enrichir-referentiel.mts [options]
 *
 *   --appliquer           écrit en base (SANS ce drapeau : rapport seul, zéro écriture)
 *   --limit=N             organisations examinées par module (défaut 50)
 *   --offset=N            décalage déterministe dans la file de chaque module
 *   --modules=a,b,c       sous-ensemble de domaine,siren,geo
 *   --max-appels=N        plafond TOTAL d'appels réseau (défaut 250)
 *   --help
 *
 * Prérequis : migration db/migrate-049-org-enrichissement.sql appliquée
 * (`pnpm migrate`). Elle ajoute org.code_postal et la table de provenance
 * org_enrichissement (source + confiance + preuve par valeur).
 *
 * Règles de vérité :
 *  - un domaine n'est écrit qu'après un HTTP 200 réel, une redirection restée
 *    sur le même hôte et un contenu qui cite la commune ;
 *  - un SIREN n'est écrit que si le nom (et le département quand il est connu)
 *    correspondent à la réponse de recherche-entreprises.api.gouv.fr ;
 *  - une coordonnée n'est écrite que si un code postal à 5 chiffres existe et
 *    que geo.api.gouv.fr renvoie une commune non ambiguë ;
 *  - tout échec est compté et motifé. Une URL qui ne répond pas n'est jamais
 *    écrite, même en mode --appliquer.
 *
 * La mesure « après » est RÉELLE en mode --appliquer (recompte SQL) et
 * PROJETÉE en mode rapport (aucune écriture : on additionne les propositions).
 */
import { closePools, query } from "../apps/api/src/db.js"
import {
	candidatsDomaine,
	evaluerCoherence,
	evaluerCorrespondanceSiren,
	estCodePostal,
	parserCommunes,
	parserResultatsRecherche,
	type ChampEnrichi,
	type HitSiren,
	type OrgEnrichissable,
} from "../apps/api/src/referentiel/enrichissement.js"

const UA = "RadarCyberNA/1.1 (enrichissement referentiel; https://github.com/j0ltdevv/radar-cyber)"
const MIN_GAP_MS = 350 // ≈ 2,8 req/s : sous les quotas des deux API publiques
const TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 300_000
const SEARCH_URL = "https://recherche-entreprises.api.gouv.fr/search"
const COMMUNES_URL = "https://geo.api.gouv.fr/communes"

type Module = "domaine" | "siren" | "geo"
type Mode = "json" | "html"

interface Options {
	appliquer: boolean
	limit: number
	offset: number
	maxAppels: number
	modules: Set<Module>
}

interface OrgRow extends OrgEnrichissable {
	lat: number | null
	lon: number | null
	siren: string | null
	code_postal: string | null
	domain: string | null
	website: string | null
}

interface Statistique {
	examines: number
	reussites: number
	echecs: number
	motifs: Record<string, number>
}

interface PropositionDomaine {
	orgId: number
	host: string
	url: string
	source: string
	confiance: number
	preuve: Record<string, unknown>
}

interface PropositionSiren {
	orgId: number
	siren: string
	codePostal: string | null
	confiance: number
	preuve: Record<string, unknown>
}

interface PropositionGeo {
	orgId: number
	lat: number
	lon: number
	codePostal: string | null
	codePostalSource: string | null
	confiance: number
	preuve: Record<string, unknown>
}

interface ReponseOk {
	ok: true
	statut: number
	urlFinale: string
	json: unknown
	html: string
}

interface ReponseKo {
	ok: false
	motif: string
}

type Reponse = ReponseOk | ReponseKo

interface Mesure {
	total: number
	domaine: number
	website: number
	siren: number
	geo: number
	codePostal: number
	provenance: Record<string, number>
}

const nf = new Intl.NumberFormat("fr-FR")

function nouvelleStat(): Statistique {
	return { examines: 0, reussites: 0, echecs: 0, motifs: {} }
}

function echec(stat: Statistique, motif: string): void {
	stat.echecs += 1
	stat.motifs[motif] = (stat.motifs[motif] ?? 0) + 1
}

function usage(): string {
	return [
		"usage : enrichir-referentiel.mts [--appliquer] [--limit=N] [--offset=N]",
		"                                  [--modules=domaine,siren,geo] [--max-appels=N]",
		"  rapport seul par défaut ; --appliquer est la seule porte d'écriture.",
		"  défauts : limit=50, offset=0, max-appels=250, tous les modules.",
	].join("\n")
}

function entierPositif(arg: string, nom: string): number {
	const brut = arg.slice(arg.indexOf("=") + 1)
	const valeur = Number(brut)
	if (!Number.isInteger(valeur) || valeur < 0 || (nom === "limit" && valeur === 0)) {
		throw new Error(`${nom} invalide : « ${brut} » (entier positif attendu)`)
	}
	return valeur
}

function lireOptions(argv: string[]): Options {
	const modules = new Set<Module>(["domaine", "siren", "geo"])
	let appliquer = false
	let limit = 50
	let offset = 0
	let maxAppels = 250
	for (const arg of argv) {
		if (arg === "--help" || arg === "-h") {
			console.log(usage())
			process.exit(0)
		} else if (arg === "--appliquer") {
			appliquer = true
		} else if (arg.startsWith("--limit=")) {
			limit = entierPositif(arg, "limit")
		} else if (arg.startsWith("--offset=")) {
			offset = entierPositif(arg, "offset")
		} else if (arg.startsWith("--max-appels=")) {
			maxAppels = entierPositif(arg, "max-appels")
		} else if (arg.startsWith("--modules=")) {
			const demandes = arg.slice("--modules=".length).split(",").filter(Boolean) as Module[]
			if (demandes.some((m) => m !== "domaine" && m !== "siren" && m !== "geo")) {
				throw new Error("--modules : valeurs possibles domaine,siren,geo")
			}
			modules.clear()
			for (const m of demandes) modules.add(m)
		} else {
			throw new Error(`option inconnue : ${arg}`)
		}
	}
	return { appliquer, limit, offset, maxAppels, modules }
}

/** Budget global : un dépassement est un échec explicite, jamais une écriture. */
class BudgetAppels {
	appels = 0
	constructor(private readonly maximum: number) {}
	prendre(): boolean {
		if (this.appels >= this.maximum) return false
		this.appels += 1
		return true
	}
	epuise(): boolean {
		return this.appels >= this.maximum
	}
}

let dernierAppel = 0
let fileAttente: Promise<void> = Promise.resolve()

async function attendreTour(): Promise<void> {
	const tour = fileAttente.then(async () => {
		const attente = MIN_GAP_MS - (Date.now() - dernierAppel)
		if (attente > 0) await new Promise<void>((resolve) => setTimeout(resolve, attente))
		dernierAppel = Date.now()
	})
	fileAttente = tour.catch(() => {})
	await tour
}

async function lireHtmlReponse(res: Response): Promise<string> {
	const lecteur = res.body?.getReader()
	if (!lecteur) return res.text()
	const morceaux: Uint8Array[] = []
	let total = 0
	for (;;) {
		const { done, value } = await lecteur.read()
		if (done) break
		morceaux.push(value)
		total += value.byteLength
		if (total > MAX_HTML_BYTES) {
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
	return new TextDecoder("utf-8").decode(octets)
}

const DNS_SANS_RETRY = new Set(["ENOTFOUND", "EAI_AGAIN", "ENODATA"])

function codeErreurReseau(err: unknown): string {
	if (typeof err !== "object" || err === null || !("cause" in err)) return ""
	const cause: unknown = err.cause
	if (typeof cause !== "object" || cause === null || !("code" in cause)) return ""
	return typeof cause.code === "string" ? cause.code : ""
}

/** Un appel GET avec 2 tentatives sur 429/5xx, throttlé et borné dans le temps. */
async function requete(url: string, mode: Mode, budget: BudgetAppels): Promise<Reponse> {
	for (let tentative = 0; tentative < 2; tentative++) {
		if (!budget.prendre()) return { ok: false, motif: "budget-appels-epuise" }
		await attendreTour()
		const controle = new AbortController()
		const timer = setTimeout(() => controle.abort(), TIMEOUT_MS)
		try {
			const res = await fetch(url, {
				headers: { "User-Agent": UA, Accept: mode === "json" ? "application/json" : "text/html" },
				signal: controle.signal,
				redirect: "follow",
			})
			if (res.ok) {
				return {
					ok: true,
					statut: res.status,
					urlFinale: res.url,
					json: mode === "json" ? ((await res.json()) as unknown) : null,
					html: mode === "html" ? await lireHtmlReponse(res) : "",
				}
			}
			if (res.status !== 429 && res.status < 500) return { ok: false, motif: `http-${res.status}` }
		} catch (err) {
			// Un nom qui ne résout pas ne résoudra pas plus une seconde plus tard.
			if (DNS_SANS_RETRY.has(codeErreurReseau(err))) {
				return { ok: false, motif: "dns-introuvable" }
			}
			// timeout, TLS, JSON invalide : une seule nouvelle tentative.
		} finally {
			clearTimeout(timer)
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 400 + tentative * 800))
	}
	return { ok: false, motif: "reseau-ou-timeout" }
}

function hoteCoherent(hoteFinal: string, attendu: string): boolean {
	const nettoyer = (h: string): string => h.toLowerCase().replace(/\.$/, "").replace(/^www\./, "")
	const final = nettoyer(hoteFinal)
	const cible = nettoyer(attendu)
	return final === cible || final.endsWith(`.${cible}`)
}

async function verifierDomaine(
	org: OrgRow,
	budget: BudgetAppels,
	stat: Statistique,
): Promise<PropositionDomaine[]> {
	const propositions: PropositionDomaine[] = []
	for (const candidat of candidatsDomaine(org)) {
		let dernierMotif = "aucune-tentative"
		for (const scheme of ["https", "http"] as const) {
			if (budget.epuise()) {
				echec(stat, "budget-appels-epuise")
				return propositions
			}
			const res = await requete(`${scheme}://${candidat.host}/`, "html", budget)
			if (!res.ok) {
				dernierMotif = res.motif
				continue
			}
			if (res.statut !== 200) {
				dernierMotif = `http-${res.statut}`
				continue
			}
			let hoteFinal: string
			try {
				hoteFinal = new URL(res.urlFinale).hostname
			} catch {
				dernierMotif = "url-finale-invalide"
				continue
			}
			if (!hoteCoherent(hoteFinal, candidat.host)) {
				dernierMotif = "redirection-hors-hote"
				continue
			}
			const coherence = evaluerCoherence(res.html, org)
			if (!coherence.ok) {
				dernierMotif = coherence.motif
				continue
			}
			stat.reussites += 1
			propositions.push({
				orgId: org.id,
				host: hoteFinal.toLowerCase(),
				url: res.urlFinale,
				source: candidat.source,
				confiance: coherence.confiance,
				preuve: {
					scheme,
					statut: res.statut,
					hote: hoteFinal.toLowerCase(),
					url: res.urlFinale,
					titre: coherence.titre,
					token: coherence.token,
					motif: coherence.motif,
				},
			})
			return propositions
		}
		echec(stat, dernierMotif)
	}
	return propositions
}

async function proposerSiren(
	org: OrgRow,
	budget: BudgetAppels,
	stat: Statistique,
	sirensConnus: Set<string>,
): Promise<PropositionSiren | null> {
	const nomRecherche = org.name.replace(/\s*\([^)]*\)\s*$/, "") || org.name
	const url = `${SEARCH_URL}?q=${encodeURIComponent(nomRecherche)}&per_page=5`
	const res = await requete(url, "json", budget)
	if (!res.ok) {
		echec(stat, res.motif)
		return null
	}
	const hits: HitSiren[] = parserResultatsRecherche(res.json)
	if (hits.length === 0) {
		echec(stat, "aucun-resultat-api")
		return null
	}
	let meilleur: { hit: HitSiren; motif: string; confiance: number } | null = null
	for (const hit of hits) {
		const verdict = evaluerCorrespondanceSiren(org, hit)
		if (!verdict.ok || sirensConnus.has(hit.siren)) continue
		if (!meilleur || verdict.confiance > meilleur.confiance) {
			meilleur = { hit, motif: verdict.motif, confiance: verdict.confiance }
		}
	}
	if (!meilleur) {
		echec(stat, "aucune-correspondance-sure")
		return null
	}
	sirensConnus.add(meilleur.hit.siren)
	stat.reussites += 1
	return {
		orgId: org.id,
		siren: meilleur.hit.siren,
		codePostal: meilleur.hit.codePostal,
		confiance: meilleur.confiance,
		preuve: {
			nomApi: meilleur.hit.nom,
			communeApi: meilleur.hit.commune,
			deptApi: meilleur.hit.dept,
			etablissementsApi: meilleur.hit.etablissements.length,
			etat: meilleur.hit.etat,
			motif: meilleur.motif,
			resultats: hits.length,
		},
	}
}

/**
 * Le code postal peut déjà être en base, venir du siège trouvé par le module
 * SIREN, ou être obtenu par une recherche SIREN (l'API publique ne expose pas
 * de route /siren/{siren}, mais /search?q={siren} renvoie l'unité légale).
 */
async function resoudreCodePostal(
	org: OrgRow,
	codePostalSiren: string | null,
	budget: BudgetAppels,
	stat: Statistique,
): Promise<{ codePostal: string; source: string } | null> {
	if (estCodePostal(codePostalSiren)) {
		return { codePostal: codePostalSiren, source: "recherche-entreprises:siege" }
	}
	if (estCodePostal(org.code_postal)) {
		return { codePostal: org.code_postal, source: "base:code_postal" }
	}
	if (!/^\d{9}$/.test(org.siren ?? "")) {
		echec(stat, "sans-code-postal-ni-siren")
		return null
	}
	const res = await requete(`${SEARCH_URL}?q=${org.siren}&per_page=1`, "json", budget)
	if (!res.ok) {
		echec(stat, res.motif)
		return null
	}
	const hit = parserResultatsRecherche(res.json).find((h) => h.siren === org.siren)
	if (!hit?.codePostal) {
		echec(stat, "siren-sans-code-postal")
		return null
	}
	return { codePostal: hit.codePostal, source: "recherche-entreprises:siege" }
}

async function proposerGeo(
	org: OrgRow,
	codePostal: string,
	codePostalSource: string,
	budget: BudgetAppels,
	stat: Statistique,
): Promise<PropositionGeo | null> {
	const url = `${COMMUNES_URL}?codePostal=${encodeURIComponent(codePostal)}&fields=code,nom,centre,codesPostaux&limit=20`
	const res = await requete(url, "json", budget)
	if (!res.ok) {
		echec(stat, res.motif)
		return null
	}
	const verdict = parserCommunes(res.json, codePostal, org)
	if (!verdict.ok || !verdict.coord) {
		echec(stat, verdict.motif)
		return null
	}
	stat.reussites += 1
	return {
		orgId: org.id,
		lat: verdict.coord.lat,
		lon: verdict.coord.lon,
		codePostal,
		codePostalSource,
		confiance: verdict.coord.confiance,
		preuve: {
			codePostal,
			source: codePostalSource,
			commune: verdict.coord.nom,
			codeCommune: verdict.coord.code,
			motif: verdict.motif,
		},
	}
}

async function mesurer(): Promise<Mesure> {
	const { rows } = await query<{
		total: number
		domaine: number
		website: number
		siren: number
		geo: number
		code_postal: number
	}>(`SELECT count(*)::int AS total,
	         count(*) FILTER (WHERE domain IS NOT NULL AND btrim(domain) <> '')::int AS domaine,
	         count(*) FILTER (WHERE website IS NOT NULL AND btrim(website) <> '')::int AS website,
	         count(*) FILTER (WHERE siren IS NOT NULL AND btrim(siren) <> '')::int AS siren,
	         count(*) FILTER (WHERE lat IS NOT NULL AND lon IS NOT NULL)::int AS geo,
	         count(*) FILTER (WHERE code_postal IS NOT NULL AND btrim(code_postal) <> '')::int AS code_postal
	      FROM org`)
	const provenance = await query<{ champ: string; n: number }>(
		"SELECT champ, count(*)::int AS n FROM org_enrichissement GROUP BY champ ORDER BY champ",
	)
	const brut = rows[0]!
	const mesure: Mesure = {
		total: brut.total,
		domaine: brut.domaine,
		website: brut.website,
		siren: brut.siren,
		geo: brut.geo,
		codePostal: brut.code_postal,
		provenance: {},
	}
	for (const row of provenance.rows) mesure.provenance[row.champ] = row.n
	return mesure
}

function afficherMesure(titre: string, mesure: Mesure, nature: string): void {
	console.log(`\n=== ${titre} (${nature}) ===`)
	for (const [label, valeur] of [
		["organisations", mesure.total],
		["avec domaine", mesure.domaine],
		["avec site web", mesure.website],
		["avec SIREN", mesure.siren],
		["avec lat/lon", mesure.geo],
		["avec code postal", mesure.codePostal],
	] as const) {
		console.log(`  ${label.padEnd(18)} ${nf.format(valeur).padStart(12)}`)
	}
	const prov = Object.entries(mesure.provenance)
		.map(([champ, n]) => `${champ}=${nf.format(n)}`)
		.join(", ")
	console.log(`  provenance        ${prov || "aucune"}`)
}

function afficherDelta(label: string, avant: number, apres: number): void {
	console.log(`  ${label.padEnd(18)} ${nf.format(avant).padStart(12)} → ${nf.format(apres).padStart(12)}  (+${nf.format(apres - avant)})`)
}

function afficherStat(label: string, stat: Statistique): void {
	const total = stat.reussites + stat.echecs
	const taux = total === 0 ? 0 : (100 * stat.echecs) / total
	console.log(
		`  ${label.padEnd(10)} examinées=${nf.format(stat.examines).padStart(4)} ` +
			`propositions=${nf.format(stat.reussites).padStart(4)} échecs=${nf.format(stat.echecs).padStart(4)} ` +
			`taux d'erreur=${taux.toFixed(1)}%`,
	)
	const motifs = Object.entries(stat.motifs).sort((a, b) => b[1] - a[1]).slice(0, 5)
	if (motifs.length) console.log(`             motifs : ${motifs.map(([m, n]) => `${m}=${n}`).join(", ")}`)
}

async function tracer(
	orgId: number,
	champ: ChampEnrichi,
	valeur: string,
	source: string,
	confiance: number,
	preuve: Record<string, unknown>,
): Promise<boolean> {
	try {
		await query(
			`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve)
			 VALUES ($1,$2,$3,$4,$5,$6::jsonb)
			 ON CONFLICT (org_id, champ) DO UPDATE
			 SET valeur=EXCLUDED.valeur, source=EXCLUDED.source, confiance=EXCLUDED.confiance,
			     preuve=EXCLUDED.preuve, verifie_at=now()
			 WHERE org_enrichissement.confiance < EXCLUDED.confiance`,
			[orgId, champ, valeur, source, confiance, JSON.stringify(preuve)],
		)
		return true
	} catch (err) {
		console.error(`  ! provenance ${champ} org ${orgId} : ${(err as Error).message}`)
		return false
	}
}

async function appliquer(
	domaines: PropositionDomaine[],
	sirens: PropositionSiren[],
	geos: PropositionGeo[],
): Promise<void> {
	console.log("\n=== ÉCRITURES (--appliquer) ===")
	let ecrits = 0
	for (const p of domaines) {
		try {
			const { rowCount } = await query(
				`UPDATE org SET domain=$2, website=$3 WHERE id=$1
				 AND (domain IS NULL OR btrim(domain)='') AND (website IS NULL OR btrim(website)='')`,
				[p.orgId, p.host, p.url],
			)
			if (rowCount) {
				ecrits += 1
				await tracer(p.orgId, "domaine", p.host, p.source, p.confiance, p.preuve)
			}
		} catch (err) {
			console.error(`  ! domaine org ${p.orgId} : ${(err as Error).message}`)
		}
	}
	for (const p of sirens) {
		try {
			const { rowCount } = await query(
				`UPDATE org SET siren=$2, entity_code=$2, entity_source='recherche-entreprises',
				     code_postal=COALESCE(code_postal, $3)
				 WHERE id=$1 AND (siren IS NULL OR btrim(siren)='')`,
				[p.orgId, p.siren, p.codePostal],
			)
			if (rowCount) {
				ecrits += 1
				await tracer(p.orgId, "siren", p.siren, "recherche-entreprises", p.confiance, p.preuve)
				if (p.codePostal) {
					await tracer(p.orgId, "code_postal", p.codePostal, "recherche-entreprises:siege", p.confiance, p.preuve)
				}
			}
		} catch (err) {
			console.error(`  ! siren org ${p.orgId} : ${(err as Error).message}`)
		}
	}
	for (const p of geos) {
		try {
			const { rowCount } = await query(
				`UPDATE org SET lat=$2, lon=$3, geo_source='code-postal',
				     code_postal=COALESCE(code_postal, $4)
				 WHERE id=$1 AND (lat IS NULL OR lon IS NULL)`,
				[p.orgId, p.lat, p.lon, p.codePostal],
			)
			if (rowCount) {
				ecrits += 1
				await tracer(p.orgId, "geo", `${p.lat},${p.lon}`, "geo.api.gouv.fr:code-postal", p.confiance, p.preuve)
				if (p.codePostal) {
					await tracer(
						p.orgId,
						"code_postal",
						p.codePostal,
						p.codePostalSource ?? "inconnu",
						p.confiance,
						p.preuve,
					)
				}
			}
		} catch (err) {
			console.error(`  ! geo org ${p.orgId} : ${(err as Error).message}`)
		}
	}
	console.log(`  ${nf.format(ecrits)} org(s) mise(s) à jour, chaque valeur tracée dans org_enrichissement.`)
}

async function main(): Promise<void> {
	const options = lireOptions(process.argv.slice(2))
	const schema = await query<{ colonne: string | null; table: string | null }>(
		`SELECT to_regclass('public.org_enrichissement')::text AS table,
		        (SELECT column_name FROM information_schema.columns
		         WHERE table_name='org' AND column_name='code_postal') AS colonne`,
	)
	if (!schema.rows[0]?.table || !schema.rows[0]?.colonne) {
		throw new Error("migration 049 absente : appliquer db/migrate-049-org-enrichissement.sql (pnpm migrate)")
	}

	const avant = await mesurer()
	afficherMesure("MESURE AVANT", avant, "réelle")
	console.log(`\n=== ENRICHISSEMENT (${options.appliquer ? "APPLIQUER" : "rapport seul"}) ===`)
	console.log(`  limite=${options.limit}/module, offset=${options.offset}, plafond=${options.maxAppels} appels`)
	console.log(`  modules : ${[...options.modules].join(", ")}`)

	const statDomaine = nouvelleStat()
	const statSiren = nouvelleStat()
	const statGeo = nouvelleStat()
	const domaines: PropositionDomaine[] = []
	const sirens: PropositionSiren[] = []
	const geos: PropositionGeo[] = []
	const budget = new BudgetAppels(options.maxAppels)
	const sirensConnus = new Set<string>()
	const domainsProposes = new Set<string>()

	if (options.modules.has("siren")) {
		const deja = await query<{ siren: string }>("SELECT siren FROM org WHERE siren IS NOT NULL")
		for (const row of deja.rows) sirensConnus.add(row.siren)
	}

	if (options.modules.has("domaine")) {
		const { rows } = await query<OrgRow>(
			`SELECT id, name, city, dept, kind, lat, lon, siren, code_postal, domain, website
			 FROM org WHERE (domain IS NULL OR btrim(domain)='')
			   AND (website IS NULL OR btrim(website)='')
			   AND (kind='collectivite' OR name ~* '^(commune|ville|mairie|municipalite)( |$)')
			 ORDER BY id LIMIT $1 OFFSET $2`,
			[options.limit, options.offset],
		)
		for (const org of rows) {
			statDomaine.examines += 1
			for (const proposition of await verifierDomaine(org, budget, statDomaine)) {
				if (domainsProposes.has(proposition.host)) {
					echec(statDomaine, "domain-deja-propose")
					continue
				}
				domainsProposes.add(proposition.host)
				domaines.push(proposition)
=======
 * Enrichissement du référentiel (1 673 151 organisations mesurées le 2026-11-21).
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/enrichir-referentiel.mts [options]
 *
 * Par défaut : MODE RAPPORT, aucune écriture. `--appliquer` est la seule porte
 * d'écriture : il trace chaque valeur retenue dans `org_enrichment` (source +
 * confiance) puis remplit les colonnes vides de `org`, sans jamais écraser une
 * valeur existante. Le rapport mesure le taux de couverture avant/après par
 * champ, projeté en mode rapport et remesuré en mode --appliquer.
 *
 * Sources :
 *   - domaine : nom de domaine candidat vérifié par un HTTP 200 final sur le
 *     même domaine (timeout, retries, refus des hôtes privés) ;
 *   - SIREN   : API recherche-entreprises.api.gouv.fr, repli sur le snapshot
 *     SIRENE versionné si l'API ne répond pas ou avec --offline ;
 *   - secteur : code NAF de la même fiche, ramené à un secteur éditorial ;
 *   - géo     : code postal résolu par le référentiel communal versionné.
 *
 * Options :
 *   --appliquer            écrit la provenance et les colonnes vides
 *   --rapport              explicite, identique au défaut
 *   --champ=domain,siren,secteur,geo   champs à traiter
 *   --seuil=0.70           confiance minimale [0,1]
 *   --limite=N             nombre max d'orgs examinées (0 = toutes)
 *   --dept=16,17           filtre département
 *   --offline              aucun appel HTTP/API ; désactive le domaine
 *   --source-siren=api|snapshot      source prioritaire (défaut api)
 *   --timeout-ms=5000      timeout par requête réseau
 *   --concurrence=4        organisations analysées en parallèle
 *   --reessais=2           reprises sur 429/5xx
 *   --json=chemin          écrit aussi le rapport JSON (opt-in explicite)
 *   --help                 affiche cette aide
 */

import { readFile, writeFile } from "node:fs/promises";
import { closePools } from "../apps/api/src/db.js";
import {
	analyserOrganisation,
	CHAMPS,
	indexerCommunes,
	indexerEntreprises,
	LIBELLE_CHAMP,
	type Champ,
	type Commune,
	type ContexteEnrichissement,
	type EntrepriseSnapshot,
	type FetchLike,
	type Proposition,
	type ReponseLike,
} from "../apps/api/src/referentiel/enrichissement.js";
import {
	appliquerLot,
	lireOrganisations,
	mesurerCouverture,
} from "../apps/api/src/referentiel/enrichissement-db.js";

const API_BASE = "https://recherche-entreprises.api.gouv.fr/search";
const REFERENTIEL_JSON = new URL("../db/data/referentiel-na.json", import.meta.url);
const ENTREPRISES_JSON = new URL("../db/data/entreprises-na.json", import.meta.url);
const Pagination = 500;

interface Options {
	appliquer: boolean;
	champs: Champ[];
	seuil: number;
	limite: number;
	depts: string[];
	offline: boolean;
	modeSiren: "api" | "snapshot";
	timeoutMs: number;
	concurrence: number;
	reessais: number;
	jsonPath: string | null;
}

function texteErreur(e: unknown): string {
	const s = e instanceof Error ? e.message : String(e);
	return s.replace(/\s+/g, " ").slice(0, 200);
}

function usage(code: number): never {
	console.error(
		"usage : apps/api/node_modules/.bin/tsx scripts/enrichir-referentiel.mts " +
			"[--appliquer|--rapport] [--champ=domain,siren,secteur,geo] [--seuil=0.70] " +
			"[--limite=N] [--dept=16,17] [--offline] [--source-siren=api|snapshot] " +
			"[--timeout-ms=5000] [--concurrence=4] [--reessais=2] [--json=chemin]",
	);
	process.exit(code);
}

function valeurArg(args: string[], nom: string): string | null {
	const prefix = `--${nom}=`;
	const trouve = args.find((a) => a.startsWith(prefix));
	return trouve ? trouve.slice(prefix.length) : null;
}

function nombreArg(args: string[], nom: string, defaut: number): number {
	const brut = valeurArg(args, nom);
	if (brut === null) return defaut;
	const n = Number(brut);
	if (!Number.isFinite(n)) throw new Error(`--${nom} doit être un nombre : « ${brut} »`);
	return n;
}

function entierArg(args: string[], nom: string, defaut: number, min: number): number {
	const n = nombreArg(args, nom, defaut);
	if (!Number.isInteger(n) || n < min) throw new Error(`--${nom} doit être un entier >= ${min} : « ${n} »`);
	return n;
}

function analyserArgs(args: string[]): Options {
	if (args.includes("--help") || args.includes("-h")) usage(0);
	const connus = new Set(["--appliquer", "--rapport", "--offline"]);
	const avecValeur = ["champ", "seuil", "limite", "dept", "source-siren", "timeout-ms", "concurrence", "reessais", "json"];
	for (const arg of args) {
		if (connus.has(arg)) continue;
		if (avecValeur.some((n) => arg.startsWith(`--${n}=`))) continue;
		throw new Error(`argument inconnu : ${arg}`);
	}
	if (args.includes("--appliquer") && args.includes("--rapport")) {
		throw new Error("--appliquer et --rapport sont exclusifs");
	}

	const brutChamps = valeurArg(args, "champ");
	const alias: Record<string, Champ> = { domaine: "domain", siren: "siren", secteur: "secteur", geo: "geo", geolocalisation: "geo" };
	const champs = brutChamps === null
		? [...CHAMPS]
		: [...new Set(brutChamps.split(",").map((s) => alias[s.trim().toLowerCase()] ?? s.trim().toLowerCase() as Champ))];
	for (const champ of champs) {
		if (!CHAMPS.includes(champ as (typeof CHAMPS)[number])) throw new Error(`champ inconnu : ${champ}`);
	}
	if (champs.length === 0) throw new Error("au moins un --champ est requis");

	const seuil = nombreArg(args, "seuil", 0.7);
	if (seuil <= 0 || seuil > 1) throw new Error("--seuil doit être dans ]0, 1]");

	const modeSiren = valeurArg(args, "source-siren") ?? "api";
	if (modeSiren !== "api" && modeSiren !== "snapshot") throw new Error("--source-siren vaut api ou snapshot");

	const brutDeparts = valeurArg(args, "dept");
	const depts = brutDeparts === null ? [] : brutDeparts.split(",").map((d) => d.trim()).filter(Boolean);
	for (const d of depts) {
		if (!/^(\d{2}|2[ABab])$/.test(d)) throw new Error(`département invalide : ${d}`);
	}

	return {
		appliquer: args.includes("--appliquer"),
		champs: champs as Champ[],
		seuil,
		limite: entierArg(args, "limite", 0, 0),
		depts,
		offline: args.includes("--offline"),
		modeSiren: args.includes("--offline") ? "snapshot" : modeSiren as "api" | "snapshot",
		timeoutMs: entierArg(args, "timeout-ms", 5000, 100),
		concurrence: entierArg(args, "concurrence", 4, 1),
		reessais: entierArg(args, "reessais", 2, 0),
		jsonPath: valeurArg(args, "json"),
	};
}

interface Chargement<T> {
	liste: T[];
	erreur: string | null;
}

async function chargerJson<T>(url: URL, cle: string): Promise<Chargement<T>> {
	try {
		const brut = await readFile(url, "utf8");
		const parsed = JSON.parse(brut) as Record<string, unknown>;
		const liste = parsed[cle];
		if (!Array.isArray(liste)) return { liste: [], erreur: `clé « ${cle} » absente ou non-tableau` };
		return { liste: liste as T[], erreur: null };
	} catch (e) {
		return { liste: [], erreur: texteErreur(e) };
	}
}

function texte(valeur: unknown): string | null {
	return typeof valeur === "string" && valeur.trim() ? valeur.trim() : null;
}

function nombre(valeur: unknown): number | null {
	return typeof valeur === "number" && Number.isFinite(valeur) ? valeur : null;
}

function commeCommunes(brut: Record<string, unknown>[]): Commune[] {
	return brut
		.map((c) => ({
			code: texte(c.code) ?? "",
			nom: texte(c.nom) ?? "",
			departement: texte(c.departement) ?? "",
			codesPostaux: Array.isArray(c.codesPostaux) ? c.codesPostaux.map((cp) => texte(cp) ?? "").filter(Boolean) : [],
			lat: nombre(c.lat),
			lon: nombre(c.lon),
			population: nombre(c.population),
		}))
		.filter((c) => c.code && c.nom);
}

function commeEntreprises(brut: Record<string, unknown>[]): EntrepriseSnapshot[] {
	return brut
		.map((e) => {
			const siege = (e.siege && typeof e.siege === "object" ? e.siege : {}) as Record<string, unknown>;
			const alternatifs = Array.isArray(e.nomsAlternatifs)
				? e.nomsAlternatifs.map((a) => texte(a)).filter((a): a is string => a !== null)
				: texte(e.nomsAlternatifs);
			return {
				siren: texte(e.siren) ?? "",
				nom: texte(e.nom) ?? "",
				sigle: texte(e.sigle),
				nomsAlternatifs: alternatifs,
				naf: texte(e.naf),
				etat: texte(e.etat),
				siege: {
					codePostal: texte(siege.codePostal),
					commune: texte(siege.commune),
					departement: texte(siege.departement),
					codeCommune: texte(siege.codeCommune),
					lat: nombre(siege.lat),
					lon: nombre(siege.lon),
				},
			};
		})
		.filter((e) => /^\d{9}$/.test(e.siren) && e.nom);
}

/** Un fetch unique, avec timeout et mémoire des réponses identiques. */
function creerFetch(options: Options): FetchLike {
	const brut: FetchLike = async (url, init) => {
		const controle = new AbortController();
		const minuteur = setTimeout(() => controle.abort(), options.timeoutMs);
		try {
			return await fetch(url, { ...init, signal: controle.signal }) as ReponseLike;
		} finally {
			clearTimeout(minuteur);
		}
	};
	const memo = new Map<string, Promise<ReponseLike>>();
	return (url, init) => {
		const enCours = memo.get(url);
		if (enCours) return enCours;
		const promesse = brut(url, init);
		memo.set(url, promesse);
		return promesse;
	};
}

async function sonderApi(fetch: FetchLike, options: Options): Promise<{ ok: boolean; motif: string | null }> {
	if (options.offline || options.modeSiren !== "api") return { ok: false, motif: "desactivee" };
	const url = `${API_BASE}?q=diagnostic&per_page=1`;
	const controle = new AbortController();
	const minuteur = setTimeout(() => controle.abort(), options.timeoutMs);
	try {
		const reponse = await fetch(url, { signal: controle.signal });
		return reponse.status === 200
			? { ok: true, motif: null }
			: { ok: false, motif: `http-${reponse.status}` };
	} catch (e) {
		return { ok: false, motif: texteErreur(e) };
	} finally {
		clearTimeout(minuteur);
	}
}

function formatTaux(taux: number): string {
	return `${(taux * 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

function formatNombre(n: number): string {
	return n.toLocaleString("fr-FR");
}

async function main(): Promise<void> {
	const options = analyserArgs(process.argv.slice(2).filter((arg) => arg !== "--"));
	const fetchReseau = creerFetch(options);
	const [brutCommunes, brutEntreprises] = await Promise.all([
		chargerJson<Record<string, unknown>>(REFERENTIEL_JSON, "communes"),
		chargerJson<Record<string, unknown>>(ENTREPRISES_JSON, "entreprises"),
	]);
	const communes = commeCommunes(brutCommunes.liste);
	const entreprises = commeEntreprises(brutEntreprises.liste);
	const indexEntreprises = indexerEntreprises(entreprises);
	const indexCommunes = indexerCommunes(communes);

	const sondage = await sonderApi(fetchReseau, options);
	const modeSiren: "api" | "snapshot" = sondage.ok ? "api" : "snapshot";
	const ctx: ContexteEnrichissement = {
		champs: new Set(options.champs),
		seuil: options.seuil,
		modeSiren,
		verifierHttp: !options.offline,
		apiBase: API_BASE,
		timeoutMs: options.timeoutMs,
		retries: options.reessais,
		fetchHttp: options.offline ? undefined : fetchReseau,
		fetchApi: options.offline ? undefined : fetchReseau,
		entreprisesParNom: indexEntreprises.parNom,
		entreprisesParSiren: indexEntreprises.parSiren,
		communesParCp: indexCommunes.parCp,
		communesParNom: indexCommunes.parNom,
	};

	console.log(`[enrichissement] ${options.appliquer ? "APPLICATION (écritures)" : "RAPPORT (aucune écriture)"}`);
	console.log(
		`[enrichissement] champs : ${options.champs.join(", ")} | seuil ${options.seuil} | ` +
			`limite ${options.limite === 0 ? "aucune" : options.limite} | ${options.offline ? "hors ligne" : "réseau actif"}`,
	);
	if (brutCommunes.erreur) console.log(`[enrichissement] communes indisponibles : ${brutCommunes.erreur}`);
	if (brutEntreprises.erreur) console.log(`[enrichissement] entreprises indisponibles : ${brutEntreprises.erreur}`);
	if (!sondage.ok && !options.offline && options.modeSiren === "api") {
		console.log(`[enrichissement] API SIREN indisponible (${sondage.motif}) — repli sur le snapshot local`);
	}

	const avant = await mesurerCouverture();
	const propositions: Proposition[] = [];
	const rejets = new Map<string, number>();
	const erreurs: string[] = [];
	let examines = 0;
	let apresId = 0;
	let tentativesHttp = 0;
	let appelsApi = 0;

	while (true) {
		const restant = options.limite === 0 ? Pagination : Math.min(Pagination, options.limite - examines);
		if (restant <= 0) break;
		const orgs = await lireOrganisations({
			champs: ctx.champs,
			apresId,
			limite: restant,
			depts: options.depts.length ? options.depts : undefined,
		});
		if (orgs.length === 0) break;
		for (let i = 0; i < orgs.length; i += options.concurrence) {
			const lots = await Promise.all(orgs.slice(i, i + options.concurrence).map((org) => analyserOrganisation(org, ctx)));
			for (const lot of lots) {
				propositions.push(...lot.propositions);
				tentativesHttp += lot.tentativesHttp;
				appelsApi += lot.appelsApi;
				for (const r of lot.rejets) rejets.set(r.motif, (rejets.get(r.motif) ?? 0) + 1);
			}
		}
		examines += orgs.length;
		apresId = orgs[orgs.length - 1]!.id;
	}

	const application = { valeursTracees: 0, colonnesMisesAJour: 0, lots: 0, echecs: 0 };
	if (options.appliquer && propositions.length > 0) {
		for (let i = 0; i < propositions.length; i += Pagination) {
			try {
				const lot = await appliquerLot(propositions.slice(i, i + Pagination));
				application.valeursTracees += lot.valeursTracees;
				application.colonnesMisesAJour += lot.colonnesMisesAJour;
				application.lots++;
			} catch (e) {
				application.echecs++;
				erreurs.push(`lot ${i / Pagination + 1}: ${texteErreur(e)}`);
>>>>>>> 72389f2 (feat(referentiel): enrichissement tracé du domaine, SIREN, secteur et géo)
			}
		}
	}

<<<<<<< HEAD
	const organiquesSiren = new Map<number, OrgRow>()
	if (options.modules.has("siren")) {
		const { rows } = await query<OrgRow>(
			`SELECT id, name, city, dept, kind, lat, lon, siren, code_postal, domain, website
			 FROM org WHERE siren IS NULL
			 ORDER BY (lat IS NOT NULL AND lon IS NOT NULL) ASC, id LIMIT $1 OFFSET $2`,
			[options.limit, options.offset],
		)
		for (const org of rows) {
			organiquesSiren.set(org.id, org)
			statSiren.examines += 1
			const proposition = await proposerSiren(org, budget, statSiren, sirensConnus)
			if (proposition) sirens.push(proposition)
		}
	}

	if (options.modules.has("geo")) {
		const { rows: rowsCp } = await query<OrgRow>(
			`SELECT id, name, city, dept, kind, lat, lon, siren, code_postal, domain, website
			 FROM org WHERE code_postal IS NOT NULL AND btrim(code_postal) <> ''
			   AND (lat IS NULL OR lon IS NULL)
			 ORDER BY id LIMIT $1 OFFSET $2`,
			[options.limit, options.offset],
		)
		// Une grande partie des orgs sans coordonnées a un SIREN mais aucun
		// code postal en base : on interroge l'API publique pour l'obtenir.
		const { rows: rowsSiren } = await query<OrgRow>(
			`SELECT id, name, city, dept, kind, lat, lon, siren, code_postal, domain, website
			 FROM org WHERE (lat IS NULL OR lon IS NULL)
			   AND (code_postal IS NULL OR btrim(code_postal) = '')
			   AND siren IS NOT NULL
			 ORDER BY id LIMIT $1 OFFSET $2`,
			[options.limit, options.offset],
		)
		const files: OrgRow[] = [...rowsCp, ...rowsSiren]
		const cpParOrg = new Map(sirens.filter((p) => p.codePostal).map((p) => [p.orgId, p.codePostal!]))
		const dejaFiles = new Set(files.map((org) => org.id))
		for (const [orgId, codePostal] of cpParOrg) {
			if (dejaFiles.has(orgId)) continue
			const org = organiquesSiren.get(orgId)
			if (!org || (org.lat !== null && org.lon !== null)) continue
			dejaFiles.add(orgId)
			files.push({ ...org, code_postal: codePostal })
		}
		for (const org of files.slice(0, options.limit)) {
			statGeo.examines += 1
			const cp = await resoudreCodePostal(org, cpParOrg.get(org.id) ?? null, budget, statGeo)
			if (!cp) continue
			const proposition = await proposerGeo(org, cp.codePostal, cp.source, budget, statGeo)
			if (proposition) geos.push(proposition)
		}
	}

	console.log("\n=== BILAN PAR MODULE ===")
	afficherStat("domaine", statDomaine)
	afficherStat("siren", statSiren)
	afficherStat("geo", statGeo)
	console.log(`  appels réseau : ${budget.appels}/${options.maxAppels}`)

	if (options.appliquer) {
		await appliquer(domaines, sirens, geos)
	}
	const apres = await mesurer()
	if (!options.appliquer) {
		const idsDomaine = new Set(domaines.map((p) => p.orgId))
		apres.domaine += idsDomaine.size
		apres.website += idsDomaine.size
		apres.siren += sirens.length
		apres.geo += geos.length
		const cps = new Set(
			[...sirens.map((p) => p.codePostal), ...geos.map((p) => p.codePostal)].filter(
				(cp): cp is string => Boolean(cp),
			),
		)
		apres.codePostal += cps.size
		apres.provenance.code_postal = (apres.provenance.code_postal ?? 0) + cps.size
		apres.provenance.domaine = (apres.provenance.domaine ?? 0) + idsDomaine.size
		apres.provenance.siren = (apres.provenance.siren ?? 0) + sirens.length
		apres.provenance.geo = (apres.provenance.geo ?? 0) + geos.length
	}
	afficherMesure("MESURE APRÈS", apres, options.appliquer ? "réelle (recompte SQL)" : "projetée (rapport seul)")

	console.log("\n=== DELTAS PAR CHAMP ===")
	afficherDelta("domaine", avant.domaine, apres.domaine)
	afficherDelta("siren", avant.siren, apres.siren)
	afficherDelta("lat/lon", avant.geo, apres.geo)
	const totalEchecs = statDomaine.echecs + statSiren.echecs + statGeo.echecs
	const totalTentatives = totalEchecs + statDomaine.reussites + statSiren.reussites + statGeo.reussites
	console.log(
		`\ntaux d'erreur global sur l'échantillon (${nf.format(totalTentatives)} tentatives, ` +
			`${nf.format(options.limit)} orgs/module) : ` +
			`${totalTentatives ? ((100 * totalEchecs) / totalTentatives).toFixed(1) : "0.0"}%`,
	)
}

try {
	await main()
} finally {
	await closePools()
=======
	const apres = options.appliquer && application.echecs === 0 ? await mesurerCouverture() : null;
	const parChamp = Object.fromEntries(options.champs.map((champ) => {
		const avantChamp = avant.avant[champ];
		const nombreAvant = avantChamp.remplis;
		const tauxAvant = avant.total > 0 ? nombreAvant / avant.total : 0;
		const retenues = propositions.filter((p) => p.champ === champ);
		const nombreApres = apres ? apres.avant[champ].remplis : nombreAvant + retenues.length;
		return [champ, {
			avant: nombreAvant,
			tauxAvant: Math.round(tauxAvant * 1_000_000) / 1_000_000,
			apres: nombreApres,
			tauxApres: avant.total > 0 ? Math.round((nombreApres / avant.total) * 1_000_000) / 1_000_000 : 0,
			gain: nombreApres - nombreAvant,
			propositions: retenues.length,
			tracesAvant: avantChamp.traces,
			tracesApres: apres ? apres.avant[champ].traces : avantChamp.traces + retenues.length,
		}];
	}));

	const confiances = propositions.map((p) => p.confiance);
	const rapport = {
		genereLe: new Date().toISOString(),
		mode: options.appliquer ? "application" : "rapport (aucune écriture)",
		parametres: {
			champs: options.champs,
			seuil: options.seuil,
			limite: options.limite,
			depts: options.depts,
			offline: options.offline,
			concurrence: options.concurrence,
		},
		totalOrganisations: avant.total,
		organisationsExaminees: examines,
		sources: {
			api: {
				mode: modeSiren,
				diagnostic: sondage.ok ? "ok" : sondage.motif,
				appels: appelsApi,
			},
			http: {
				verifications: tentativesHttp,
				retenues: propositions.filter((p) => p.champ === "domain").length,
				note: options.offline ? "vérification HTTP désactivée (--offline)" : "HTTP 200 final sur le même domaine",
			},
			snapshots: {
				entreprises: entreprises.length,
				entreprisesIndice: indexEntreprises.parNom.size,
				entreprisesErreur: brutEntreprises.erreur,
				communes: communes.length,
				codesPostaux: indexCommunes.parCp.size,
				communesErreur: brutCommunes.erreur,
			},
		},
		couverture: parChamp,
		propositions: {
			total: propositions.length,
			parChamp: Object.fromEntries(options.champs.map((c) => [c, propositions.filter((p) => p.champ === c).length])),
			parSource: Object.fromEntries(
				[...new Set(propositions.map((p) => p.source))]
					.map((s): [string, number] => [s, propositions.filter((p) => p.source === s).length])
					.sort((a, b) => b[1] - a[1]),
			),
			confiance: {
				min: confiances.length ? Math.min(...confiances) : null,
				max: confiances.length ? Math.max(...confiances) : null,
				moyenne: confiances.length ? Math.round((confiances.reduce((a, b) => a + b, 0) / confiances.length) * 1000) / 1000 : null,
			},
		},
		rejets: {
			total: [...rejets.values()].reduce((a, b) => a + b, 0),
			parMotif: Object.fromEntries([...rejets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)),
		},
		application,
		erreurs: erreurs.slice(0, 20),
		echantillon: propositions.slice(0, 10),
	};

	console.log(`[enrichissement] ${formatNombre(avant.total)} organisations, ${formatNombre(examines)} examinées`);
	for (const champ of options.champs) {
		const c = parChamp[champ]!;
		console.log(
			`[enrichissement] ${LIBELLE_CHAMP[champ].padEnd(17)} : ${formatNombre(c.avant)} (${formatTaux(c.tauxAvant)}) ` +
				`→ ${formatNombre(c.apres)} (${formatTaux(c.tauxApres)})  ${c.gain >= 0 ? "+" : ""}${formatNombre(c.gain)}`,
		);
	}
	console.log(
		`[enrichissement] propositions : ${rapport.propositions.total} ` +
			`(${Object.entries(rapport.propositions.parChamp).map(([k, v]) => `${k}=${v}`).join(", ") || "aucune"})`,
	);
	console.log(
		`[enrichissement] vérifications HTTP : ${rapport.sources.http.verifications}, appels API SIREN : ${appelsApi}, ` +
			`rejets : ${rapport.rejets.total}`,
	);
	if (options.appliquer) {
		console.log(
			`[enrichissement] application : ${application.valeursTracees} valeur(s) tracée(s), ` +
				`${application.colonnesMisesAJour} colonne(s) remplie(s), ${application.echecs} lot(s) en échec`,
		);
	}
	if (examines === 0) console.log("[enrichissement] état vide : aucune organisation à examiner sur ces champs.");
	if (propositions.length === 0) console.log("[enrichissement] état vide : aucune proposition retenue.");
	if (options.offline && ctx.champs.has("domain")) console.log("[enrichissement] domaines sans proposition : HTTP désactivé par --offline.");
	if (entreprises.length === 0 && (ctx.champs.has("siren") || ctx.champs.has("secteur"))) console.log("[enrichissement] état vide : aucun snapshot entreprise, SIREN/secteur non enrichis.");
	if (communes.length === 0 && ctx.champs.has("geo")) console.log("[enrichissement] état vide : aucun snapshot communal, géo non enrichie.");
	for (const e of erreurs) console.error(`[enrichissement] erreur : ${e}`);
	for (const p of rapport.echantillon) {
		console.log(
			`  ${String(p.orgId).padStart(8)}  ${p.confiance.toFixed(3)}  ${p.champ.padEnd(7)} ` +
				`${JSON.stringify(p.valeur)}  ← ${p.source}`,
		);
	}
	if (options.jsonPath) {
		await writeFile(options.jsonPath, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");
		console.log(`[enrichissement] rapport JSON écrit : ${options.jsonPath}`);
	}
	console.log(JSON.stringify(rapport));
}

try {
	await main();
} catch (e) {
	console.error(`[enrichissement] erreur fatale : ${texteErreur(e)}`);
	process.exitCode = 1;
} finally {
	await closePools();
>>>>>>> 72389f2 (feat(referentiel): enrichissement tracé du domaine, SIREN, secteur et géo)
}
