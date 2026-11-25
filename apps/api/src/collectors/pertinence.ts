/**
 * Filtre de pertinence cyber — configurable, sans dépendance externe.
 *
 * Deux besins distincts, souvent confondus :
 *   1. dire si un item *doit* entrer dans le radar (porte binaire) ;
 *   2. dire *combien* il est cyber (score 0–10, conservé sur l'événement).
 *
 * Le même moteur répond aux deux : la porte n'est que le score comparé à un
 * seuil. Les termes forts (ransomware, CVE, breach…) suffisent seuls ; les
 * termes faibles (menace, attaque, virus) ne s'additionnent pas entre eux —
 * « L'Iran menace de frapper… des attaques » n'est pas un incident cyber.
 *
 * Configuration par variables d'environnement (aucune dépendance, aucun
 * fichier à déployer) :
 *   RADAR_CYBER_KEYWORDS   termes additionnels, séparés par des virgules ;
 *   RADAR_CYBER_EXCLUSIONS termes qui annulent un score faible (ex. « virus
 *                          hivernaux », « attaques de loup ») ;
 *   RADAR_CYBER_MIN_SCORE  seuil d'admission entier 1–10 (défaut 2).
 *
 * Une configuration vide, mal formée ou excessive ne lève jamais : elle
 * retombe sur les valeurs sûres et expose les problèmes dans `warnings`.
 */
import type { RelevanceOrg } from "./relevance.js";

export type PertinenceReason = "keyword" | "org" | "epss" | "dept" | "excluded" | "none";
export type PertinenceRule = "org" | "epss" | "dept" | null;

export interface RelevanceConfig {
	/** Lexique actif : intégrés + ajouts de configuration, dédupliqués. */
	keywords: readonly string[];
	/** Phrases dont la présence annule un score uniquement faible. */
	exclusions: readonly string[];
	/** Score minimal d'admission (1–10). */
	minScore: number;
	/** Entrées rejetées de la configuration, pour le journal de run. */
	warnings: readonly string[];
}

export interface PertinenceMatch {
	term: string;
	field: "title" | "summary" | "url";
	weight: number;
}

export interface PertinenceVerdict {
	/** Score entier borné à 0–10. 0 = aucun signal ou exclusion. */
	score: number;
	threshold: number;
	relevant: boolean;
	reason: PertinenceReason;
	/** Règle de couverture à consigner sur l'événement, le cas échéant. */
	rule: PertinenceRule;
	matches: readonly PertinenceMatch[];
	/** Terme d'exclusion ayant neutralisé le score, le cas échéant. */
	exclusion: string | null;
}

/** Termes intégrés, pondérés : 4 = cyber certain, 2 = contexte technique, 1 = ambigu. */
const WEIGHTS: Readonly<Record<string, number>> = {
	// 4 — la mention suffit, quel que soit le reste du texte
	cyberattaque: 4, "cyber attaque": 4, "cyber-attaque": 4, ransomware: 4, rançongiciel: 4,
	"fuite de données": 4, "violation de données": 4, "data breach": 4, breach: 4,
	vulnérabilité: 4, vulnerabilite: 4, vulnerabilities: 4, vulnerability: 4,
	"zero-day": 4, zeroday: 4, "zero day": 4, "cve-": 4, exploit: 4, exploited: 4,
	malware: 4, maliciel: 4, phishing: 4, hameçonnage: 4, "spear phishing": 4,
	compromission: 4, compromised: 4, intrusion: 4, piratage: 4, "data leak": 4,
	ddos: 4, botnet: 4, exfiltration: 4, "ransomware attack": 4, backdoor: 4,
	"porte dérobée": 4, "threat actor": 4, "apt group": 4, rootkit: 4,
	// 2 — contexte cyber explicite, mais insuffisant seul sous le seuil par défaut
	cyber: 2, cybersécurité: 2, cybercriminalité: 2, cybersecurity: 2, "sécurité informatique": 2,
	"security advisory": 2, "patch tuesday": 2, "identifiants volés": 2,
	"cheval de troie": 2, "faille de sécurité": 2, faille: 2, flaw: 2,
	"données personnelles": 2, "personal data": 2, "compromised credentials": 2,
	anssi: 2, cnil: 2, "cert-fr": 2, "security incident": 2, "data protection": 2,
	"infractions numériques": 2, "attaque informatique": 2, "incident informatique": 2,
	// 1 — vocabulaire ambigu : jamais admis seul, ne s'additionne pas
	attaque: 1, attacks: 1, attack: 1, menace: 1, threat: 1, threats: 1,
	virus: 1, incident: 1, sécurité: 1, security: 1, pirates: 1, hacker: 1,
	hackers: 1, rançon: 1, "revendiqué par": 1, apt: 1,
};

/** Lexique historique (FR) : conservé tel quel pour les appelants existants. */
export const CYBER_KEYWORDS: string[] = [
	"cyberattaque", "cyber-attaque", "ransomware", "rançongiciel", "fuite de données",
	"violation de données", "vulnérabilité", "faille", "CVE-", "zero-day", "phishing",
	"hameçonnage", "DDoS", "ANSSI", "CNIL", "compromis", "intrusion", "piratage",
	"rançon", "données personnelles", "sécurité informatique", "maliciel",
	"cheval de troie", "exfiltration", "APT", "botnet", "serveur compromis",
	"identifiants volés", "revendication",
];

const MAX_TERMS = 64;
const MAX_TERM_LENGTH = 80;
/** Bornes des caches partagés entre items (FIFO). */
const MAX_CACHED_TERMS = 512;
const MAX_CACHED_ORG_INDEXES = 512;

/** Normalisation partagée avec `relevance.ts` : casse et accents tombent. */
function normalise(value: string): string {
	return String(value ?? "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim();
}

function termKey(value: string): string {
	return normalise(value).replace(/\s+/g, " ");
}

interface PreparedTerm {
	readonly key: string;
	/** null : codes du type `CVE-`, recherchés comme sous-chaîne. */
	readonly pattern: RegExp | null;
}

const termCache = new Map<string, PreparedTerm>();

/** Compile une clé déjà normalisée ; le motif est partagé entre tous les items. */
function compileTermKey(key: string): PreparedTerm {
	const cached = termCache.get(key);
	if (cached) return cached;
	let pattern: RegExp | null = null;
	if (key && /^[a-z0-9].*[a-z0-9]$/.test(key)) {
		const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
		// Les dépêches françaises écrivent « cyberattaques », « failles »…
		// Le pluriel simple est toléré, pas la conjugaison ni les dérivés.
		const pluriel = key.length >= 4 && /[a-z]$/.test(key) && !/s$/.test(key) ? "s?" : "";
		pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${pluriel}(?![\\p{L}\\p{N}])`, "iu");
	}
	const prepared: PreparedTerm = { key, pattern };
	if (termCache.size >= MAX_CACHED_TERMS) {
		const oldest = termCache.keys().next().value;
		if (oldest !== undefined) termCache.delete(oldest);
	}
	termCache.set(key, prepared);
	return prepared;
}

/** Précompile un terme (clé + regex) une seule fois, puis le met en cache. */
export function prepareTerm(term: string): PreparedTerm {
	return compileTermKey(termKey(term));
}

function containsPrepared(hay: string, prepared: PreparedTerm): boolean {
	if (!prepared.key) return false;
	return prepared.pattern ? prepared.pattern.test(hay) : hay.includes(prepared.key);
}


/** Normalisation du nom d'une organisation pour la recherche par nom entier. */
export function prepareOrgSearchName(name: string): string {
	return normalise(String(name ?? ""))
		.replace(/\b(sarl|sas|sa|eurl|sci|scp|association|groupe|group)\b/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

interface PreparedOrg {
	name: string;
	nameTerm: PreparedTerm | null;
	domains: readonly string[];
}

/** Index d'organisations pré-normalisé, avec ses domaines déjà en minuscules. */
const NO_ORGS: readonly RelevanceOrg[] = [];
const orgIndexCache = new WeakMap<readonly RelevanceOrg[], readonly PreparedOrg[]>();
let orgIndexOrder: (readonly RelevanceOrg[])[] = [];

function preparedOrgs(orgs: readonly RelevanceOrg[]): readonly PreparedOrg[] {
	const cached = orgIndexCache.get(orgs);
	if (cached) return cached;
	const prepared: PreparedOrg[] = orgs.map((org) => {
		const normName = org?.normName ?? prepareOrgSearchName(String(org?.name ?? ""));
		const domains = org?.normDomains ?? [org?.domain, ...(org?.assets ?? [])]
			.filter(Boolean)
			.map((domain) => String(domain).toLowerCase().trim())
			.filter(Boolean);
		return {
			name: org?.name,
			nameTerm: normName.length >= 4 ? prepareTerm(normName) : null,
			domains,
		};
	});
	orgIndexCache.set(orgs, prepared);
	orgIndexOrder.push(orgs);
	if (orgIndexOrder.length > MAX_CACHED_ORG_INDEXES) {
		const oldest = orgIndexOrder.shift();
		if (oldest) orgIndexCache.delete(oldest);
	}
	return prepared;
}

interface PreparedKeyword {
	term: string;
	weight: number;
	prepared: PreparedTerm;
}

interface PreparedConfig {
	keywords: readonly PreparedKeyword[];
	exclusions: readonly { term: string; prepared: PreparedTerm }[];
}

const configCache = new WeakMap<RelevanceConfig, PreparedConfig>();

/** Le lexique d'une configuration est compilé une fois pour tous les items. */
function preparedConfig(config: RelevanceConfig): PreparedConfig {
	const cached = configCache.get(config);
	if (cached) return cached;
	const keywords: PreparedKeyword[] = [];
	const seen = new Set<string>();
	for (const term of config.keywords ?? []) {
		const prepared = prepareTerm(String(term ?? ""));
		if (!prepared.key || seen.has(prepared.key)) continue;
		seen.add(prepared.key);
		keywords.push({ term, weight: weightOf(term), prepared });
	}
	const exclusions = (config.exclusions ?? []).map((term) => ({
		term,
		prepared: prepareTerm(String(term ?? "")),
	}));
	const compiled = { keywords, exclusions };
	configCache.set(config, compiled);
	return compiled;
}

function parseTerms(raw: string | undefined, label: string, warnings: string[]): string[] {
	if (raw === undefined || String(raw).trim() === "") return [];
	const out: string[] = [];
	const seen = new Set<string>();
	for (const piece of String(raw).split(",")) {
		const term = piece.trim();
		if (!term) continue;
		if (term.length > MAX_TERM_LENGTH || !/[\p{L}\p{N}]/u.test(term)) {
			warnings.push(`${label}: terme ignoré (${term.slice(0, 24)})`);
			continue;
		}
		const key = termKey(term);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(term);
		if (out.length >= MAX_TERMS) {
			warnings.push(`${label}: limite de ${MAX_TERMS} termes atteinte`);
			break;
		}
	}
	return out;
}

/** Charge la configuration (pure : aucun accès réseau ni base). */
export function loadRelevanceConfig(env: NodeJS.ProcessEnv = process.env): RelevanceConfig {
	const warnings: string[] = [];
	const keywords = new Map<string, string>();
	for (const term of CYBER_KEYWORDS) keywords.set(termKey(term), term);
	for (const term of Object.keys(WEIGHTS)) keywords.set(termKey(term), term);
	for (const term of parseTerms(env.RADAR_CYBER_KEYWORDS, "RADAR_CYBER_KEYWORDS", warnings)) {
		const key = termKey(term);
		if (!keywords.has(key)) keywords.set(key, term);
	}
	const exclusions = parseTerms(env.RADAR_CYBER_EXCLUSIONS, "RADAR_CYBER_EXCLUSIONS", warnings);
	const rawMin = String(env.RADAR_CYBER_MIN_SCORE ?? "").trim();
	const parsedMin = Number(rawMin);
	let minScore = 2;
	if (rawMin !== "") {
		if (Number.isInteger(parsedMin) && parsedMin >= 1 && parsedMin <= 10) minScore = parsedMin;
		else warnings.push(`RADAR_CYBER_MIN_SCORE: valeur invalide (${rawMin}), seuil 2 conservé`);
	}
	return { keywords: [...keywords.values()], exclusions, minScore, warnings };
}

let cachedConfig: RelevanceConfig | null = null;

/** Configuration courante, chargée une seule fois par processus. */
export function currentRelevanceConfig(): RelevanceConfig {
	cachedConfig ??= loadRelevanceConfig();
	return cachedConfig;
}

const WEIGHT_BY_KEY: Readonly<Record<string, number>> = Object.fromEntries(
	Object.entries(WEIGHTS).map(([term, weight]) => [termKey(term), weight]),
);

/** Poids d'un terme : intégré, ou 2 pour un ajout de configuration. */
function weightOf(term: string): number {
	return WEIGHT_BY_KEY[termKey(term)] ?? 2;
}

export interface PertinenceInput {
	title?: string | null;
	summary?: string | null;
	url?: string | null;
	sourceUrl?: string | null;
}

export interface EvaluateOptions {
	orgs?: readonly RelevanceOrg[];
	ignoreDomains?: readonly string[];
	config?: RelevanceConfig;
	/** Règle (a) : CVE du texte avec EPSS au-dessus du seuil. */
	epss?: { cve: string; score: number } | null;
	/** Règle (b) : département ou préfecture cité dans le texte. */
	department?: boolean;
}

/** Champs texte, sans l'URL : c'est là que se lisent les entités. */
function textOf(item: PertinenceInput): string {
	return [item?.title, item?.summary].filter(Boolean).join(" ");
}

/**
 * Verdict complet : score, motif, matches et règle de couverture.
 *
 * Toutes les entrées sont tolérées (null, undefined, nombre, tableau) : un
 * collecteur qui livre un titre mal formé ne doit jamais faire tomber la porte.
 */
export function evaluatePertinence(item: PertinenceInput, opts: EvaluateOptions = {}): PertinenceVerdict {
	const config = opts.config ?? currentRelevanceConfig();
	const title = String(item?.title ?? "");
	const summary = String(item?.summary ?? "");
	const url = [item?.url, item?.sourceUrl].filter(Boolean).map(String).join(" ");
	const hayTitle = normalise(title);
	const haySummary = normalise(summary);
	const hayUrl = normalise(url);
	const matches: PertinenceMatch[] = [];
	const compiled = preparedConfig(config);

	for (const { term, weight, prepared } of compiled.keywords) {
		if (containsPrepared(hayTitle, prepared)) {
			matches.push({ term, field: "title", weight });
		} else if (containsPrepared(haySummary, prepared)) {
			matches.push({ term, field: "summary", weight: Math.max(1, weight - 1) });
		} else if (weight >= 2 && containsPrepared(hayUrl, prepared)) {
			// L'URL porte surtout le nom du média : indice faible, plafonné à 1.
			matches.push({ term, field: "url", weight: 1 });
		}
	}

	// Entités du référentiel : noms et domaines déjà normalisés dans l'index.
	const ignored = (opts.ignoreDomains ?? []).map((d) => String(d).toLowerCase().trim()).filter(Boolean);
	const isSelfDomain = (dom: string): boolean =>
		ignored.some((host) => host === dom || host.endsWith(`.${dom}`) || dom.endsWith(`.${host}`));
	const hayText = normalise(textOf(item));
	let orgMatch: string | null = null;
	for (const org of preparedOrgs(opts.orgs ?? NO_ORGS)) {
		if (org.nameTerm && containsPrepared(hayText, org.nameTerm)) {
			orgMatch = org.name;
			matches.push({ term: org.name, field: "title", weight: 3 });
			break;
		}
		const found = org.domains.find((dom) => !isSelfDomain(dom) && hayText.includes(dom));
		if (found) {
			orgMatch = found;
			matches.push({ term: found, field: "title", weight: 2 });
			break;
		}
	}

	// Score : le meilleur signal compte, les signaux moyens/forts s'ajoutent
	// dans une limite ; les signaux faibles ne s'additionnent jamais.
	let best = 0;
	let extra = 0;
	for (const match of matches) {
		if (match.weight > best) best = match.weight;
		else if (match.weight >= 2) extra += Math.min(1, match.weight - 1);
	}
	let score = Math.min(10, best + Math.min(3, extra));
	let rule: PertinenceRule = null;
	let reason: PertinenceReason = score > 0 ? "keyword" : "none";
	if (orgMatch !== null) {
		score = Math.min(10, score + 3);
		rule = "org";
		reason = "org";
	}
	if (opts.epss) {
		score = Math.min(10, score + 3);
		if (rule === null) {
			rule = "epss";
			reason = "epss";
		}
	}
	if (opts.department === true) {
		score = Math.min(10, score + 2);
		if (rule === null) {
			rule = "dept";
			reason = "dept";
		}
	}

	// Exclusion : elle ne neutralise qu'un score faible. Un signal fort ou une
	// organisation nommée reste admissible (ex. « virus » dans « virus informatique »).
	let exclusion: string | null = null;
	if (score < 4) {
		for (const { term, prepared } of compiled.exclusions) {
			if (containsPrepared(hayTitle, prepared) || containsPrepared(haySummary, prepared)) {
				exclusion = term;
				score = 0;
				reason = "excluded";
				rule = null;
				break;
			}
		}
	}
	if (score < config.minScore && reason !== "excluded") {
		score = 0;
		reason = "none";
		rule = null;
	}
	return {
		score,
		threshold: config.minScore,
		relevant: score >= config.minScore,
		reason,
		rule,
		matches,
		exclusion,
	};
}

/** Score d'un événement déjà admis : même moteur, sans porte ni organisation. */
export function scoreEventPertinence(item: PertinenceInput): { score: number; rule: PertinenceRule } {
	const verdict = evaluatePertinence(item);
	return { score: verdict.score, rule: verdict.rule };
}
