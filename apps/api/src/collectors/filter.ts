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
import { ingestQuery } from "../db.js";
import { normalizeText } from "./classify.js";

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
 * Langue d'un événement narratif. `und` (undetermined) évite d'inventer une
 * langue quand le texte ne porte aucun indice — un identifiant CVE, une ligne
 * de tableau ou un titre de deux mots ne sont ni français ni anglais.
 */
export type EventLanguage = "fr" | "en" | "und";

export const EVENT_LANGUAGES: readonly EventLanguage[] = ["fr", "en", "und"];

/** Variable d'environnement du filtre : codes séparés par des virgules. */
export const LANGUAGE_FILTER_ENV = "RADAR_EVENT_LANGUAGES";

/** Mots outils : très fréquents, presque jamais ambigus. Poids 1. */
const FR_STOPWORDS: Record<string, true> = {
	le: true, la: true, les: true, du: true, de: true, des: true, un: true, une: true, et: true,
	est: true, sont: true, etait: true, ete: true, etre: true, en: true, dans: true, sur: true,
	pour: true, avec: true, par: true, au: true, aux: true, ce: true, cet: true, cette: true, ces: true,
	qui: true, que: true, quoi: true, dont: true, ou: true, ne: true, pas: true, se: true, sa: true,
	son: true, ses: true, nous: true, vous: true, ils: true, elles: true, il: true, elle: true,
	leur: true, leurs: true, mon: true, ma: true, mes: true, ton: true, ta: true, tes: true,
	comme: true, mais: true, donc: true, car: true, ni: true, puis: true, sous: true, chez: true,
	entre: true, depuis: true, pendant: true, apres: true, avant: true, vers: true, alors: true,
	ainsi: true, tres: true, bien: true, deja: true, encore: true, sans: true, tout: true, tous: true,
	toute: true, toutes: true, autre: true, autres: true, meme: true, plusieurs: true,
	beaucoup: true, peu: true, selon: true, notre: true, l: true, d: true, qu: true, n: true,
};

const EN_STOPWORDS: Record<string, true> = {
	the: true, and: true, of: true, to: true, in: true, is: true, are: true, was: true, were: true,
	be: true, been: true, being: true, for: true, with: true, on: true, at: true, by: true, from: true,
	as: true, that: true, this: true, these: true, those: true, it: true, its: true, he: true, she: true,
	they: true, them: true, their: true, we: true, us: true, our: true, you: true, your: true,
	his: true, her: true, which: true, who: true, whom: true, whose: true, when: true, where: true,
	why: true, how: true, have: true, has: true, had: true, will: true, would: true, can: true,
	could: true, should: true, may: true, might: true, must: true, not: true, no: true, but: true,
	or: true, if: true, then: true, than: true, so: true, such: true, into: true, over: true,
	under: true, about: true, above: true, below: true, out: true, up: true, down: true, off: true,
	during: true, while: true, because: true, however: true, also: true, more: true, most: true,
	other: true, another: true, some: true, any: true, all: true, each: true, every: true, both: true,
	few: true, many: true, much: true, only: true, own: true, same: true, too: true, very: true,
	just: true, now: true, via: true, per: true, within: true, without: true, upon: true,
	among: true, between: true, through: true, against: true, an: true,
};

/** Vocabulaire cyber / terrain : poids 3, il tranche les textes courts. */
const FR_KEYWORDS: Record<string, true> = {
	attaque: true, attaques: true, attaquant: true, attaquants: true, piratage: true, piratages: true,
	rancongiciel: true, rancongiciels: true, rancon: true, menace: true, menaces: true,
	vulnerabilite: true, vulnerabilites: true, faille: true, failles: true, donnees: true,
	fuite: true, fuites: true, systeme: true, systemes: true, reseau: true, reseaux: true,
	serveur: true, serveurs: true, securite: true, cybersecurite: true, entreprise: true,
	entreprises: true, collectivite: true, collectivites: true, commune: true, communes: true,
	departement: true, departements: true, region: true, regions: true, incident: true,
	incidents: true, logiciel: true, logiciels: true, sauvegarde: true, sauvegardes: true,
	compromission: true, hameconnage: true, escroquerie: true, victime: true, victimes: true,
	enquete: true, gendarmerie: true, signalement: true, alerte: true, alertes: true,
	specialiste: true, numerique: true, informatique: true, utilisateur: true, utilisateurs: true,
	compte: true, comptes: true, application: true, applications: true,
};

const EN_KEYWORDS: Record<string, true> = {
	cyberattack: true, cyberattacks: true, attack: true, attacks: true, attacker: true,
	attackers: true, threat: true, threats: true, vulnerability: true, vulnerabilities: true,
	flaw: true, flaws: true, breach: true, breaches: true, leak: true, leaks: true, leaked: true,
	malware: true, ransomware: true, exploit: true, exploits: true, exploited: true,
	phishing: true, hacking: true, hacker: true, hackers: true, compromised: true, compromise: true,
	data: true, database: true, network: true, networks: true, server: true, servers: true,
	system: true, systems: true, security: true, cybersecurity: true, software: true,
	patch: true, patches: true, credential: true, credentials: true, users: true, user: true,
	account: true, accounts: true, device: true, devices: true, update: true, updates: true,
	digital: true, online: true, disclosed: true, disclosure: true, vulnerable: true,
	malicious: true, payload: true, campaign: true, researchers: true, report: true,
};

const WORD_RE = /[\p{L}\p{N}]+/gu;
const ACCENT_RE = /[àâäçéèêëîïôöùûüÿœæ]/giu;
const KEYWORD_WEIGHT = 3;
const MAX_ACCENT_BONUS = 3;

/**
 * Détecte la langue d'un texte par score de mots outils et de mots-clés.
 * Aucune dépendance : les listes sont embarquées et la normalisation est
 * partagée avec `classify.ts`. Les mots de même forme dans les deux langues
 * (`cyber`, `intrusion`…) ne sont comptés que d'un seul côté, jamais des deux,
 * pour ne pas fausser le score.
 */
export function detectLanguage(text: string): EventLanguage {
	const raw = String(text ?? "");
	if (!raw.trim()) return "und";
	let fr = 0;
	let en = 0;
	for (const token of normalizeText(raw).match(WORD_RE) ?? []) {
		if (FR_STOPWORDS[token] === true) fr++;
		if (EN_STOPWORDS[token] === true) en++;
		if (FR_KEYWORDS[token] === true) fr += KEYWORD_WEIGHT;
		if (EN_KEYWORDS[token] === true) en += KEYWORD_WEIGHT;
	}
	// Un accent est un signal français indépendant de la casse. Plafonné :
	// un seul nom propre accentué ne doit pas décider d'un texte entier.
	fr += Math.min((raw.match(ACCENT_RE) ?? []).length, MAX_ACCENT_BONUS);
	if (fr === en) return "und";
	return fr > en ? "fr" : "en";
}

/**
 * Interprète le filtre de langue. Vide, `*` ou `all` = aucune restriction ;
 * sinon la liste des codes autorisés. Une valeur invalide lève une erreur :
 * une faute de frappe ne doit pas filtrer tout le flux par silence.
 */
export function parseLanguageFilter(raw: string | undefined): Set<EventLanguage> | null {
	const value = String(raw ?? "").trim().toLowerCase();
	if (value === "" || value === "*" || value === "all") return null;
	const allowed = new Set<EventLanguage>();
	for (const code of value.split(",").map((c) => c.trim()).filter(Boolean)) {
		if (!EVENT_LANGUAGES.includes(code as EventLanguage)) {
			throw new Error(`${LANGUAGE_FILTER_ENV} : langue inconnue « ${code} » (attendu : ${EVENT_LANGUAGES.join(", ")})`);
		}
		allowed.add(code as EventLanguage);
	}
	return allowed.size > 0 ? allowed : null;
}

/** Filtre lu dans l'environnement au début d'un run de collecte. */
export function languageFilterFromEnv(env: NodeJS.ProcessEnv = process.env): Set<EventLanguage> | null {
	return parseLanguageFilter(env[LANGUAGE_FILTER_ENV]);
}
