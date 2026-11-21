/**
 * Filtre d'actionnabilité des indicateurs.
 *
 * 5,6 M d'indicateurs ingérés, dont l'écrasante majorité sort de blocklists
 * mondiales (netshield, elliotwutingfeng…) : aucune valeur pour nos 392 orgs.
 * Un indicateur ne vaut que s'il désigne un actif que nous surveillons :
 * domaine d'org ou sous-domaine, IP dans le /24 d'un actif connu, ou CVE déjà
 * présente dans nos événements de vulnérabilités.
 *
 * L'index est chargé une fois par run (392 orgs + 393 assets : quelques Ko) ;
 * le verdict est ensuite O(nombre de labels), sans requête par indicateur.
 *
 * Voir docs/filtering.md pour la politique et le branchement dans generic.ts.
 */
import { isIP } from "node:net";
import { MOTS_GENERIQUES, MOTS_GENERIQUES_ENTREPRISE } from "../match/generique.js";
import { ingestQuery } from "../db.js";

/** Motif du verdict : les quatre premiers gardent, les deux derniers rejettent. */
export type IndicatorReason =
	| "org_domain"
	| "org_subdomain"
	| "org_ip"
	| "cve_known"
	| "public_suffix"
	| "global";

export interface Verdict {
	keep: boolean;
	reason: IndicatorReason;
}

/** Index mémoire des actifs surveillés. */
export interface ActiveIndex {
	/** Domaines d'org normalisés (apex, sans `www.`, sans wildcard). */
	domains: Set<string>;
	/** Suffixes publics connus (TLD, `gouv.fr`, `co.uk`…) : un suffixe seul n'est pas un indicateur. */
	suffixes: Set<string>;
	/** IP exactes des assets de kind `ip` (IPv4 et IPv6, forme normalisée). */
	ips: Set<string>;
	/** Clés `a.b.c` des /24 couverts par les assets IP/CIDR. */
	prefixes24: Set<string>;
	/** CVE vues dans nos événements vuln (`nvd:` / `kev:`). */
	cves: Set<string>;
	loadedAt: Date;
}

/**
 * Suffixes publics multi-label et gTLD courants. Volontairement embarqué :
 * aucune dépendance npm, et on n'a besoin que de reconnaître les valeurs qui
 * ne sont *que* des suffixes (les blocklists en laissent fuiter quelques-unes).
 * Les TLD simples (fr, com, dev…) sont complétés dynamiquement par les
 * domaines observés dans `loadActiveIndex`.
 */
const PUBLIC_SUFFIXES: readonly string[] = [
	// gTLD fréquents
	"com", "net", "org", "info", "biz", "io", "app", "dev", "cloud", "online", "site", "shop",
	"xyz", "top", "club", "live", "news", "pro", "mobi", "name", "tech", "store", "blog", "page",
	"email", "digital", "agency", "media", "network", "systems", "solutions", "services", "security",
	"support", "host", "website", "space", "fun", "icu", "cyou", "buzz", "monster", "quest", "rest",
	"bar", "sbs", "work", "click", "link", "vip", "win", "bid", "date", "download", "review", "party",
	"science", "stream", "trade", "webcam", "zip", "mov", "coop", "aero", "museum", "travel", "jobs",
	// suffixations nationales courantes
	"co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "com.br", "com.ar",
	"com.mx", "co.jp", "co.kr", "com.cn", "com.tw", "com.sg", "co.in", "com.tr", "com.ua", "com.pl",
	"co.za", "com.es", "com.pt", "com.gr",
	// suffixes français portés par des collectivités / ordres professionnels
	"gouv.fr", "asso.fr", "com.fr", "nom.fr", "prd.fr", "presse.fr", "tm.fr", "sncf.fr", "aeroport.fr",
	"cci.fr", "notaires.fr", "avocat.fr", "avoues.fr", "barreau.fr", "huissier-justice.fr",
	"pharmacien.fr", "medecin.fr", "veterinaire.fr", "asso.re", "com.re", "gouv.re",
];

/** Catégories de second niveau sous un ccTLD (`co`, `com`, `gouv`… d'un `xx`). */
const SECOND_LEVEL_CATEGORIES: Record<string, true> = {
	co: true, com: true, net: true, org: true, gov: true, gouv: true, ac: true, edu: true,
	asso: true, nom: true, prd: true, presse: true, tm: true, int: true, mil: true, sch: true,
	go: true, gob: true, ne: true, or: true, nic: true, cci: true, notaires: true, avocat: true,
	gre: true,
};

/** Expansion maximale d'un CIDR large en /24 (borne mémoire : /8 = 65 536 entrées). */
const MAX_CIDR_PREFIX24 = 65536;

/**
 * Normalise un hôte : minuscules, sans schéma, sans chemin, sans port, sans
 * wildcard, sans `www.`, sans point final. Les IDN passent en punycode via URL.
 * Renvoie null si la valeur n'est pas un hôte plausible.
 */
export function normalizeHost(raw: string): string | null {
	const trimmed = String(raw ?? "").trim().toLowerCase();
	if (!trimmed) return null;
	const withoutWildcard = trimmed.replace(/^\*\./, "");
	let host: string;
	try {
		host = new URL(withoutWildcard.includes("://") ? withoutWildcard : `http://${withoutWildcard}`).hostname;
	} catch {
		return null;
	}
	host = host.replace(/\.+$/, "");
	// IPv6 entre crochets : on stocke la forme nue.
	if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
	host = host.replace(/^www\./, "");
	if (!host || host.length > 253) return null;
	return host;
}

/** Valide une IPv4 et renvoie sa forme canonique (`1.2.3.4`), sinon null. */
function canonicalIpv4(raw: string): string | null {
	const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(raw);
	if (!m) return null;
	const octets = m.slice(1).map(Number);
	if (octets.some((o) => o > 255)) return null;
	return octets.join(".");
}

/** IP normalisée (IPv4 canonique, IPv6 minuscule), sinon null. */
function canonicalIp(raw: string): string | null {
	const v = raw.trim().replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
	const v4 = canonicalIpv4(v);
	if (v4) return v4;
	return isIP(v) === 6 ? v : null;
}

function isPublicSuffix(host: string, suffixes: Set<string>): boolean {
	if (suffixes.has(host)) return true;
	const labels = host.split(".");
	if (labels.length === 1) return labels[0].length === 2 || suffixes.has(labels[0]);
	if (labels.length === 2 && labels[1].length === 2 && SECOND_LEVEL_CATEGORIES[labels[0]] === true) return true;
	return false;
}

/** Ajoute un CIDR à l'index, exprimé en /24 (couvre /24 → /32, étend les préfixes plus larges). */
function addCidr(idx: ActiveIndex, raw: string): void {
	const [addr, bitsRaw] = raw.trim().split("/");
	const ip = canonicalIpv4(addr ?? "");
	if (!ip) return;
	const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
	if (!Number.isInteger(bits) || bits < 0 || bits > 32) return;
	const [a, b, c, d] = ip.split(".").map(Number) as [number, number, number, number];
	const ipInt = a * 16777216 + b * 65536 + c * 256 + d;
	// Nombre de /24 couverts : 1 pour /24 → /32, 2^(24-n) pour les préfixes plus larges.
	const count = 2 ** Math.max(0, 24 - bits);
	if (count > MAX_CIDR_PREFIX24) return;
	const first24 = Math.floor(ipInt / 256 / count) * count;
	for (let n = 0; n < count; n++) {
		const block = first24 + n;
		idx.prefixes24.add(`${(block >>> 16) & 255}.${(block >>> 8) & 255}.${block & 255}`);
	}
}

/** Range un hôte dans l'index : IP exacte ou domaine. */
function addHostToIndex(idx: ActiveIndex, host: string): void {
	const ip = canonicalIp(host);
	if (ip) idx.ips.add(ip);
	else idx.domains.add(host);
}

/**
 * Charge l'index des actifs surveillés (org.domain, org.website et asset.value)
 * ainsi que les CVE connues. Une seule passe SQL, quelques centaines de lignes.
 */
export async function loadActiveIndex(): Promise<ActiveIndex> {
	const [orgs, assets, cves] = await Promise.all([
		ingestQuery<{ domain: string | null; website: string | null }>("SELECT domain, website FROM org"),
		ingestQuery<{ kind: string; value: string }>("SELECT kind, value FROM asset"),
		loadKnownCves(),
	]);

	const idx: ActiveIndex = {
		domains: new Set<string>(),
		suffixes: new Set<string>(PUBLIC_SUFFIXES),
		ips: new Set<string>(),
		prefixes24: new Set<string>(),
		cves,
		loadedAt: new Date(),
	};

	for (const row of orgs.rows) {
		for (const candidate of [row.domain, row.website]) {
			if (!candidate) continue;
			const host = normalizeHost(candidate);
			if (host) addHostToIndex(idx, host);
		}
	}

	for (const asset of assets.rows) {
		const value = String(asset.value ?? "").trim();
		if (!value) continue;
		switch (asset.kind) {
			case "cidr":
				addCidr(idx, value);
				break;
			case "ip":
				{
					const ip = canonicalIp(value);
					if (ip) idx.ips.add(ip);
					else addCidr(idx, value);
				}
				break;
			case "domain":
			case "subdomain":
			case "hostname":
			case "url":
				{
					const host = normalizeHost(value);
					if (host) addHostToIndex(idx, host);
				}
				break;
			default:
				{
					// kind inattendu : on devine à partir de la valeur.
					const host = normalizeHost(value);
					if (host) addHostToIndex(idx, host);
				}
		}
	}

	// TLD réellement présents dans notre périmètre : évite de maintenir une
	// liste de 250 ccTLD à la main.
	for (const domain of idx.domains) {
		const labels = domain.split(".");
		const tld = labels[labels.length - 1];
		if (tld && tld !== domain) idx.suffixes.add(tld);
	}

	return idx;
}

/** CVE déjà rencontrées dans nos événements vulnérabilités (NVD, CISA KEV). */
export async function loadKnownCves(): Promise<Set<string>> {
	const { rows } = await ingestQuery<{ cve: string }>(
		`SELECT DISTINCT upper(split_part(dedup_key, ':', 2)) AS cve
		 FROM event
		 WHERE dedup_key LIKE 'nvd:%' OR dedup_key LIKE 'kev:%'`,
	);
	const cves = new Set<string>();
	for (const row of rows) {
		if (row.cve?.startsWith("CVE-")) cves.add(row.cve);
	}
	return cves;
}

function classifyIp(raw: string, idx: ActiveIndex): Verdict {
	const ip = canonicalIp(raw);
	if (!ip) return { keep: false, reason: "global" };
	if (idx.ips.has(ip)) return { keep: true, reason: "org_ip" };
	if (isIP(ip) === 4) {
		const block = ip.split(".").slice(0, 3).join(".");
		if (idx.prefixes24.has(block)) return { keep: true, reason: "org_ip" };
	}
	return { keep: false, reason: "global" };
}

function classifyHost(host: string, idx: ActiveIndex): Verdict {
	if (isIP(host)) return classifyIp(host, idx);
	if (idx.domains.has(host)) return { keep: true, reason: "org_domain" };
	// Sous-domaine : on remonte les labels un par un, sans jamais tester le TLD
	// seul (sinon « fr » suffirait à rendre tout le TLD actionnable).
	const labels = host.split(".");
	for (let i = 1; i < labels.length - 1; i++) {
		if (idx.domains.has(labels.slice(i).join("."))) {
			return { keep: true, reason: "org_subdomain" };
		}
	}
	if (isPublicSuffix(host, idx.suffixes)) return { keep: false, reason: "public_suffix" };
	return { keep: false, reason: "global" };
}

/**
 * Décide si un indicateur désigne un actif surveillé.
 *
 * - `domain`/`url` : domaine d'org, sous-domaine, ou hôte IP actionnable ;
 * - `ip` : IP exacte d'un asset ou dans un /24 d'asset IP connu ;
 * - `cve` : CVE présente dans nos événements vuln ;
 * - `hash` : jamais actionnable (aucun lien avec nos actifs).
 */
export function isActionableIndicator(value: string, type: string, idx: ActiveIndex): Verdict {
	const raw = String(value ?? "").trim();
	if (!raw) return { keep: false, reason: "global" };
	const kind = String(type ?? "").toLowerCase().trim();

	if (kind === "cve") {
		return idx.cves.has(raw.toUpperCase())
			? { keep: true, reason: "cve_known" }
			: { keep: false, reason: "global" };
	}
	if (kind === "hash") return { keep: false, reason: "global" };
	if (kind === "ip") return classifyIp(raw, idx);

	// domain, url, email ou type inconnu : on tente l'extraction d'hôte.
	const host = normalizeHost(raw);
	if (!host) return { keep: false, reason: "global" };
	return classifyHost(host, idx);
}

/**
 * Détection de langue fr/en des événements, sans dépendance externe.
 *
 * Les flux du radar sont majoritairement anglais, mais les dépêches locales
 * sont françaises. Deux listes **exclusives** de mots outils et de mots-clés
 * cyber suffisent : chaque token ne contribue qu'à une langue. Les lettres
 * accentées sont un indice fort, plafonné pour qu'un nom propre ne décide pas
 * seul. À score égal, l'anglais l'emporte (langue par défaut des flux tech).
 */
export type Language = "fr" | "en";

export interface LanguageDetection {
	language: Language;
	scores: Readonly<{ fr: number; en: number }>;
}

export interface LanguageVerdict extends LanguageDetection {
	/** Vrai si la langue est autorisée par `RADAR_LANGUAGES`. */
	keep: boolean;
}

const FR_WORDS: Record<string, true> = {
	"d": true, "l": true, "de": true, "des": true, "du": true, "le": true, "la": true, "les": true,
	"un": true, "une": true, "et": true, "est": true, "sont": true, "été": true, "ont": true,
	"avait": true, "sera": true, "seront": true, "dans": true, "sur": true, "pour": true,
	"avec": true, "par": true, "au": true, "aux": true, "en": true, "vers": true, "chez": true,
	"sous": true, "entre": true, "contre": true, "depuis": true, "après": true, "avant": true,
	"pendant": true, "hors": true, "ce": true, "cet": true, "cette": true, "ces": true, "son": true,
	"sa": true, "ses": true, "leur": true, "leurs": true, "nous": true, "vous": true, "il": true,
	"elle": true, "ils": true, "elles": true, "qui": true, "que": true, "dont": true, "où": true,
	"se": true, "ne": true, "pas": true, "plus": true, "moins": true, "lorsque": true, "ainsi": true,
	"aussi": true, "encore": true, "déjà": true, "très": true, "bien": true, "tous": true,
	"toute": true, "tout": true, "toutes": true, "même": true, "autre": true, "autres": true,
	"nouveau": true, "nouvelle": true, "notamment": true, "selon": true, "notre": true,
	"votre": true, "nos": true, "vos": true, "donc": true, "car": true, "mais": true, "à": true,
	"aucune": true, "aucun": true, "vulnérabilité": true, "vulnérabilités": true,
	"attaque": true, "attaques": true, "cyberattaque": true, "entreprise": true,
	"entreprises": true, "logiciel": true, "logiciels": true, "sécurité": true, "réseau": true,
	"réseaux": true, "système": true, "systèmes": true, "données": true, "donnée": true,
	"utilisateurs": true, "menace": true, "menaces": true, "failles": true, "faille": true,
	"correctif": true, "publié": true, "publiée": true, "rapport": true, "étude": true,
	"gouvernement": true, "ministère": true, "mairie": true, "collectivité": true,
	"signalé": true, "déclare": true, "affirme": true, "victime": true, "victimes": true,
};

const EN_WORDS: Record<string, true> = {
	"the": true, "and": true, "of": true, "in": true, "to": true, "is": true, "are": true,
	"was": true, "were": true, "be": true, "been": true, "being": true, "for": true, "with": true,
	"on": true, "at": true, "by": true, "from": true, "as": true, "that": true, "this": true,
	"these": true, "those": true, "it": true, "its": true, "has": true, "have": true, "had": true,
	"will": true, "would": true, "can": true, "could": true, "should": true, "may": true,
	"might": true, "must": true, "not": true, "no": true, "into": true, "about": true,
	"over": true, "under": true, "between": true, "after": true, "before": true, "during": true,
	"than": true, "then": true, "also": true, "more": true, "most": true, "some": true,
	"any": true, "all": true, "each": true, "other": true, "another": true, "new": true,
	"our": true, "your": true, "their": true, "they": true, "them": true, "he": true, "she": true,
	"we": true, "you": true, "who": true, "which": true, "what": true, "when": true, "where": true,
	"why": true, "how": true, "because": true, "but": true, "or": true, "if": true,
	"report": true, "reports": true, "say": true, "says": true, "said": true, "according": true,
	"using": true, "used": true, "user": true, "users": true, "vulnerability": true,
	"vulnerabilities": true, "attack": true, "attacks": true, "security": true, "research": true,
	"researchers": true, "software": true, "threat": true, "threats": true, "malware": true,
	"phishing": true, "breach": true, "breached": true, "compromise": true, "compromised": true,
	"exploit": true, "exploited": true, "patch": true, "patched": true, "update": true,
	"updated": true, "data": true, "company": true, "companies": true, "government": true,
	"officials": true, "agency": true, "network": true, "networks": true, "systems": true,
	"devices": true, "incident": true, "incidents": true, "disclosure": true, "disclosed": true,
	"critical": true, "risk": true, "targeting": true, "targeted": true, "campaign": true,
	"actor": true, "actors": true, "published": true,
};

const FR_ACCENT = /[àâçéèêëîïôöùûüÿœæ]/i;

/** Langue du texte (titre + résumé), avec les scores détaillés. */
export function detectLanguage(text: string): LanguageDetection {
	const tokens = String(text ?? "").toLowerCase().match(/[a-zà-ÿœæ]+/g) ?? [];
	let fr = 0;
	let en = 0;
	let accents = 0;
	for (const token of tokens) {
		if (FR_WORDS[token] === true) fr++;
		else if (EN_WORDS[token] === true) en++;
		if (FR_ACCENT.test(token)) accents++;
	}
	fr += Math.min(accents, 3);
	return { language: fr > en ? "fr" : "en", scores: { fr, en } };
}

/** Langues à ingérer (`RADAR_LANGUAGES`, séparées par des virgules). Vide/inconnu = fr et en. */
export function configuredLanguages(env: NodeJS.ProcessEnv = process.env): Set<Language> {
	const allowed = new Set<Language>();
	for (const token of (env.RADAR_LANGUAGES ?? "").toLowerCase().split(/[,\s;]+/)) {
		if (token === "fr" || token === "en") allowed.add(token);
	}
	if (allowed.size === 0) {
		allowed.add("fr");
		allowed.add("en");
	}
	return allowed;
}

/**
 * Verdict unique pour un événement : la langue détectée et son admission.
 * `allowed` peut être calculé une fois par run puis passé en paramètre.
 */
export function languageVerdict(
	title: string,
	summary: string | null | undefined,
	allowed: ReadonlySet<Language> = configuredLanguages(),
): LanguageVerdict {
	const detection = detectLanguage(`${title ?? ""} ${summary ?? ""}`);
	return { ...detection, keep: allowed.has(detection.language) };
}

// ---------------------------------------------------------------------------
// Pertinence cyber : score 0–10 et porte configurable.
//
// Deux besoins distincts : dire si un item entre dans le radar (porte binaire)
// et dire combien il est cyber (score conservé sur l'événement). Un seul
// moteur répond aux deux : la porte est le score comparé à un seuil.
// Les termes forts suffisent seuls ; les termes ambigus (« attaque »,
// « virus », « menace ») ne s'additionnent jamais entre eux.
//
// Configuration (aucune dépendance, aucun fichier à déployer) :
//   RADAR_CYBER_KEYWORDS   termes supplémentaires, séparés par des virgules ;
//   RADAR_CYBER_EXCLUSIONS phrases qui annulent un score faible ;
//   RADAR_CYBER_MIN_SCORE  seuil entier 1–10 (défaut 2).
// Une configuration vide ou invalide retombe sur les valeurs sûres et
// expose les entrées rejetées dans `warnings`.
// ---------------------------------------------------------------------------

/** Motif du verdict de pertinence. */
export type PertinenceReason = "keyword" | "org" | "epss" | "dept" | "excluded" | "none";

/** Règle de couverture ayant fait passer l'item, le cas échéant. */
export type PertinenceRule = "org" | "epss" | "dept" | null;

export interface RelevanceConfig {
	/** Lexique actif : intégré + ajouts de configuration, dédupliqué. */
	keywords: readonly string[];
	/** Phrases dont la présence annule un score uniquement faible. */
	exclusions: readonly string[];
	/** Score minimal d'admission (1–10). */
	minScore: number;
	/** Entrées de configuration rejetées, pour le journal de run. */
	warnings: readonly string[];
}

export interface PertinenceMatch {
	term: string;
	field: "title" | "summary" | "url";
	weight: number;
}

export interface PertinenceVerdict {
	/** Score entier borné à 0–10. 0 : aucun signal ou exclusion. */
	score: number;
	threshold: number;
	relevant: boolean;
	reason: PertinenceReason;
	rule: PertinenceRule;
	matches: readonly PertinenceMatch[];
	exclusion: string | null;
}

/** Organisation telle que consommée par la porte, sans dépendance de cycle. */
export interface PertinenceOrg {
	name: string;
	slug?: string | null;
	domain?: string | null;
	assets?: string[];
}

/** 4 : cyber certain, 2 : contexte technique, 1 : vocabulaire ambigu. */
const CYBER_WEIGHTS: Readonly<Record<string, number>> = {
	// 4 — la mention suffit, quel que soit le reste du texte
	cyberattaque: 4, "cyber attaque": 4, "cyber-attaque": 4, ransomware: 4, rançongiciel: 4,
	"fuite de données": 4, "violation de données": 4, "data breach": 4, breach: 4,
	vulnérabilité: 4, vulnerabilite: 4, vulnerabilities: 4, vulnerability: 4,
	"zero-day": 4, zeroday: 4, "zero day": 4, "cve-": 4, exploit: 4, exploited: 4,
	malware: 4, maliciel: 4, phishing: 4, hameçonnage: 4, "spear phishing": 4,
	compromission: 4, compromised: 4, intrusion: 4, piratage: 4, "data leak": 4,
	ddos: 4, botnet: 4, exfiltration: 4, "ransomware attack": 4, backdoor: 4,
	"porte dérobée": 4, "threat actor": 4, "apt group": 4, rootkit: 4,
	// 2 — contexte cyber explicite, insuffisant seul au seuil par défaut
	cyber: 2, cybersécurité: 2, cybercriminalité: 2, cybersecurity: 2, "sécurité informatique": 2,
	"security advisory": 2, "patch tuesday": 2, "identifiants volés": 2,
	"cheval de troie": 2, "faille de sécurité": 2, faille: 2, flaw: 2,
	"données personnelles": 2, "personal data": 2, "compromised credentials": 2,
	anssi: 2, cnil: 2, "cert-fr": 2, "security incident": 2, "data protection": 2,
	"infractions numériques": 2, "attaque informatique": 2, "incident informatique": 2,
	// 1 — ambigu : jamais admis seul, ne s'additionne pas
	attaque: 1, attacks: 1, attack: 1, menace: 1, threat: 1, threats: 1,
	virus: 1, incident: 1, sécurité: 1, security: 1, pirates: 1, hacker: 1,
	hackers: 1, rançon: 1, "revendiqué par": 1, apt: 1,
};

/** Lexique historique, conservé pour que la configuration reste compatible. */
export const CYBER_KEYWORDS: readonly string[] = [
	"cyberattaque", "cyber-attaque", "ransomware", "rançongiciel", "fuite de données",
	"violation de données", "vulnérabilité", "faille", "CVE-", "zero-day", "phishing",
	"hameçonnage", "DDoS", "ANSSI", "CNIL", "compromis", "intrusion", "piratage",
	"rançon", "données personnelles", "sécurité informatique", "maliciel",
	"cheval de troie", "exfiltration", "APT", "botnet", "serveur compromis",
	"identifiants volés", "revendication",
];

const MAX_TERMS = 64;
const MAX_TERM_LENGTH = 80;

/** Casse et accents tombent ; la ponctuation reste pour la détection des codes. */
function normalizeCyber(value: string): string {
	return String(value ?? "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.trim();
}

function termKey(value: string): string {
	return normalizeCyber(value).replace(/\s+/g, " ");
}

const cyberPatternCache = new Map<string, RegExp>();

/** Mot entier pour un terme alphanumérique, sous-chaîne pour un préfixe (CVE-…). */
function containsCyberTerm(hay: string, term: string): boolean {
	const needle = termKey(term);
	if (!needle) return false;
	if (!/^[a-z0-9].*[a-z0-9]$/.test(needle)) return hay.includes(needle);
	let re = cyberPatternCache.get(needle);
	if (!re) {
		const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
		// « cyberattaques », « failles » : le pluriel simple est toléré, pas
		// la conjugaison ni les dérivés.
		const pluriel = needle.length >= 4 && /[a-z]$/.test(needle) && !/s$/.test(needle) ? "s?" : "";
		re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${pluriel}(?![\\p{L}\\p{N}])`, "iu");
		if (cyberPatternCache.size < 512) cyberPatternCache.set(needle, re);
	}
	return re.test(hay);
}

function parseCyberTerms(raw: string | undefined, label: string, warnings: string[]): string[] {
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

/** Charge la configuration pure : aucun accès réseau ni base. */
export function loadRelevanceConfig(env: NodeJS.ProcessEnv = process.env): RelevanceConfig {
	const warnings: string[] = [];
	const keywords = new Map<string, string>();
	for (const term of [...CYBER_KEYWORDS, ...Object.keys(CYBER_WEIGHTS)]) {
		keywords.set(termKey(term), term);
	}
	for (const term of parseCyberTerms(env.RADAR_CYBER_KEYWORDS, "RADAR_CYBER_KEYWORDS", warnings)) {
		const key = termKey(term);
		if (!keywords.has(key)) keywords.set(key, term);
	}
	const exclusions = parseCyberTerms(env.RADAR_CYBER_EXCLUSIONS, "RADAR_CYBER_EXCLUSIONS", warnings);
	const rawMin = String(env.RADAR_CYBER_MIN_SCORE ?? "").trim();
	const parsedMin = Number(rawMin);
	let minScore = 2;
	if (rawMin !== "") {
		if (Number.isInteger(parsedMin) && parsedMin >= 1 && parsedMin <= 10) minScore = parsedMin;
		else warnings.push(`RADAR_CYBER_MIN_SCORE: valeur invalide (${rawMin}), seuil 2 conservé`);
	}
	return { keywords: [...keywords.values()], exclusions, minScore, warnings };
}

let cachedRelevanceConfig: RelevanceConfig | null = null;

/** Configuration courante, chargée une seule fois par processus. */
export function currentRelevanceConfig(): RelevanceConfig {
	cachedRelevanceConfig ??= loadRelevanceConfig();
	return cachedRelevanceConfig;
}

const CYBER_WEIGHT_BY_KEY: Readonly<Record<string, number>> = Object.fromEntries(
	Object.entries(CYBER_WEIGHTS).map(([term, weight]) => [termKey(term), weight]),
);

/** Poids d'un terme : intégré, ou 2 pour un ajout de configuration. */
function cyberWeight(term: string): number {
	return CYBER_WEIGHT_BY_KEY[termKey(term)] ?? 2;
}

export interface PertinenceInput {
	title?: string | null;
	summary?: string | null;
	url?: string | null;
	sourceUrl?: string | null;
}

export interface EvaluatePertinenceOptions {
	orgs?: readonly PertinenceOrg[];
	ignoreDomains?: readonly string[];
	config?: RelevanceConfig;
	/** Règle (a) : CVE du texte dont le score EPSS dépasse le seuil. */
	epss?: { cve: string; score: number } | null;
	/** Règle (b) : département ou préfecture cité dans le texte. */
	department?: boolean;
}

/** Nom d'organisation qui désigne réellement quelqu'un, pas une catégorie. */
function nomProprePertinence(name: string): boolean {
	return name
		.split(/\s+/)
		.some((token) => token.length > 2
			&& !MOTS_GENERIQUES.has(token)
			&& !MOTS_GENERIQUES_ENTREPRISE.has(token)
			&& !/^\d+$/.test(token));
}

/**
 * Verdict complet : score, motif, matches et règle de couverture.
 * Les entrées mal formées sont tolérées : un collecteur qui livre un nombre
 * à la place d'un titre ne doit jamais faire tomber la porte.
 */
export function evaluatePertinence(
	item: PertinenceInput,
	opts: EvaluatePertinenceOptions = {},
): PertinenceVerdict {
	const config = opts.config ?? currentRelevanceConfig();
	const title = String(item?.title ?? "");
	const summary = String(item?.summary ?? "");
	const url = [item?.url, item?.sourceUrl].filter(Boolean).map(String).join(" ");
	const hayTitle = normalizeCyber(title);
	const haySummary = normalizeCyber(summary);
	const hayUrl = normalizeCyber(url);
	const matches: PertinenceMatch[] = [];
	const seenTerms = new Set<string>();

	for (const term of config.keywords) {
		const key = termKey(term);
		if (seenTerms.has(key)) continue;
		const weight = cyberWeight(term);
		if (containsCyberTerm(hayTitle, term)) {
			matches.push({ term, field: "title", weight });
			seenTerms.add(key);
		} else if (containsCyberTerm(haySummary, term)) {
			matches.push({ term, field: "summary", weight: Math.max(1, weight - 1) });
			seenTerms.add(key);
		} else if (weight >= 2 && containsCyberTerm(hayUrl, term)) {
			// L'URL porte surtout le nom du média : indice faible, plafonné à 1.
			matches.push({ term, field: "url", weight: 1 });
			seenTerms.add(key);
		}
	}

	const ignored = (opts.ignoreDomains ?? []).map((d) => String(d).toLowerCase().trim()).filter(Boolean);
	const isSelfDomain = (dom: string): boolean =>
		ignored.some((host) => host === dom || host.endsWith(`.${dom}`) || dom.endsWith(`.${host}`));
	const hayText = normalizeCyber(`${title} ${summary}`);
	let orgMatch: string | null = null;
	for (const org of opts.orgs ?? []) {
		const name = normalizeCyber(String(org?.name ?? ""))
			.replace(/\b(sarl|sas|sa|eurl|sci|scp|association|groupe|group)\b/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		if (name.length >= 4 && nomProprePertinence(name) && containsCyberTerm(hayText, name)) {
			orgMatch = org.name;
			matches.push({ term: org.name, field: "title", weight: 3 });
			break;
		}
		const domains = [org.domain, ...(org.assets ?? [])].filter(Boolean).map(String);
		const found = domains.find((d) => {
			const dom = d.toLowerCase().trim();
			return dom !== "" && !isSelfDomain(dom) && hayText.includes(dom);
		});
		if (found) {
			orgMatch = found;
			matches.push({ term: found, field: "title", weight: 2 });
			break;
		}
	}

	// Le meilleur signal compte ; les signaux moyens s'ajoutent dans une limite ;
	// les signaux faibles (weight 1) ne s'additionnent jamais.
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

	// Une exclusion ne neutralise qu'un score faible : un signal fort ou une
	// organisation nommée reste admissible (« virus » dans « virus informatique »).
	let exclusion: string | null = null;
	if (score < 4) {
		for (const term of config.exclusions) {
			if (containsCyberTerm(hayTitle, term) || containsCyberTerm(haySummary, term)) {
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

/** Score d'un événement déjà admis : même moteur, sans porte. */
export function scoreEventPertinence(item: PertinenceInput): { score: number; rule: PertinenceRule } {
	const verdict = evaluatePertinence(item);
	return { score: verdict.score, rule: verdict.rule };
}
