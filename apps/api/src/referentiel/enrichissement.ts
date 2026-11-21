/**
 * Enrichissement du référentiel — règles pures, sans base ni réseau imposé.
 *
 * Chaque valeur proposée porte une source et un score de confiance dans [0,1].
 * Les quatre sources sont :
 *   - `domain`   : site officiel vérifié par un HTTP 200 final sur le même domaine ;
 *   - `siren`    : API recherche-entreprises (DINUM/Etalab) ou snapshot SIRENE local ;
 *   - `secteur`  : code NAF issu de la même fiche entreprise ;
 *   - `geo`      : code postal résolu par le référentiel communal versionné.
 *
 * Aucune fonction de ce module n'écrit. Le réseau est injecté (`fetchHttp`,
 * `fetchApi`) : les tests tournent hors ligne avec des réponses fabriquées, le
 * CLI branche `fetch` et un timeout. Les organisations déjà renseignées sur un
 * champ ne reçoivent jamais de proposition pour ce champ.
 */

import { domaineRacine, normalizeDomainValue } from "../match/domaine.js";

export const CHAMPS = ["domain", "siren", "secteur", "geo"] as const;
export type Champ = (typeof CHAMPS)[number];

export const LIBELLE_CHAMP: Record<Champ, string> = {
	domain: "domaine web",
	siren: "SIREN",
	secteur: "secteur",
	geo: "géolocalisation",
};

/** Ligne minimale lue de `org` ; les colonnes absentes sont nullable. */
export interface OrgEnrichissable {
	id: number;
	name: string;
	name_norm: string | null;
	domain: string | null;
	website: string | null;
	siren: string | null;
	naf: string | null;
	sector: string | null;
	city: string | null;
	dept: string | null;
	lat: number | null;
	lon: number | null;
}

export type Valeur = Record<string, string | number | boolean | null>;

export interface Proposition {
	orgId: number;
	champ: Champ;
	valeur: Valeur;
	source: string;
	confiance: number;
	details: Valeur;
}

export interface Rejet {
	orgId: number;
	champ: Champ;
	motif: string;
}

/** Surface minimale d'une réponse HTTP, compatible avec `Response` de Node. */
export interface ReponseLike {
	readonly status: number;
	readonly url: string;
	json(): Promise<unknown>;
	readonly body?: { cancel(): Promise<unknown> | void } | null;
}

export interface RequeteLike {
	headers?: Record<string, string>;
	signal?: AbortSignal;
	redirect?: "follow" | "manual" | "error";
}

export type FetchLike = (url: string, init?: RequeteLike) => Promise<ReponseLike>;

export interface SiegeSnapshot {
	codePostal?: string | null;
	commune?: string | null;
	departement?: string | null;
	codeCommune?: string | null;
	lat?: number | null;
	lon?: number | null;
}

export interface EntrepriseSnapshot {
	siren: string;
	nom: string;
	sigle?: string | null;
	nomsAlternatifs?: string[] | string | null;
	naf?: string | null;
	nafLibelle?: string | null;
	etat?: string | null;
	siege?: SiegeSnapshot | null;
}

export interface EntrepriseCandidate extends EntrepriseSnapshot {
	origine: "api" | "snapshot";
	alias: boolean;
}

export interface Commune {
	code: string;
	nom: string;
	departement: string;
	codesPostaux: string[];
	lat: number | null;
	lon: number | null;
	population?: number | null;
}

export interface ContexteEnrichissement {
	champs: ReadonlySet<Champ>;
	seuil: number;
	/** `api` interroge recherche-entreprises ; `snapshot` utilise le JSON versionné. */
	modeSiren: "api" | "snapshot";
	verifierHttp: boolean;
	apiBase: string;
	timeoutMs: number;
	retries: number;
	fetchHttp?: FetchLike;
	fetchApi?: FetchLike;
	sleep?: (ms: number) => Promise<void>;
	entreprisesParNom: ReadonlyMap<string, EntrepriseCandidate[]>;
	entreprisesParSiren: ReadonlyMap<string, EntrepriseCandidate>;
	communesParCp: ReadonlyMap<string, Commune[]>;
	communesParNom: ReadonlyMap<string, Commune[]>;
}

export interface ResultatAnalyse {
	propositions: Proposition[];
	rejets: Rejet[];
	tentativesHttp: number;
	appelsApi: number;
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                        */
/* ------------------------------------------------------------------ */

export function nomNormalise(valeur: string | null | undefined): string {
	return (valeur ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function codePostalValide(valeur: string | null | undefined): string | null {
	const s = (valeur ?? "").trim();
	return /^\d{5}$/.test(s) ? s : null;
}

/** Accepte `6202A` (API) et `62.02A` (base). */
export function normaliserNaf(valeur: string | null | undefined): string | null {
	const s = (valeur ?? "").trim().toUpperCase().replace(/[\s.]/g, "");
	if (!/^\d{4}[A-Z]$/.test(s)) return null;
	return `${s.slice(0, 2)}.${s.slice(2, 4)}${s.slice(4)}`;
}

function confiance(valeur: number): number {
	return Math.round(Math.max(0, Math.min(1, valeur)) * 1000) / 1000;
}

function texteErreur(e: unknown): string {
	const s = e instanceof Error ? e.message : String(e);
	return s.replace(/\s+/g, " ").slice(0, 120);
}

function estVide(valeur: string | null | undefined): boolean {
	return valeur == null || valeur.trim() === "";
}

/* ------------------------------------------------------------------ */
/* Index des jeux de données versionnés                                 */
/* ------------------------------------------------------------------ */

/** Fournisseurs de messagerie / réseaux sociaux : racine jamais officielle. */
const FOURNISSEURS: Record<string, true> = {
	gmail: true, googlemail: true, yahoo: true, hotmail: true, outlook: true,
	live: true, aol: true, icloud: true, orange: true, free: true, laposte: true,
	wanadoo: true, sfr: true, numericable: true, bouygues: true, protonmail: true,
	proton: true, gmx: true, yandex: true, zoho: true, webmail: true, facebook: true,
	instagram: true, linkedin: true, twitter: true, tiktok: true, youtube: true,
	wixsite: true, wordpress: true, blogspot: true, weebly: true, squarespace: true,
	shopify: true, amazon: true,
};

const SUFFIXES: Record<string, true> = {
	fr: true, com: true, org: true, net: true, eu: true, io: true, ai: true,
	me: true, uk: true, be: true, ch: true, de: true, es: true, it: true,
	nl: true, ie: true, info: true, biz: true, co: true, us: true, ca: true,
	br: true, edu: true, gov: true, int: true, app: true, dev: true,
	"gouv.fr": true, "asso.fr": true, "ac.fr": true, "edu.fr": true,
	"co.uk": true, "org.uk": true, "com.br": true, "com.au": true,
	"co.jp": true, "co.nz": true, "com.tr": true,
};

function suffixeAdmissible(domaine: string): boolean {
	const parties = domaine.split(".");
	if (parties.length < 2) return false;
	return Boolean(SUFFIXES[parties.slice(-1)[0] ?? ""] || SUFFIXES[parties.slice(-2).join(".")]);
}

/** Filtre qui écarte IP, localhost et fournisseurs : un site officiel est distinctif. */
export function racineAdmissible(domaine: string | null | undefined): boolean {
	if (!domaine) return false;
	const d = normalizeDomainValue(domaine);
	if (!d || !suffixeAdmissible(d)) return false;
	const racine = d.split(".")[0] ?? "";
	if (!racine || racine.length < 4 || FOURNISSEURS[racine]) return false;
	if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(d)) return false;
	if (/(^|\.)(localhost|local|internal|test|invalid|example)$/.test(d)) return false;
	return true;
}

/** Refus explicite des cibles non publiques avant tout appel HTTP (SSRF). */
export function hotePublic(domaine: string): boolean {
	const h = domaine.toLowerCase().replace(/\.$/, "");
	if (h === "localhost" || h.endsWith(".localhost")) return false;
	if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(h)) {
		const [a, b] = h.split(".").map(Number);
		if (a === 10 || a === 127 || a === 0 || (a === 172 && b! >= 16 && b! <= 31) ||
			(a === 192 && b === 168) || (a === 169 && b === 254)) return false;
		return true;
	}
	return !/(^|\.)(local|internal|test|invalid|example)$/.test(h);
}

export interface IndexEntreprises {
	parNom: Map<string, EntrepriseCandidate[]>;
	parSiren: Map<string, EntrepriseCandidate>;
}

function ajouterParNom(index: Map<string, EntrepriseCandidate[]>, cle: string, valeur: EntrepriseCandidate): void {
	const norm = nomNormalise(cle);
	if (!norm) return;
	const liste = index.get(norm) ?? [];
	if (!liste.some((e) => e.siren === valeur.siren && e.alias === valeur.alias)) liste.push(valeur);
	index.set(norm, liste);
}

export function indexerEntreprises(liste: readonly EntrepriseSnapshot[]): IndexEntreprises {
	const parNom = new Map<string, EntrepriseCandidate[]>();
	const parSiren = new Map<string, EntrepriseCandidate>();
	for (const e of liste) {
		if (!/^\d{9}$/.test(e.siren)) continue;
		const principal: EntrepriseCandidate = { ...e, origine: "snapshot", alias: false };
		parSiren.set(e.siren, principal);
		ajouterParNom(parNom, e.nom, principal);
		if (e.sigle) ajouterParNom(parNom, e.sigle, { ...principal, alias: true });
		const alt = Array.isArray(e.nomsAlternatifs) ? e.nomsAlternatifs : e.nomsAlternatifs ? [e.nomsAlternatifs] : [];
		for (const a of alt) ajouterParNom(parNom, a, { ...principal, alias: true });
	}
	return { parNom, parSiren };
}

export interface IndexCommunes {
	parCp: Map<string, Commune[]>;
	parNom: Map<string, Commune[]>;
}

export function indexerCommunes(liste: readonly Commune[]): IndexCommunes {
	const parCp = new Map<string, Commune[]>();
	const parNom = new Map<string, Commune[]>();
	for (const c of liste) {
		for (const cp of c.codesPostaux ?? []) {
			const code = codePostalValide(cp);
			if (!code) continue;
			const communes = parCp.get(code) ?? [];
			if (!communes.some((x) => x.code === c.code)) communes.push(c);
			parCp.set(code, communes);
		}
		const nom = nomNormalise(c.nom);
		if (nom) {
			const communes = parNom.get(nom) ?? [];
			if (!communes.some((x) => x.code === c.code)) communes.push(c);
			parNom.set(nom, communes);
		}
	}
	return { parCp, parNom };
}

/** Convertit la réponse de recherche-entreprises en candidats exploitables. */
export function entreprisesDepuisApi(json: unknown): EntrepriseCandidate[] {
	const results = (json as { results?: unknown } | null)?.results;
	if (!Array.isArray(results)) return [];
	const sorties: EntrepriseCandidate[] = [];
	for (const brut of results) {
		if (!brut || typeof brut !== "object") continue;
		const r = brut as Record<string, unknown>;
		const siren = typeof r.siren === "string" ? r.siren.trim() : "";
		if (!/^\d{9}$/.test(siren)) continue;
		const siege = (r.siege && typeof r.siege === "object" ? r.siege : {}) as Record<string, unknown>;
		const texte = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
		const nombre = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
		const base: EntrepriseCandidate = {
			siren,
			nom: texte(r.nom_complet) ?? texte(r.nom_raison_sociale) ?? "",
			sigle: texte(r.nom_sigle),
			naf: texte(siege.activite_principale) ?? texte(r.activite_principale),
			nafLibelle: texte(siege.libelle_activite_principale),
			etat: texte(r.etat_administratif),
			siege: {
				codePostal: texte(siege.code_postal),
				commune: texte(siege.libelle_commune) ?? texte(siege.commune),
				departement: texte(siege.departement),
				codeCommune: texte(siege.code_commune),
				lat: nombre(siege.latitude),
				lon: nombre(siege.longitude),
			},
			origine: "api",
			alias: false,
		};
		if (!base.nom) continue;
		sorties.push(base);
		const raison = texte(r.nom_raison_sociale);
		if (raison && nomNormalise(raison) !== nomNormalise(base.nom)) {
			sorties.push({ ...base, nom: raison, alias: true });
		}
	}
	return sorties;
}

/* ------------------------------------------------------------------ */
/* Réseau : retry, timeout injecté, HTTP 200                            */
/* ------------------------------------------------------------------ */

const DORMIR = (ms: number): Promise<void> => {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
};

export type ResultatJson =
	| { ok: true; donnees: unknown }
	| { ok: false; statut: number | null; motif: string };

export async function lireJson(
	fetch: FetchLike,
	url: string,
	retries = 0,
	sleep: (ms: number) => Promise<void> = DORMIR,
): Promise<ResultatJson> {
	for (let tentative = 0; ; tentative++) {
		let reponse: ReponseLike;
		try {
			reponse = await fetch(url);
		} catch (e) {
			return { ok: false, statut: null, motif: `fetch: ${texteErreur(e)}` };
		}
		if (reponse.status === 429 || reponse.status >= 500) {
			if (tentative < retries) {
				await sleep(200 * 2 ** tentative);
				continue;
			}
			return { ok: false, statut: reponse.status, motif: `http-${reponse.status}` };
		}
		if (reponse.status !== 200) return { ok: false, statut: reponse.status, motif: `http-${reponse.status}` };
		try {
			return { ok: true, donnees: await reponse.json() };
		} catch (e) {
			return { ok: false, statut: 200, motif: `json-invalide: ${texteErreur(e)}` };
		}
	}
}

export async function chercherApi(
	nom: string,
	ctx: ContexteEnrichissement,
): Promise<{ ok: true; entreprises: EntrepriseCandidate[] } | { ok: false; motif: string }> {
	if (!ctx.fetchApi) return { ok: false, motif: "api-desactivee" };
	const url = `${ctx.apiBase}?q=${encodeURIComponent(nom)}&per_page=5&page=1`;
	const reponse = await lireJson(ctx.fetchApi, url, ctx.retries, ctx.sleep);
	if (!reponse.ok) return { ok: false, motif: reponse.motif };
	return { ok: true, entreprises: entreprisesDepuisApi(reponse.donnees) };
}

/* ------------------------------------------------------------------ */
/* Domaine web                                                          */
/* ------------------------------------------------------------------ */

const DOMAINE_RE = /(?:[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?\.)+[a-z]{2,}/gi;

export interface CandidatDomaine {
	domaine: string;
	origine: "nom" | "zone";
}

/** Domains cités par le nom de l'org ou par ses champs domaine/site web. */
export function candidatsDomaine(org: OrgEnrichissable): CandidatDomaine[] {
	const trouves = new Map<string, CandidatDomaine>();
	for (const m of (org.name ?? "").matchAll(DOMAINE_RE)) {
		const d = normalizeDomainValue(m[0]);
		if (d && racineAdmissible(d) && !trouves.has(d)) trouves.set(d, { domaine: d, origine: "nom" });
	}
	for (const brut of [org.website, org.domain]) {
		const d = normalizeDomainValue(brut);
		if (d && racineAdmissible(d) && !trouves.has(d)) trouves.set(d, { domaine: d, origine: "zone" });
	}
	return [...trouves.values()].slice(0, 4);
}

export type VerificationDomaine =
	| { ok: true; statut: number; urlFinale: string; hoteFinal: string }
	| { ok: false; statut: number | null; motif: string };

/** Une proposition n'est acceptée que sur un HTTP 200 final, chez le même titulaire. */
export async function verifierDomaine(domaine: string, ctx: ContexteEnrichissement): Promise<VerificationDomaine> {
	if (!racineAdmissible(domaine)) return { ok: false, statut: null, motif: "domaine-inadmissible" };
	if (!hotePublic(domaine)) return { ok: false, statut: null, motif: "hote-non-public" };
	if (!ctx.fetchHttp || !ctx.verifierHttp) return { ok: false, statut: null, motif: "verification-desactivee" };
	let reponse: ReponseLike;
	try {
		reponse = await ctx.fetchHttp(`https://${domaine}/`, {
			headers: { "user-agent": "RadarCyber-Referentiel/1.0 (verification site officiel)" },
			signal: AbortSignal.timeout(ctx.timeoutMs),
			redirect: "follow",
		});
	} catch (e) {
		return { ok: false, statut: null, motif: `fetch: ${texteErreur(e)}` };
	}
	try {
		if (reponse.body) await Promise.resolve(reponse.body.cancel()).catch(() => {});
	} catch {
		// Annuler le corps n'est jamais une raison de rejeter une réponse 200.
	}
	if (reponse.status !== 200) return { ok: false, statut: reponse.status, motif: `http-${reponse.status}` };
	let hoteFinal: string;
	try {
		hoteFinal = new URL(reponse.url || `https://${domaine}/`).hostname.toLowerCase().replace(/\.$/, "");
	} catch {
		return { ok: false, statut: reponse.status, motif: "url-finale-invalide" };
	}
	if (!domaineRacine(hoteFinal) || domaineRacine(hoteFinal) !== domaineRacine(domaine)) {
		return { ok: false, statut: reponse.status, motif: "redirect-hors-domaine" };
	}
	return { ok: true, statut: reponse.status, urlFinale: reponse.url, hoteFinal };
}

export interface TentativeDomaine {
	domaine: string;
	origine: "nom" | "zone";
	ok: boolean;
	statut: number | null;
	motif: string | null;
}

export async function proposerDomaine(
	org: OrgEnrichissable,
	ctx: ContexteEnrichissement,
	tentatives: TentativeDomaine[],
): Promise<Proposition | null> {
	let meilleure: Proposition | null = null;
	for (const candidat of candidatsDomaine(org)) {
		const verification = await verifierDomaine(candidat.domaine, ctx);
		tentatives.push({
			domaine: candidat.domaine,
			origine: candidat.origine,
			ok: verification.ok,
			statut: verification.statut,
			motif: verification.ok ? null : verification.motif,
		});
		if (!verification.ok) continue;
		let score = 0.76;
		if (verification.urlFinale.startsWith("https://")) score += 0.06;
		const nomCompact = nomNormalise(org.name).replace(/[^a-z0-9]/g, "");
		const racineCompact = (candidat.domaine.split(".")[0] ?? "").replace(/[^a-z0-9]/g, "");
		if (racineCompact.length >= 5 && nomCompact.includes(racineCompact)) score += 0.08;
		if (candidat.origine === "nom") score += 0.04;
		const proposition: Proposition = {
			orgId: org.id,
			champ: "domain",
			valeur: { domaine: candidat.domaine },
			source: `http-200:${verification.hoteFinal}`,
			confiance: confiance(score),
			details: {
				codeHttp: verification.statut,
				urlFinale: verification.urlFinale.slice(0, 500),
				origine: candidat.origine,
			},
		};
		if (!meilleure || proposition.confiance > meilleure.confiance) meilleure = proposition;
	}
	return meilleure && meilleure.confiance >= ctx.seuil ? meilleure : null;
}

/* ------------------------------------------------------------------ */
/* SIREN et secteur                                                     */
/* ------------------------------------------------------------------ */

interface Evaluation {
	candidat: EntrepriseCandidate;
	confiance: number;
	raisons: string[];
}

function evaluerCandidat(org: OrgEnrichissable, candidat: EntrepriseCandidate): Evaluation | null {
	const nomOrg = nomNormalise(org.name);
	const nomCand = nomNormalise(candidat.nom);
	if (nomOrg !== nomCand && !candidat.alias) return null;
	let score = candidat.alias ? 0.70 : 0.82;
	const raisons = [candidat.alias ? "alias" : "nom-exact"];
	const siege = candidat.siege;
	if (siege && !estVide(siege.departement) && org.dept && siege.departement === org.dept) {
		score += 0.08;
		raisons.push("departement");
	}
	if (siege && !estVide(siege.commune) && org.city && nomNormalise(siege.commune) === nomNormalise(org.city)) {
		score += 0.05;
		raisons.push("commune");
	}
	if ((candidat.etat ?? "").toLowerCase().startsWith("actif")) {
		score += 0.03;
		raisons.push("actif");
	}
	return { candidat, confiance: confiance(score), raisons };
}

/** Refuse toute attribution ambiguë : deux SIREN différents ne sont jamais départagés au hasard. */
export function choisirCandidat(
	org: OrgEnrichissable,
	candidats: readonly EntrepriseCandidate[],
): { ok: true; evaluation: Evaluation } | { ok: false; motif: string } {
	if (candidats.length === 0) return { ok: false, motif: "sans-match" };
	const evaluations = candidats
		.map((c) => evaluerCandidat(org, c))
		.filter((e): e is Evaluation => e !== null);
	if (evaluations.length === 0) return { ok: false, motif: "sans-match-exact" };
	evaluations.sort((a, b) => b.confiance - a.confiance || a.candidat.siren.localeCompare(b.candidat.siren));
	const meilleur = evaluations[0]!;
	const siren = meilleur.candidat.siren;
	const concurrents = new Set(
		evaluations.filter((e) => e.confiance >= meilleur.confiance - 0.05).map((e) => e.candidat.siren),
	);
	if (concurrents.size > 1) return { ok: false, motif: "match-ambigu" };
	return { ok: true, evaluation: meilleur };
}

const NAF_RANGES: ReadonlyArray<{ de: number; a: number; secteur: string; libelle: string }> = [
	{ de: 1, a: 3, secteur: "agriculture", libelle: "Agriculture, sylviculture et pêche" },
	{ de: 5, a: 9, secteur: "energie", libelle: "Industries extractives" },
	{ de: 10, a: 33, secteur: "industrie", libelle: "Industrie manufacturière" },
	{ de: 35, a: 39, secteur: "energie", libelle: "Énergie, eau et déchets" },
	{ de: 41, a: 43, secteur: "construction", libelle: "Construction" },
	{ de: 45, a: 47, secteur: "commerce", libelle: "Commerce et réparation" },
	{ de: 49, a: 53, secteur: "transport", libelle: "Transports et logistique" },
	{ de: 55, a: 56, secteur: "hotellerie", libelle: "Hébergement et restauration" },
	{ de: 58, a: 63, secteur: "numerique", libelle: "Numérique et télécommunications" },
	{ de: 64, a: 66, secteur: "finance", libelle: "Finance et assurance" },
	{ de: 68, a: 68, secteur: "immobilier", libelle: "Activités immobilières" },
	{ de: 69, a: 82, secteur: "services", libelle: "Services spécialisés et administratifs" },
	{ de: 84, a: 84, secteur: "administration", libelle: "Administration publique" },
	{ de: 85, a: 85, secteur: "enseignement", libelle: "Enseignement" },
	{ de: 86, a: 88, secteur: "sante", libelle: "Santé et action sociale" },
	{ de: 90, a: 93, secteur: "culture", libelle: "Culture, sports et loisirs" },
	{ de: 94, a: 96, secteur: "association", libelle: "Associations et services personnels" },
	{ de: 97, a: 99, secteur: "autre", libelle: "Autres activités" },
];

export function nafVersSecteur(code: string | null): { secteur: string; libelle: string } | null {
	const naf = normaliserNaf(code);
	if (!naf) return null;
	const prefix = Number(naf.slice(0, 2));
	const range = NAF_RANGES.find((r) => prefix >= r.de && prefix <= r.a);
	return range ? { secteur: range.secteur, libelle: range.libelle } : null;
}

export function sourceEntreprise(candidat: EntrepriseCandidate): string {
	return candidat.origine === "api" ? "recherche-entreprises-api" : "sirene-snapshot";
}

export function proposerSiren(
	org: OrgEnrichissable,
	evaluation: Evaluation,
): Proposition {
	return {
		orgId: org.id,
		champ: "siren",
		valeur: { siren: evaluation.candidat.siren },
		source: sourceEntreprise(evaluation.candidat),
		confiance: evaluation.confiance,
		details: {
			nom: evaluation.candidat.nom.slice(0, 200),
			match: evaluation.raisons.join("+"),
		},
	};
}

export function proposerSecteur(
	org: OrgEnrichissable,
	evaluation: Evaluation,
): Proposition | { motif: string } {
	const naf = normaliserNaf(evaluation.candidat.naf);
	const secteur = nafVersSecteur(naf);
	if (!naf || !secteur) return { motif: "naf-absent" };
	return {
		orgId: org.id,
		champ: "secteur",
		valeur: {
			secteur: secteur.secteur,
			naf,
			libelle: secteur.libelle,
		},
		source: sourceEntreprise(evaluation.candidat),
		confiance: confiance(evaluation.confiance - 0.02),
		details: {
			match: evaluation.raisons.join("+"),
			libelleNaf: evaluation.candidat.nafLibelle?.slice(0, 200) ?? null,
		},
	};
}

/* ------------------------------------------------------------------ */
/* Géolocalisation par code postal                                      */
/* ------------------------------------------------------------------ */

function coordonneesValides(lat: number | null, lon: number | null): boolean {
	return (
		lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon) &&
		lat >= 40 && lat <= 52 && lon >= -6 && lon <= 10
	);
}

function communeLaPlusPeuplee(communes: readonly Commune[]): Commune {
	return [...communes].sort((a, b) => (b.population ?? 0) - (a.population ?? 0) || a.code.localeCompare(b.code))[0]!;
}

export type ResultatGeo =
	| { ok: true; proposition: Proposition }
	| { ok: false; motif: string };

/** Résout un code postal vers un centre de commune ; le nom de commune lève l'ambiguïté. */
export function proposerGeo(
	org: OrgEnrichissable,
	ctx: ContexteEnrichissement,
	codePostalHint?: string | null,
): ResultatGeo {
	const cp = codePostalValide(codePostalHint) ?? codePostalValide(org.city?.match(/\b\d{5}\b/)?.[0]);
	const nomVille = nomNormalise((org.city ?? "").replace(/\b\d{5}\b/g, " "));
	let commune: Commune | null = null;
	let score = 0;
	let regle = "";
	let ambiguite = 0;

	if (cp) {
		const communes = ctx.communesParCp.get(cp) ?? [];
		if (communes.length === 0) return { ok: false, motif: "code-postal-inconnu" };
		const parNom = nomVille ? communes.filter((c) => nomNormalise(c.nom) === nomVille) : [];
		if (parNom.length === 1) {
			commune = parNom[0]!;
			score = 0.95;
			regle = "cp+commune";
		} else if (parNom.length > 1) {
			commune = communeLaPlusPeuplee(parNom);
			score = 0.72;
			regle = "cp+commune-ambigua";
			ambiguite = parNom.length;
		} else if (communes.length === 1) {
			commune = communes[0]!;
			score = 0.85;
			regle = "cp-unique";
		} else if (communes.length > 5) {
			return { ok: false, motif: "code-postal-trop-ambigu" };
		} else {
			commune = communeLaPlusPeuplee(communes);
			score = 0.65;
			regle = "cp-population";
			ambiguite = communes.length;
		}
		if (org.dept && commune.departement && org.dept !== commune.departement) {
			return { ok: false, motif: "departement-incoherent" };
		}
	} else if (nomVille) {
		const communes = (ctx.communesParNom.get(nomVille) ?? []).filter(
			(c) => !org.dept || !c.departement || c.departement === org.dept,
		);
		if (communes.length === 0) return { ok: false, motif: "commune-inconnue" };
		if (communes.length > 1) return { ok: false, motif: "commune-ambigue" };
		commune = communes[0]!;
		score = 0.80;
		regle = "commune";
	} else {
		return { ok: false, motif: "sans-code-postal" };
	}

	if (!coordonneesValides(commune.lat, commune.lon)) return { ok: false, motif: "coordonnees-invalides" };
	return {
		ok: true,
		proposition: {
			orgId: org.id,
			champ: "geo",
			valeur: {
				lat: commune.lat!,
				lon: commune.lon!,
				codePostal: cp ?? commune.codesPostaux[0] ?? null,
				commune: commune.nom,
				codeCommune: commune.code,
			},
			source: "codes-postaux-communes",
			confiance: confiance(score),
			details: { regle, ambiguite, dept: commune.departement },
		},
	};
}

/* ------------------------------------------------------------------ */
/* Orchestration d'une organisation                                     */
/* ------------------------------------------------------------------ */

function candidatsSiren(org: OrgEnrichissable, ctx: ContexteEnrichissement): EntrepriseCandidate[] {
	const nom = nomNormalise(org.name);
	return ctx.entreprisesParNom.get(nom) ?? [];
}

export async function analyserOrganisation(
	org: OrgEnrichissable,
	ctx: ContexteEnrichissement,
): Promise<ResultatAnalyse> {
	const resultat: ResultatAnalyse = { propositions: [], rejets: [], tentativesHttp: 0, appelsApi: 0 };
	const veut = (champ: Champ): boolean => ctx.champs.has(champ);
	const vide = (champ: Champ): boolean =>
		champ === "domain" ? estVide(org.domain)
			: champ === "siren" ? estVide(org.siren)
				: champ === "secteur" ? estVide(org.sector)
					: org.lat == null || org.lon == null;

	// 1) Domaine : une seule valeur retenue, la mieux vérifiée.
	if (veut("domain") && vide("domain")) {
		const tentatives: TentativeDomaine[] = [];
		const proposition = await proposerDomaine(org, ctx, tentatives);
		resultat.tentativesHttp += tentatives.length;
		if (proposition) resultat.propositions.push(proposition);
		else {
			const premiere = tentatives[0];
			resultat.rejets.push({
				orgId: org.id,
				champ: "domain",
				motif: tentatives.length === 0 ? "sans-candidat"
					: tentatives.every((t) => !t.ok && t.motif === "verification-desactivee")
						? "verification-desactivee"
						: `aucune-verification-200${premiere?.motif ? `:${premiere.motif}` : ""}`,
			});
		}
	}

	// 2) Fiches entreprise : une seule recherche sert SIREN, secteur et l'indice postal.
	const besoinFiche =
		(veut("siren") && vide("siren")) ||
		(veut("secteur") && vide("secteur")) ||
		(veut("geo") && vide("geo"));
	let evaluation: Evaluation | null = null;
	let codePostalFiche: string | null = null;
	if (besoinFiche) {
		let candidats: EntrepriseCandidate[] = [];
		if (ctx.modeSiren === "api") {
			resultat.appelsApi++;
			const reponse = await chercherApi(org.name, ctx);
			if (reponse.ok) candidats = reponse.entreprises;
			else {
				if (veut("siren") && vide("siren")) {
					resultat.rejets.push({ orgId: org.id, champ: "siren", motif: `api-indisponible:${reponse.motif}` });
				}
				candidats = candidatsSiren(org, ctx);
			}
		} else {
			candidats = candidatsSiren(org, ctx);
		}
		if (candidats.length === 0) candidats = candidatsSiren(org, ctx);
		const sirenConnu = org.siren?.trim();
		if (candidats.length === 0 && sirenConnu) {
			const connu = ctx.entreprisesParSiren.get(sirenConnu);
			if (connu) candidats = [connu];
		}
		const choix = choisirCandidat(org, candidats);
		if (choix.ok) {
			evaluation = choix.evaluation;
			codePostalFiche = evaluation.candidat.siege?.codePostal ?? null;
		} else {
			if (veut("siren") && vide("siren")) resultat.rejets.push({ orgId: org.id, champ: "siren", motif: choix.motif });
			if (veut("secteur") && vide("secteur")) resultat.rejets.push({ orgId: org.id, champ: "secteur", motif: choix.motif });
		}
	}

	if (evaluation) {
		if (veut("siren") && vide("siren") && evaluation.confiance >= ctx.seuil) {
			resultat.propositions.push(proposerSiren(org, evaluation));
		}
		if (veut("secteur") && vide("secteur")) {
			const secteur = proposerSecteur(org, evaluation);
			if ("motif" in secteur) resultat.rejets.push({ orgId: org.id, champ: "secteur", motif: secteur.motif });
			else if (secteur.confiance >= ctx.seuil) resultat.propositions.push(secteur);
			else resultat.rejets.push({ orgId: org.id, champ: "secteur", motif: "sous-seuil" });
		}
	}

	if (veut("geo") && vide("geo")) {
		const geo = proposerGeo(org, ctx, codePostalFiche);
		if (geo.ok && geo.proposition.confiance >= ctx.seuil) resultat.propositions.push(geo.proposition);
		else resultat.rejets.push({
			orgId: org.id,
			champ: "geo",
			motif: geo.ok ? "sous-seuil" : geo.motif,
		});
	}

	return resultat;
}

/* ------------------------------------------------------------------ */
/* Couverture                                                           */
/* ------------------------------------------------------------------ */

export interface CouvertureAvantChamp {
	remplis: number;
	/** Nombre de valeurs tracées dans `org_enrichment` (source + confiance). */
	traces: number;
}

export interface CouvertureApresChamp {
	remplis: number;
	taux: number;
	gain: number;
	propositions: number;
	tracesApres: number;
}

export type CouvertureAvant = Record<Champ, CouvertureAvantChamp>;
export type CouvertureApres = Record<Champ, CouvertureApresChamp>;

export function couvertureVide(): CouvertureAvant {
	return {
		domain: { remplis: 0, traces: 0 },
		siren: { remplis: 0, traces: 0 },
		secteur: { remplis: 0, traces: 0 },
		geo: { remplis: 0, traces: 0 },
	};
}

/**
 * Couverture projetée : le mode rapport n'écrit rien, le gain est donc calculé
 * en ajoutant les propositions aux champs vides constatés avant. En mode
 * --appliquer, le CLI remesure la base après écriture et compare les deux.
 */
export function calculerCouverture(
	total: number,
	avant: CouvertureAvant,
	propositions: readonly Proposition[],
): CouvertureApres {
	const ajouts = couvertureVide();
	for (const p of propositions) ajouts[p.champ].remplis++;
	const sortie = {} as CouvertureApres;
	for (const champ of CHAMPS) {
		const remplis = avant[champ].remplis + ajouts[champ].remplis;
		sortie[champ] = {
			remplis,
			taux: total > 0 ? Math.round((remplis / total) * 1_000_000) / 1_000_000 : 0,
			gain: ajouts[champ].remplis,
			propositions: ajouts[champ].remplis,
			tracesApres: avant[champ].traces + ajouts[champ].remplis,
		};
	}
	return sortie;
}
