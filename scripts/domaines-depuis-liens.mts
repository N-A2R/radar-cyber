#!/usr/bin/env -S npx tsx
/**
 * Domaines d'organisation **extraits des liens déjà collectés**, sans deviner.
 *
 * Usage :
 *   RADAR_PG_API_TIMEOUT_MS=60000 \
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     apps/api/node_modules/.bin/tsx scripts/domaines-depuis-liens.mts [--appliquer] [--limite=N]
 *
 *   … --piste2 [--piste2-limite=100]     test de l'API recherche-entreprises
 *   … --sans-http                       diagnostic rapide, aucune écriture
 *
 * Piste 1 (défaut) :
 *   - lit chaque `event` (titre, résumé HTML, `source_url`, `evidence`) ;
 *   - extrait les domaines des liens présents (ancres `<a href>`, URL source,
 *     segments base64url des redirections Google News, texte libre) ;
 *   - normalise en domaine racine (`www.`, port, chemin, `www.` retirés) ;
 *   - rapproche chaque domaine d'une organisation **déjà citée dans le même
 *     événement** (`org_id`, nom entier, alias, ou jeton distinctif partagé
 *     avec le domaine et présent dans le texte) ; un nom complet départage
 *     les variantes, une égalité de score reste écartée ;
 *   - vérifie HTTP 200 + cohérence stricte (le site doit mentionner le nom de
 *     l'org, pas seulement un alias homonyme ou un jeton détaché) ;
 *   - publie 50 rattachements contrôlables, répartis entre les racines ;
 *   - écrit dans `org_enrichissement` (source `lien-article`) la preuve
 *     article + URL testée, uniquement avec `--appliquer`.
 *
 * Aucune valeur n'est inventée : un domaine est écarté sans HTTP 200 ou sans
 * nom d'org dans la page. Les échecs sont comptés, pas cachés.
 *
 * Piste 2 (`--piste2`) : mesure l'API publique recherche-entreprises sur un
 * échantillon dédupliqué (raison sociale + département). Aucune écriture.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { closePools, query, withTransaction } from "../apps/api/src/db.js";
import { normalizeDomainValue } from "../apps/api/src/match/domaine.js";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const appliquer = args.includes("--appliquer");
const piste2 = args.includes("--piste2");
const sansHttp = args.includes("--sans-http");

function valeurArg(nom: string, defaut: number): number {
	const prefixe = `--${nom}=`;
	const arg = args.find((a) => a.startsWith(prefixe));
	if (!arg) return defaut;
	const n = Number(arg.slice(prefixe.length));
	if (!Number.isFinite(n) || n <= 0) {
		console.error(`valeur invalide pour --${nom} : ${arg}`);
		process.exit(1);
	}
	return Math.floor(n);
}

const limite = valeurArg("limite", 0);
const limitePiste2 = valeurArg("piste2-limite", 100);
const jsonArg = args.find((a) => a.startsWith("--json="));
const sortieJson = jsonArg
	? jsonArg.slice("--json=".length)
	: piste2
		? "bench/results/piste2-api-entreprises.json"
		: "bench/results/domaines-depuis-liens.json";

const inconnu = args.find(
	(a) =>
		!["--appliquer", "--piste2", "--sans-http", "-h", "--help"].includes(a) &&
		!a.startsWith("--limite=") &&
		!a.startsWith("--piste2-limite=") &&
		!a.startsWith("--json="),
);
if (inconnu) {
	console.error(`argument inconnu : ${inconnu}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Normalisation des textes et des domaines
// ---------------------------------------------------------------------------

/** Minuscules sans accents, tout caractère non alphanumérique remplacé par une espace. */
export function normaliser(texte: string | null | undefined): string {
	return (texte ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/\s+/g, " ");
}

/** Texte HTML → texte lisible (scripts/styles retirés, entités décodées). */
export function texteDepuisHtml(html: string): string {
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&#x27;/gi, "'")
		.replace(/&#(\d+);/g, (_m, n: string) => {
			const code = Number(n);
			return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
		});
}

/**
 * Suffixes publics composés : sans cette table, `a.gouv.fr` deviendrait un
 * domaine racine `gouv.fr` et se rattacherait à n'importe quelle institution.
 */
const SUFFIXES_PUBLICS = new Set([
	"gouv.fr", "asso.fr", "ac.fr", "edu.fr", "com.fr", "net.fr", "org.fr",
	"co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk",
	"com.br", "net.br", "org.br", "gov.br", "art.br", "blog.br",
	"com.au", "net.au", "org.au", "edu.au", "gov.au", "id.au",
	"com.ng", "org.ng", "gov.ng", "net.ng", "edu.ng",
	"co.nz", "net.nz", "org.nz", "govt.nz", "ac.nz",
	"co.za", "org.za", "gov.za", "net.za",
	"co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp", "com.jp",
	"com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr",
	"com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
	"com.tw", "org.tw", "net.tw", "gov.tw", "edu.tw",
	"com.hk", "org.hk", "net.hk", "gov.hk", "edu.hk",
	"com.sg", "org.sg", "net.sg", "gov.sg", "edu.sg",
	"com.mx", "org.mx", "gob.mx", "net.mx", "edu.mx",
	"com.ar", "org.ar", "gob.ar", "net.ar", "edu.ar",
	"com.pe", "org.pe", "gob.pe", "net.pe", "edu.pe",
	"com.co", "org.co", "gov.co", "net.co", "edu.co",
	"co.in", "org.in", "gov.in", "net.in", "edu.in",
	"co.kr", "or.kr", "go.kr", "net.kr", "ac.kr",
	"com.ua", "org.ua", "gov.ua", "net.ua", "edu.ua",
	"com.vn", "org.vn", "gov.vn", "net.vn", "edu.vn",
	"com.ph", "org.ph", "gov.ph", "net.ph", "edu.ph",
	"com.ec", "org.ec", "gob.ec", "net.ec", "edu.ec",
	"com.pa", "org.pa", "gob.pa", "net.pa", "edu.pa",
	"com.uy", "org.uy", "gub.uy", "net.uy", "edu.uy",
	"co.th", "or.th", "go.th", "net.th", "ac.th",
	"com.my", "org.my", "gov.my", "net.my", "edu.my",
	"co.id", "or.id", "go.id", "net.id", "ac.id",
	"com.pk", "org.pk", "gov.pk", "net.pk", "edu.pk",
	"com.bd", "org.bd", "gov.bd", "net.bd", "edu.bd",
	"co.ke", "or.ke", "go.ke", "net.ke", "ac.ke",
	"co.mz", "org.mz", "gov.mz", "net.mz", "edu.mz",
	"com.eg", "org.eg", "gov.eg", "net.eg", "edu.eg",
	"com.sa", "org.sa", "gov.sa", "net.sa", "edu.sa",
	"com.ae", "org.ae", "gov.ae", "net.ae", "ac.ae",
]);

/** Domaine racine enregistrable ; `null` si la valeur n'en est pas un. */
export function racineDe(valeur: string | null | undefined): string | null {
	const domaine = normalizeDomainValue(valeur);
	if (!domaine) return null;
	const suffixes = domaine.split(".");
	if (suffixes.length < 2) return null;
	const deux = suffixes.slice(-2).join(".");
	const largeur = SUFFIXES_PUBLICS.has(deux) ? 3 : 2;
	if (suffixes.length < largeur) return null; // `gouv.fr` seul n'est pas une org
	const racine = suffixes.slice(-largeur).join(".");
	return racine === deux && largeur === 3 ? null : racine;
}

/** TLD retenus pour la lecture d'un texte libre (pas `.json`, `.html`, si.`. */
const TLD_TEXTE = [
	"gouv.fr", "asso.fr", "ac.fr", "edu.fr", "co.uk", "org.uk", "com.br",
	"com.au", "co.jp", "co.nz", "com.tr", "com.ng",
	"fr", "com", "org", "net", "eu", "io", "ai", "me", "uk", "be", "ch",
	"de", "es", "it", "nl", "ie", "lu", "pt", "pl", "ro", "se", "no", "dk",
	"fi", "cz", "sk", "hu", "gr", "at", "ca", "us", "br", "mx", "ar", "cl",
	"co", "info", "biz", "us", "ca", "in", "jp", "cn", "kr", "tw", "hk",
	"sg", "my", "id", "th", "vn", "ph", "pk", "bd", "ng", "ke", "mz", "za",
	"tr", "ru", "ua", "app", "dev", "cloud", "online", "site", "tech",
] as const;

const TLD_ALT = [...new Set(TLD_TEXTE)]
	.sort((a, b) => b.length - a.length)
	.map((t) => t.replace(/\./g, "\\."))
	.join("|");

/** Domaine nu dans un texte libre. */
const DOMAINE_DANS_TEXTE = new RegExp(
	`(?:^|[^a-z0-9.-])((?:[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?\\.)+(?:${TLD_ALT}))(?=$|[^a-z0-9-])`,
	"gi",
);

/**
 * Hôtes et racines qui hébergent des citations ou des services, jamais le
 * site officiel de l'organisation citée. Une URL sur ces hôtes n'apporte
 * aucun domaine d'organisation.
 */
const RACINES_EXCLUES = new Set([
	// agrégateurs et plateformes
	"github.com", "gitlab.com", "bitbucket.org", "raw.githubusercontent.com",
	"gist.github.com", "ransomware.live", "ransomlook.io", "ransomwatch",
	"t.me", "telegram.me", "telegram.org", "twitter.com", "x.com",
	"reddit.com", "youtube.com", "youtu.be", "facebook.com", "instagram.com",
	"linkedin.com", "tiktok.com", "discord.com", "discord.gg", "mastodon.social",
	"haveibeenpwned.com", "pastebin.com", "ddosecrets.org", "dehashed.com",
	// presse et médias qui citent (pas l'org citée)
	"news.google.com", "google.com", "google.fr", "bing.com", "duckduckgo.com",
	"news.ycombinator.com", "medium.com", "substack.com", "wordpress.com",
	"blogspot.com", "wixsite.com", "weebly.com", "squarespace.com", "shopify.com",
	"wikipedia.org", "wikimedia.org", "archive.org", "web.archive.org",
	// éditeurs et flux de vulnérabilités
	"nvd.nist.gov", "nist.gov", "cve.org", "mitre.org", "cisa.gov",
	"cert.org", "cert.cyber.gouv.fr", "cyber.gouv.fr", "cert.pl", "cert.at",
	"circl.lu", "ncsc.nl", "ncsc.gov.uk", "enisa.europa.eu", "europa.eu",
	"elastic.co", "amazon.com", "aws.amazon.com", "microsoft.com", "apple.com",
	"cisco.com", "oracle.com", "adobe.com", "vmware.com", "fortinet.com",
	"qualys.com", "tenable.com", "sans.org", "sans.edu", "exploit-db.com",
	"packetstormsecurity.com", "seclists.org", "securityfocus.com",
	"infosecurity-magazine.com", "welivesecurity.com", "securityaffairs.com",
	"hackread.com", "bleepingcomputer.com", "thehackernews.com",
	"cybersecuritydive.com", "databreaches.net", "krebsonsecurity.com",
	"therecord.media", "cyberscoop.com", "zdnet.com", "cnet.com",
	"lemonde.fr", "lefigaro.fr", "lesechos.fr", "numerama.com", "clubic.com",
	"01net.com", "zdnet.fr", "actu.fr", "ouest-france.fr", "sudouest.fr",
	"ladepeche.fr", "leparisien.fr", "francetvinfo.fr", "bfmtv.com",
	"itsecurityguru.org", "helpnetsecurity.com", "darkreading.com",
	// messageries et fournisseurs grand public
	"gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
	"live.com", "aol.com", "icloud.com", "orange.fr", "free.fr", "laposte.net",
	"wanadoo.fr", "sfr.fr", "numericable.fr", "bouyguestelecom.fr",
	"protonmail.com", "proton.me", "gmx.com", "yandex.com", "zoho.com",
]);

/**
 * Jetons trop génériques pour fonder un rapprochement domaine ↔ organisation.
 * Les exclure évite que `services.com` s'attache à n'importe quel « Services ».
 */
const JETONS_GENERIQUES = new Set([
	"france", "french", "francais", "groupe", "group", "holding", "capital",
	"service", "services", "conseil", "conseils", "consulting", "company",
	"compagnie", "societe", "society", "corp", "corporation", "inc", "ltd",
	"gmbh", "sarl", "sas", "sasu", "eurl", "sa", "snc", "scop", "association",
	"fondation", "institut", "institute", "centre", "center", "maison",
	"mairie", "ville", "commune", "communaute", "departement", "region",
	"agglomeration", "metropole", "district", "canton", "prefecture",
	"system", "systems", "systemes", "technology", "technologies", "tech",
	"digital", "solution", "solutions", "software", "logiciel", "logiciels",
	"network", "networks", "reseau", "reseaux", "media", "medias", "press",
	"news", "journal", "magazine", "blog", "web", "online", "internet",
	"cyber", "security", "securite", "secure", "data", "cloud", "hosting",
	"global", "international", "world", "worldwide", "europe", "european",
	"industry", "industries", "industrie", "industriel", "energy", "energie",
	"health", "sante", "medical", "medecine", "bank", "banque", "assurance",
	"mutuelle", "ecole", "school", "universite", "university", "college",
	"hotel", "restaurant", "pharmacie", "clinique", "hopital", "transport",
	"transports", "logistique", "logistics", "immobilier", "realestate",
	"construction", "travaux", "batiment", "sport", "sports", "culture",
	"tourisme", "tourism", "marketing", "communication", "partners", "partner",
	"invest", "investment", "finance", "financial", "comptable", "comptabilite",
	"avocat", "avocats", "notaire", "notaires", "architecte", "architectes",
	"agence", "agency", "studio", "design", "creation", "art", "arts",
	"energie", "eaux", "water", "food", "alimentaire", "commerce", "market",
	"store", "shop", "boutique", "vente", "sales", "distribution",
	"administration", "public", "prive", "private", "national", "regional",
	"municipal", "federal", "state", "city", "town", "village", "county",
	"academy", "academie", "campus", "formation", "training", "education",
	"recherche", "research", "laboratoire", "laboratory", "lab", "labs",
	"fondation", "fund", "trust", "council", "chamber", "federation",
	"federation", "union", "alliance", "club", "team", "teams", "family",
	"famille", "patrimoine", "gestion", "management", "conseil", "expertise",
	"expert", "experts", "ingenierie", "engineering", "industrial",
	"production", "manufacture", "manufacturing", "factory", "usine",
	"automobile", "auto", "moto", "voyage", "voyages", "travel", "airlines",
	"airline", "air", "port", "ports", "maritime", "naval", "rail", "train",
	"societe", "entreprise", "enterprise", "business", "affaires", "commercial",
	"commerciale", "industrielle", "generale", "general", "nouvelle", "nouveau",
	"nouveaux", "premiere", "premier", "grand", "grande", "petit", "petite",
]);

// ---------------------------------------------------------------------------
// Extraction des domaines
// ---------------------------------------------------------------------------

type Origine = "ancre" | "source_url" | "texte";

type DomaineTrouve = { racine: string; origine: Origine };

function decodeBase64url(segment: string): string | null {
	if (segment.length < 12) return null;
	const normalise = segment.replace(/-/g, "+").replace(/_/g, "/");
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalise)) return null;
	const complete = normalise + "=".repeat((4 - (normalise.length % 4)) % 4);
	try {
		const texte = Buffer.from(complete, "base64").toString("utf8");
		if (!texte || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(texte)) return null;
		return texte;
	} catch {
		return null;
	}
}

export function racineAdmissible(racine: string | null): racine is string {
	if (!racine) return false;
	if (RACINES_EXCLUES.has(racine)) return false;
	if (racine.endsWith(".onion")) return false;
	const premiere = racine.split(".")[0] ?? "";
	if (premiere.length < 3) return false;
	if (/^\d+$/.test(premiere)) return false;
	return true;
}

/** Domaines visibles dans un texte libre. */
export function domainesDansTexte(texte: string | null | undefined): Set<string> {
	const trouves = new Set<string>();
	if (!texte) return trouves;
	for (const m of texte.matchAll(DOMAINE_DANS_TEXTE)) {
		const racine = racineDe(m[1]);
		if (racineAdmissible(racine)) trouves.add(racine);
	}
	return trouves;
}

/** Domaines portés par une URL : hôte + chemin/query (percent ou base64url). */
export function domainesDansUrl(url: string | null | undefined): Set<string> {
	const trouves = new Set<string>();
	if (!url) return trouves;
	let analyse: URL;
	try {
		analyse = new URL(url);
	} catch {
		return trouves;
	}
	const hote = analyse.hostname.toLowerCase().replace(/\.$/, "");
	if (!/^\d+\.\d+\.\d+\.\d+$/.test(hote) && hote !== "localhost") {
		const racine = racineDe(hote);
		if (racineAdmissible(racine)) trouves.add(racine);
	}
	for (const brut of `${analyse.pathname}/${analyse.search}`.split(/[/=&?#]+/)) {
		if (!brut || brut.length < 6) continue;
		const candidats = new Set<string>();
		try {
			candidats.add(decodeURIComponent(brut));
		} catch {
			candidats.add(brut);
		}
		const b64 = decodeBase64url(brut);
		if (b64) candidats.add(b64);
		for (const texte of candidats) {
			for (const racine of domainesDansTexte(texte)) trouves.add(racine);
			// Une URL décodée complète : on lit aussi son hôte.
			if (/^https?:\/\//i.test(texte.trim())) {
				for (const racine of domainesDansUrl(texte.trim())) trouves.add(racine);
			}
		}
	}
	return trouves;
}

/** Toutes les URL `http(s)` d'un texte (couvre les `<a href>`). */
export function urlsDansTexte(texte: string | null | undefined): string[] {
	if (!texte) return [];
	const urls = new Set<string>();
	for (const m of texte.matchAll(/https?:\/\/[^\s"'<>()]+/gi)) {
		const url = m[0].replace(/[.,;:]+$/, "");
		if (url.length <= 2048) urls.add(url);
	}
	return [...urls];
}

type Evenement = {
	id: number;
	org_id: number | null;
	title: string | null;
	summary: string | null;
	source_url: string | null;
	evidence: unknown;
};

function texteEvenement(e: Evenement): string {
	const morceaux: string[] = [];
	if (e.title) morceaux.push(e.title);
	if (e.summary) morceaux.push(texteDepuisHtml(e.summary));
	if (e.evidence) {
		try {
			morceaux.push(JSON.stringify(e.evidence));
		} catch {
			// evidence non sérialisable : ignoré, jamais inventé.
		}
	}
	return morceaux.join(" \n ");
}

/**
 * Texte normalisé servant à prouver qu'une organisation est citée. Les URL
 * sont retirées : `blog.facil.wtf` dans `evidence` n'est pas une mention de
 * l'organisation « FACIL », c'est le domaine que l'on cherche à rattacher.
 */
export function texteSansUrls(texte: string): string {
	return normaliser(texte.replace(/https?:\/\/\S+/gi, " "));
}

export function extraireDomaines(e: Evenement): DomaineTrouve[] {
	const trouves = new Map<string, Origine>();
	const ajouter = (racine: string, origine: Origine) => {
		const precedente = trouves.get(racine);
		const priorite: Record<Origine, number> = { source_url: 3, ancre: 2, texte: 1 };
		if (!precedente || priorite[origine] > priorite[precedente]) trouves.set(racine, origine);
	};

	for (const racine of domainesDansUrl(e.source_url)) ajouter(racine, "source_url");

	const html = [e.summary, e.title].filter(Boolean).join("\n");
	if (html.includes("<a")) {
		for (const url of urlsDansTexte(html)) {
			for (const racine of domainesDansUrl(url)) ajouter(racine, "ancre");
		}
	}
	// Liens en clair dans le texte ou l'evidence (hors URL déjà traitée).
	for (const url of urlsDansTexte(texteEvenement(e))) {
		for (const racine of domainesDansUrl(url)) ajouter(racine, "texte");
	}
	for (const racine of domainesDansTexte(texteDepuisHtml(html))) ajouter(racine, "texte");

	return [...trouves].map(([racine, origine]) => ({ racine, origine }));
}

// ---------------------------------------------------------------------------
// Rapprochement domaine ↔ organisation citée dans le même événement
// ---------------------------------------------------------------------------

export type OrgRow = {
	id: number;
	name: string;
	name_norm: string | null;
	domain: string | null;
};

type AliasRow = { org_id: number; alias: string; nom_normalise: string | null };

/** Jetons distinctifs d'une racine de domaine (`odalys-vacances.com` → odalys, vacances). */
export function jetonsDeRacine(racine: string): string[] {
	const label = racine.split(".")[0] ?? "";
	const morceaux = normaliser(label).split(" ").filter(Boolean);
	const jetons = new Set<string>();
	for (const m of morceaux) {
		if (m.length >= 4 && !JETONS_GENERIQUES.has(m)) jetons.add(m);
	}
	const concat = morceaux.join("");
	if (concat.length >= 5 && !JETONS_GENERIQUES.has(concat) && !/^\d+$/.test(concat)) {
		jetons.add(concat);
	}
	return [...jetons].slice(0, 8);
}

/**
 * Jetons porteurs de la racine : tous les mots distinctifs de l'étiquette.
 * `rfc-editor.org` porte `rfc` et `editor` : l'org « … EDITOR » n'est pas
 * l'éditeur RFC. `content-sync.io` porte `content` et `sync` : l'org « SYNC »
 * n'est pas ce service. Un mot générique (`europe`, `vacances`) est écarté.
 */
export function jetonsPorteursDeRacine(racine: string): string[] {
	const label = racine.split(".")[0] ?? "";
	return [
		...new Set(
			normaliser(label)
				.split(" ")
				.filter((t) => t.length >= 3 && !JETONS_GENERIQUES.has(t) && !/^\d+$/.test(t)),
		),
	];
}

/** Vrai si le nom ou un alias de l'org partage un jeton avec le domaine. */
export function domaineLieAOrg(org: OrgRow, aliases: string[], jetons: string[]): boolean {
	const noms = [org.name_norm ?? normaliser(org.name), ...aliases];
	return jetons.some((jeton) => noms.some((nom) => nom.includes(jeton)));
}

/** Vrai si le nom ou un alias de l'org est cité dans le texte normalisé. */
export function orgCiteeDansTexte(org: OrgRow, aliases: string[], texteNorm: string): boolean {
	const noms = [org.name_norm ?? normaliser(org.name), ...aliases].filter(Boolean);
	const entoure = ` ${texteNorm} `;
	for (const nom of noms) {
		const n = nom.trim();
		if (n.length < 4 || JETONS_GENERIQUES.has(n)) continue;
		if (entoure.includes(` ${n} `)) return true;
	}
	return false;
}

export type Rattachement = { motif: "org_id" | "nom" | "alias" | "jeton"; score: number };

/**
 * Force du rapprochement domaine ↔ organisation. Une organisation peut être
 * citée par son `org_id`, par son nom/alias entier, ou par un jeton distinctif
 * **partagé avec le domaine et effectivement présent dans l'événement**.
 * Le dernier cas élargit la règle sans inventer de lien : un article qui parle
 * de « Microsoft » et contient `microsoft.com` peut rattacher l'org
 * « Microsoft France », mais une org dont le nom ne ressemble pas au domaine
 * reste écartée. Les scores servent à départager les homonymes au lieu de
 * rejeter toute l'ambiguïté (par exemple « Microsoft » vs « Microsoft France »).
 */
export function evaluerRattachement(
	org: OrgRow,
	aliases: string[],
	racine: string,
	orgIdEvenement: number | null,
	texteNorm: string,
): Rattachement | null {
	if (orgIdEvenement === org.id) return { motif: "org_id", score: 100 };
	const noms: Array<{ valeur: string; motif: "nom" | "alias" }> = [
		{ valeur: normaliser(org.name_norm ?? org.name), motif: "nom" as const },
		...aliases.map((alias): { valeur: string; motif: "alias" } => ({ valeur: normaliser(alias), motif: "alias" })),
	].filter((n) => n.valeur.length > 0);
	const porteurs = jetonsPorteursDeRacine(racine);
	if (porteurs.length === 0 || !porteurs.every((p) => noms.some((n) => n.valeur.includes(p)))) {
		return null;
	}
	const jetonsDomaine = jetonsDeRacine(racine);
	const entoure = ` ${texteNorm.trim()} `;
	let meilleur: Rattachement | null = null;
	for (const { valeur: n, motif } of noms) {
		if (n.length < 4 || JETONS_GENERIQUES.has(n)) continue;
		if (entoure.includes(` ${n} `)) {
			const score = motif === "nom" ? 90 : 85;
			if (!meilleur || score > meilleur.score) meilleur = { motif, score };
			continue;
		}
		const jetonsNom = n.split(" ").filter((t) => t.length >= 4 && !JETONS_GENERIQUES.has(t));
		if (jetonsNom.some((t) => jetonsDomaine.includes(t) && entoure.includes(` ${t} `))) {
			const score = motif === "nom" ? 70 : 65;
			if (!meilleur || score > meilleur.score) meilleur = { motif: "jeton", score };
		}
	}
	return meilleur;
}

// ---------------------------------------------------------------------------
// HTTP : 200 + cohérence (le site mentionne le nom de l'org)
// ---------------------------------------------------------------------------

type Page = {
	statut: number | null;
	urlFinale: string;
	texte: string;
	titre: string;
	erreur: string | null;
};

const MAX_OCTETS = 300_000;
const USER_AGENT = "radar-cyber/domain-verifier (enrichissement référentiel; contact: admin@localhost)";

function charsetDepuisContentType(ct: string | null): string {
	const m = (ct ?? "").match(/charset\s*=\s*"?([a-z0-9_-]+)/i);
	if (!m) return "utf-8";
	const c = m[1].toLowerCase();
	if (c === "iso-8859-1" || c === "latin1" || c === "windows-1252") return "windows-1252";
	if (c === "utf8") return "utf-8";
	try {
		new TextDecoder(c);
		return c;
	} catch {
		return "utf-8";
	}
}

async function lireCorps(resp: Response, max: number): Promise<{ buffer: Buffer; charset: string }> {
	const charset = charsetDepuisContentType(resp.headers.get("content-type"));
	if (!resp.body) return { buffer: Buffer.alloc(0), charset };
	const reader = resp.body.getReader();
	const morceaux: Uint8Array[] = [];
	let taille = 0;
	while (taille < max) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		const reste = max - taille;
		morceaux.push(value.byteLength > reste ? value.subarray(0, reste) : value);
		taille += Math.min(value.byteLength, reste);
	}
	reader.cancel().catch(() => {});
	return { buffer: Buffer.concat(morceaux.map((m) => Buffer.from(m))), charset };
}

async function chargerPage(racine: string): Promise<Page> {
	const tentatives = [`https://${racine}/`, `http://${racine}/`];
	let derniere: Page = { statut: null, urlFinale: tentatives[0]!, texte: "", titre: "", erreur: "aucune tentative" };
	for (const url of tentatives) {
		try {
			const resp = await fetch(url, {
				redirect: "follow",
				headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
				signal: AbortSignal.timeout(7_000),
			});
			const { buffer, charset } = await lireCorps(resp, MAX_OCTETS);
			let texte: string;
			try {
				texte = new TextDecoder(charset).decode(buffer);
			} catch {
				texte = buffer.toString("utf8");
			}
			const titre = (texte.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i)?.[1] ?? "").trim();
			derniere = {
				statut: resp.status,
				urlFinale: resp.url || url,
				texte,
				titre,
				erreur: resp.ok ? null : `HTTP ${resp.status}`,
			};
			if (resp.ok) return derniere;
		} catch (error) {
			derniere = {
				statut: null,
				urlFinale: url,
				texte: "",
				titre: "",
				erreur: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "erreur inconnue",
			};
		}
	}
	return derniere;
}

type Coherence = { ok: boolean; score: number; motif: string };

/** Jetons d'un nom qui portent réellement l'identité de l'organisation. */
function jetonsDistinctifs(nomNormalise: string): string[] {
	return [...new Set(
		nomNormalise
			.split(" ")
			.filter((t) => t.length >= 4 && !JETONS_GENERIQUES.has(t)),
	)];
}

/**
 * Le site doit mentionner le nom de l'org, pas seulement un jeton partagé
 * avec un alias ambigu. « SCI GNOME » n'est pas le projet GNOME ; une société
 * qui a « BOSCH » pour alias n'est pas Bosch. Un nom réduit à un seul jeton
 * distinctif (CHROMIUM, IETF…) reste accepté sur ce jeton exact.
 */
export function verifierCoherence(org: OrgRow, aliases: string[], textePage: string): Coherence {
	const page = ` ${normaliser(textePage)} `;
	const nomOrg = normaliser(org.name_norm ?? org.name);
	if (!nomOrg) return { ok: false, score: 0, motif: "aucune-mention" };
	if (page.includes(` ${nomOrg} `)) return { ok: true, score: 0.95, motif: "nom-complet" };

	const jetonsOrg = jetonsDistinctifs(nomOrg);
	const presentsOrg = jetonsOrg.filter((t) => page.includes(` ${t} `));
	if (jetonsOrg.length === 1 && nomOrg === jetonsOrg[0] && presentsOrg.length === 1) {
		return { ok: true, score: 0.9, motif: "nom-jeton-unique" };
	}
	if (jetonsOrg.length >= 2 && presentsOrg.length === jetonsOrg.length) {
		return { ok: true, score: 0.9, motif: "tous-jetons" };
	}
	if (jetonsOrg.length >= 2 && presentsOrg.length >= Math.ceil(jetonsOrg.length * 0.6)) {
		return { ok: true, score: 0.8, motif: "majorite-jetons" };
	}
	for (const alias of aliases) {
		const n = normaliser(alias);
		if (!n || n === nomOrg) continue;
		const jetons = jetonsDistinctifs(n);
		if (jetons.length < 2) continue;
		if (page.includes(` ${n} `)) return { ok: true, score: 0.9, motif: "alias-complet" };
		if (jetons.every((t) => page.includes(` ${t} `))) {
			return { ok: true, score: 0.85, motif: "alias-jetons" };
		}
	}
	return { ok: false, score: 0, motif: "aucune-mention" };
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

async function enParallele<T, R>(items: T[], concurrence: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const resultats = new Array<R>(items.length);
	let suivant = 0;
	const ouvriers = Array.from({ length: Math.min(concurrence, items.length) }, async () => {
		for (;;) {
			const i = suivant++;
			if (i >= items.length) return;
			resultats[i] = await fn(items[i]!, i);
		}
	});
	await Promise.all(ouvriers);
	return resultats;
}

function ecrireRapport(chemin: string, rapport: unknown): void {
	try {
		const absolu = fileURLToPath(new URL(`../${chemin}`, import.meta.url));
		mkdirSync(fileURLToPath(new URL("../bench/results/", import.meta.url)), { recursive: true });
		writeFileSync(absolu, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");
		console.log(`[domaines] rapport JSON : ${chemin}`);
	} catch (error) {
		console.error(`[domaines] impossible d'écrire ${chemin} :`, error instanceof Error ? error.message : error);
	}
}

// ---------------------------------------------------------------------------
// Piste 1
// ---------------------------------------------------------------------------

async function executerPiste1() {
	const debut = Date.now();
	const sqlEvents = `SELECT id, org_id, title, summary, source_url, evidence
	                   FROM event
	                  ORDER BY id${limite ? " LIMIT $1" : ""}`;
	const { rows: evenements } = await query<Evenement>(sqlEvents, limite ? [limite] : []);
	console.error(`[domaines] ${evenements.length} événements lus en ${Date.now() - debut} ms`);

	const parEvenement: Array<{ evenement: Evenement; domaine: DomaineTrouve; texte: string }> = [];
	const racines = new Set<string>();
	let avecDomaine = 0;
	let occurrences = 0;
	const parOrigine: Record<Origine, number> = { ancre: 0, source_url: 0, texte: 0 };

	for (const e of evenements) {
		const domaines = extraireDomaines(e);
		if (domaines.length === 0) continue;
		avecDomaine++;
		occurrences += domaines.length;
		const texteNorm = ` ${texteSansUrls(texteEvenement(e))} `;
		for (const d of domaines) {
			racines.add(d.racine);
			parOrigine[d.origine]++;
			parEvenement.push({ evenement: e, domaine: d, texte: texteNorm });
		}
	}

	// Index des organisations par jeton de domaine (égalité indexée).
	const jetonsParRacine = new Map<string, string[]>();
	for (const racine of racines) jetonsParRacine.set(racine, jetonsDeRacine(racine));
	const tousJetons = [...new Set([...jetonsParRacine.values()].flat())];

	const orgsParJeton = new Map<string, OrgRow[]>();
	const orgParId = new Map<number, OrgRow>();
	if (tousJetons.length > 0) {
		const { rows: orgs } = await query<OrgRow>(
			`SELECT id, name, name_norm, domain FROM org WHERE name_norm = ANY($1)`,
			[tousJetons],
		);
		for (const org of orgs) {
			orgParId.set(org.id, org);
			const nom = org.name_norm ?? normaliser(org.name);
			for (const jeton of tousJetons) {
				if (!nom.includes(jeton)) continue;
				const liste = orgsParJeton.get(jeton);
				if (liste) liste.push(org);
				else orgsParJeton.set(jeton, [org]);
			}
		}
	}

	const idsCandidats = [...new Set([...orgsParJeton.values()].flat().map((o) => o.id))];
	const aliasParOrg = new Map<number, string[]>();
	const ajouterAlias = (orgId: number, nom: string) => {
		if (!nom) return;
		const liste = aliasParOrg.get(orgId);
		if (liste) {
			if (!liste.includes(nom)) liste.push(nom);
		} else aliasParOrg.set(orgId, [nom]);
	};
	// Un alias exactement égal au jeton du domaine suffit aussi : l'org
	// officielle peut ne pas porter ce mot dans sa raison sociale. Recherche
	// indexée (nom_normalise, status), pas de balayage des 1,7 M d'alias.
	const orgsParAliasJeton = new Map<string, number[]>();
	if (tousJetons.length > 0) {
		const { rows: aliasJeton } = await query<AliasRow>(
			`SELECT org_id, alias, nom_normalise FROM org_alias
			  WHERE status = 'active' AND nom_normalise = ANY($1)`,
			[tousJetons],
		);
		const idsManquants = new Set<number>();
		for (const a of aliasJeton) {
			const nom = a.nom_normalise ?? normaliser(a.alias);
			ajouterAlias(a.org_id, nom);
			for (const jeton of tousJetons) {
				if (!nom.includes(jeton)) continue;
				const liste = orgsParAliasJeton.get(jeton);
				if (liste) {
					if (!liste.includes(a.org_id)) liste.push(a.org_id);
				} else orgsParAliasJeton.set(jeton, [a.org_id]);
			}
			if (!orgParId.has(a.org_id)) idsManquants.add(a.org_id);
		}
		if (idsManquants.size > 0) {
			const { rows: orgsAlias } = await query<OrgRow>(
				`SELECT id, name, name_norm, domain FROM org WHERE id = ANY($1)`,
				[[...idsManquants]],
			);
			for (const org of orgsAlias) orgParId.set(org.id, org);
		}
	}
	console.error(`[domaines] index des organisations chargé en ${Date.now() - debut} ms`);

	type Pair = {
		evenementId: number;
		org: OrgRow;
		racine: string;
		origine: Origine;
		articleUrl: string | null;
		coherenceEvent: Rattachement["motif"];
		scoreRattachement: number;
		titreEvenement: string | null;
		extraitEvenement: string;
	};

	const pairs: Pair[] = [];
	let ambiguesEvenement = 0;
	let sansOrgCitee = 0;
	let sansCandidat = 0;
	let homonymesDepartages = 0;
	const exemplesAmbigus: Array<{
		racine: string;
		titre: string | null;
		candidats: Array<{ org_id: number; org: string; score: number }>;
	}> = [];

	for (const { evenement, domaine, texte } of parEvenement) {
		const jetons = jetonsParRacine.get(domaine.racine) ?? [];
		const candidats = new Map<number, OrgRow>();
		for (const jeton of jetons) {
			for (const org of orgsParJeton.get(jeton) ?? []) {
				const aliases = aliasParOrg.get(org.id) ?? [];
				if (!domaineLieAOrg(org, aliases, [jeton])) continue;
				candidats.set(org.id, org);
			}
			for (const id of orgsParAliasJeton.get(jeton) ?? []) {
				const org = orgParId.get(id);
				if (org) candidats.set(id, org);
			}
		}
		if (candidats.size === 0) {
			sansCandidat++;
			continue;
		}
		const notes: Array<{ org: OrgRow; rattachement: Rattachement }> = [];
		for (const org of candidats.values()) {
			const rattachement = evaluerRattachement(
				org,
				aliasParOrg.get(org.id) ?? [],
				domaine.racine,
				evenement.org_id,
				texte,
			);
			if (rattachement) notes.push({ org, rattachement });
		}
		if (notes.length === 0) {
			sansOrgCitee++;
			continue;
		}
		const meilleurScore = Math.max(...notes.map((n) => n.rattachement.score));
		const meilleurs = notes.filter((n) => n.rattachement.score === meilleurScore);
		if (new Set(meilleurs.map((n) => n.org.id)).size > 1) {
			ambiguesEvenement++;
			if (exemplesAmbigus.length < 40) {
				exemplesAmbigus.push({
					racine: domaine.racine,
					titre: evenement.title,
					candidats: meilleurs.map((n) => ({
						org_id: n.org.id,
						org: n.org.name,
						score: n.rattachement.score,
					})),
				});
			}
			continue;
		}
		if (notes.length > 1) homonymesDepartages++;
		const retenu = meilleurs[0]!;
		pairs.push({
			evenementId: evenement.id,
			org: retenu.org,
			racine: domaine.racine,
			origine: domaine.origine,
			articleUrl: evenement.source_url,
			coherenceEvent: retenu.rattachement.motif,
			scoreRattachement: retenu.rattachement.score,
			titreEvenement: evenement.title,
			extraitEvenement: texte.trim().slice(0, 220),
		});
	}
	console.error(`[domaines] rapprochement terminé en ${Date.now() - debut} ms`);

	// Cohérence multi-domaines : une org qui reçoit plusieurs domaines distincts
	// dans les liens est ambiguë ; aucun des deux n'est retenu.
	const domainesParOrg = new Map<number, Set<string>>();
	for (const p of pairs) {
		const set = domainesParOrg.get(p.org.id) ?? new Set<string>();
		set.add(p.racine);
		domainesParOrg.set(p.org.id, set);
	}
	let ambiguesOrg = 0;
	const pairsSures = pairs.filter((p) => {
		if ((domainesParOrg.get(p.org.id)?.size ?? 0) > 1) {
			ambiguesOrg++;
			return false;
		}
		return true;
	});
	ambiguesOrg = new Set(pairs.filter((p) => (domainesParOrg.get(p.org.id)?.size ?? 0) > 1).map((p) => p.org.id)).size;

	// ---------------------------------------------------------------------
	// HTTP 200 + cohérence
	// ---------------------------------------------------------------------
	const racinesAValider = [...new Set(pairsSures.map((p) => p.racine))];
	const pages = new Map<string, Page>();
	if (!sansHttp) {
		const resultats = await enParallele(racinesAValider, 12, async (racine) => {
			const page = await chargerPage(racine);
			pages.set(racine, page);
			return { racine, page };
		});
		for (const { racine, page } of resultats) pages.set(racine, page);
	} else {
		for (const racine of racinesAValider) {
			pages.set(racine, { statut: null, urlFinale: `https://${racine}/`, texte: "", titre: "", erreur: "HTTP non testé (--sans-http)" });
		}
	}

	type Valide = Pair & { confiance: number; motifCoherence: string; urlTestee: string; titre: string; statut: number };
	const valides: Valide[] = [];
	const refusHttp = new Map<string, number>();
	const refusCoherence = new Map<string, number>();
	let okHttp = 0;
	for (const p of pairsSures) {
		const page = pages.get(p.racine);
		if (!page) continue;
		if (page.statut !== 200) {
			refusHttp.set(p.racine, page.statut ?? 0);
			continue;
		}
		okHttp++;
		const aliases = aliasParOrg.get(p.org.id) ?? [];
		const coherence = verifierCoherence(p.org, aliases, page.texte);
		if (!coherence.ok) {
			refusCoherence.set(p.racine, coherence.score);
			continue;
		}
		valides.push({
			...p,
			confiance: coherence.score,
			motifCoherence: coherence.motif,
			urlTestee: page.urlFinale,
			titre: page.titre.slice(0, 200),
			statut: page.statut,
		});

	}
	const pairesValidesParRacine = new Map<string, number>();
	const pairesValidesParOrg = new Map<number, { org: string; domaines: Set<string>; paires: number }>();
	for (const v of valides) {
		pairesValidesParRacine.set(v.racine, (pairesValidesParRacine.get(v.racine) ?? 0) + 1);
		const courant = pairesValidesParOrg.get(v.org.id) ?? { org: v.org.name, domaines: new Set<string>(), paires: 0 };
		courant.domaines.add(v.racine);
		courant.paires++;
		pairesValidesParOrg.set(v.org.id, courant);
	}

	// Une seule écriture par org : meilleure confiance, égalité = ambigu.
	const meilleurParOrg = new Map<number, Valide>();
	const egalites = new Set<number>();
	for (const v of valides) {
		const actuel = meilleurParOrg.get(v.org.id);
		if (!actuel) {
			meilleurParOrg.set(v.org.id, v);
		} else if (v.confiance > actuel.confiance) {
			meilleurParOrg.set(v.org.id, v);
			egalites.delete(v.org.id);
		} else if (v.confiance === actuel.confiance && v.racine !== actuel.racine) {
			egalites.add(v.org.id);
		}
	}
	for (const id of egalites) meilleurParOrg.delete(id);

	const aEcrire = [...meilleurParOrg.values()];
	let ecrits = 0;
	let dejaPresents = 0;
	let conflitsDomaine = 0;

	if (appliquer && aEcrire.length > 0) {
		await withTransaction(async (client) => {
			for (const v of aEcrire) {
				if (v.org.domain && racineDe(v.org.domain) !== v.racine) {
					conflitsDomaine++;
					continue;
				}
				const preuve = {
					article_url: v.articleUrl,
					url_testee: v.urlTestee,
					hote: v.racine,
					statut: v.statut,
					titre: v.titre || null,
					motif: `${v.coherenceEvent}+${v.motifCoherence}`,
					org_name: v.org.name,
					event_id: v.evenementId,
					origine: v.origine,
					moteur: "lien-article@2",
				};
				const res = await client.query(
					`INSERT INTO org_enrichissement (org_id, champ, valeur, source, confiance, preuve, verifie_at)
					 VALUES ($1, 'domaine', $2, 'lien-article', $3, $4::jsonb, now())
					 ON CONFLICT (org_id, champ) DO NOTHING`,
					[v.org.id, v.racine, v.confiance, JSON.stringify(preuve)],
				);
				if ((res.rowCount ?? 0) > 0) ecrits++;
				else dejaPresents++;
			}
		});
	}

	// Contrôle manuel reproductible : jusqu'à 50 paires, réparties entre les
	// racines plutôt que prises au début du fichier (qui est dominé par une
	// seule organisation).
	const validesParRacine = new Map<string, Valide[]>();
	for (const v of valides) {
		const liste = validesParRacine.get(v.racine);
		if (liste) liste.push(v);
		else validesParRacine.set(v.racine, [v]);
	}
	const racinesControle = [...validesParRacine.keys()].sort();
	const controle: Valide[] = [];
	for (let i = 0; i < 1000 && controle.length < 50; i++) {
		let ajoute = false;
		for (const racine of racinesControle) {
			const v = validesParRacine.get(racine)?.[i];
			if (!v) continue;
			controle.push(v);
			ajoute = true;
			if (controle.length >= 50) break;
		}
		if (!ajoute) break;
	}

	const dureeMs = Date.now() - debut;
	const rapport = {
		mode: piste2 ? "piste2" : appliquer ? "application" : "rapport (aucune écriture)",
		dureeMs,
		limite: limite || null,
		http: {
			racinesTestees: racinesAValider.length,
			racinesOk200: new Set(valides.map((v) => v.racine)).size,
			pairesOk200: okHttp,
			refus: refusHttp.size,
			sansCoherence: refusCoherence.size,
			exemplesRefusHttp: [...refusHttp.entries()].slice(0, 10).map(([racine, statut]) => ({ racine, statut })),
			exemplesSansCoherence: [...refusCoherence.entries()].slice(0, 10).map(([racine]) => racine),
		},
		validation: {
			pairesValidees: valides.length,
			organisationsRetenues: aEcrire.length,
			egalitesEcartees: egalites.size,
			pairesParRacine: [...pairesValidesParRacine.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 30)
				.map(([racine, paires]) => ({ racine, paires })),
			orgsMultiDomaines: [...pairesValidesParOrg.entries()]
				.filter(([, v]) => v.domaines.size > 1)
				.map(([org_id, v]) => ({ org_id, org: v.org, paires: v.paires, domaines: [...v.domaines] })),
			controle: controle.map((v) => ({
				org_id: v.org.id,
				org: v.org.name,
				domaine: v.racine,
				confiance: v.confiance,
				motif: `${v.coherenceEvent}+${v.motifCoherence}`,
				score_rattachement: v.scoreRattachement,
				titre_page: v.titre,
				titre_evenement: v.titreEvenement,
				extrait_evenement: v.extraitEvenement,
				url_testee: v.urlTestee,
				article_url: v.articleUrl,
				event_id: v.evenementId,
			})),
		},
		lecture: {
			evenementsLus: evenements.length,
			evenementsAvecDomaine: avecDomaine,
			avecSourceUrl: evenements.filter((e) => e.source_url).length,
			avecAncresHtml: evenements.filter((e) => (e.summary ?? "").includes("<a ")).length,
		},
		extraction: {
			occurrences,
			domainessUniques: racines.size,
			parOrigine,
		},
		rapprochement: {
			jetonsDistinctifs: tousJetons.length,
			organisationsCandidates: idsCandidats.length,
			paires: pairs.length,
			pairesSures: pairsSures.length,
			sansCandidat,
			sansOrgCitee,
			homonymesDepartages,
			ambiguesEvenement,
			ambiguesOrganisation: ambiguesOrg,
			exemplesAmbigus,
		},
		ecriture: {
			applique: appliquer,
			ecrits,
			dejaPresents,
			conflitsDomaineExistant: conflitsDomaine,
		},
		echantillon: aEcrire.slice(0, 25).map((v) => ({
			org_id: v.org.id,
			org: v.org.name,
			domaine: v.racine,
			confiance: v.confiance,
			motif: `${v.coherenceEvent}+${v.motifCoherence}`,
			url_testee: v.urlTestee,
			article_url: v.articleUrl,
		})),
	};

	console.log(`[domaines] ${rapport.mode} — ${dureeMs} ms`);
	console.log(
		`[domaines] ${evenements.length} événements lus, ${avecDomaine} portent au moins un domaine ` +
			`(${occurrences} occurrences, ${racines.size} racines uniques)`,
	);
	console.log(
		`[domaines] rapprochement : ${pairs.length} paires, ${pairsSures.length} sûres, ` +
			`${sansOrgCitee} sans org citée, ${ambiguesEvenement} ambiguës (événement), ${ambiguesOrg} ambiguës (org)`,
	);
	console.log(
		`[domaines] HTTP : ${racinesAValider.length} racines testées, ${okHttp} en 200, ` +
			`${refusHttp.size} refus HTTP, ${refusCoherence.size} sans mention du nom`,
	);
	console.log(
		`[domaines] validation : ${valides.length} paires cohérentes → ${aEcrire.length} orgs retenues ; ` +
			`écriture ${appliquer ? `appliquée : ${ecrits} écrits, ${dejaPresents} déjà présents, ${conflitsDomaine} conflits` : "non appliquée (--appliquer pour écrire)"}`,
	);
	for (const v of rapport.echantillon) {
		console.log(
			`  ${String(v.org_id).padStart(8)}  ${v.confiance.toFixed(2)}  ${v.org.slice(0, 34).padEnd(34)} → ${v.domaine}  (${v.motif})`,
		);
	}

	ecrireRapport(sortieJson, rapport);
	console.log(JSON.stringify(rapport));
}

// ---------------------------------------------------------------------------
// Piste 2 — échantillon API recherche-entreprises (aucune écriture)
// ---------------------------------------------------------------------------

type OrgPiste2 = { id: number; siren: string; name: string; code_postal: string | null };

function departement(codePostal: string | null): string {
	const cp = (codePostal ?? "").trim().toUpperCase();
	if (/^2[AB]/.test(cp)) return cp.slice(0, 2);
	if (/^9[78]/.test(cp)) return cp.slice(0, 3);
	return cp.slice(0, 2);
}

async function executerPiste2() {
	const debut = Date.now();
	const { rows: vivier } = await query<OrgPiste2>(
		`SELECT id, siren, name, code_postal
		   FROM org TABLESAMPLE SYSTEM (4)
		  WHERE siren IS NOT NULL AND btrim(siren) <> ''
		    AND (domain IS NULL OR btrim(domain) = '')
		  LIMIT 50000`,
	);
	const vus = new Set<string>();
	const echantillon: OrgPiste2[] = [];
	for (const o of vivier) {
		const cle = `${normaliser(o.name)}#${departement(o.code_postal)}`;
		if (vus.has(cle)) continue;
		vus.add(cle);
		echantillon.push(o);
		if (echantillon.length >= limitePiste2) break;
	}

	type Resultat = {
		siren: string;
		nom: string;
		departement: string;
		ok: boolean;
		statut: number | null;
		site: string | null;
		correspondanceSiren: boolean;
		ms: number;
		erreur: string | null;
	};
	const resultats: Resultat[] = [];
	for (const o of echantillon) {
		const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(o.siren)}&per_page=1`;
		const t0 = performance.now();
		let statut: number | null = null;
		let site: string | null = null;
		let correspondanceSiren = false;
		let ok = false;
		let erreur: string | null = null;
		try {
			const resp = await fetch(url, {
				headers: { accept: "application/json", "user-agent": USER_AGENT },
				signal: AbortSignal.timeout(15_000),
			});
			statut = resp.status;
			if (!resp.ok) {
				erreur = `HTTP ${resp.status}`;
			} else {
				const json = (await resp.json()) as {
					results?: Array<{ siren?: string; site_web?: string | null; siege?: { site_web?: string | null } }>;
				};
				const premier = json.results?.[0];
				correspondanceSiren = premier?.siren === o.siren;
				site = premier?.siege?.site_web ?? premier?.site_web ?? null;
				ok = true;
			}
		} catch (error) {
			erreur = error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 160) : "erreur inconnue";
		}
		resultats.push({
			siren: o.siren,
			nom: o.name,
			departement: departement(o.code_postal),
			ok,
			statut,
			site,
			correspondanceSiren,
			ms: Math.round(performance.now() - t0),
			erreur,
		});
		await new Promise((r) => setTimeout(r, 120)); // politesse : ~8 req/s max
	}

	const reponses200 = resultats.filter((r) => r.ok).length;
	const avecSite = resultats.filter((r) => r.ok && r.site).length;
	const sirenConcordes = resultats.filter((r) => r.correspondanceSiren).length;
	const erreurs = resultats.filter((r) => !r.ok);
	const temps = resultats.map((r) => r.ms);
	const moyenne = temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : 0;
	const triees = [...temps].sort((a, b) => a - b);
	const mediane = triees.length ? triees[Math.floor(triees.length / 2)]! : 0;

	const rapport = {
		mode: "piste2 — échantillon API recherche-entreprises (aucune écriture)",
		dureeMs: Date.now() - debut,
		demande: limitePiste2,
		vivierLu: vivier.length,
		echantillonDeduplique: echantillon.length,
		appels: resultats.length,
		reponses200,
		reponsesAvecSiteWeb: avecSite,
		tauxReponseAvecSite: resultats.length ? Math.round((avecSite / resultats.length) * 1000) / 10 : 0,
		tauxSirenConcorde: resultats.length ? Math.round((sirenConcordes / resultats.length) * 1000) / 10 : 0,
		tempsMs: { moyenne, mediane, min: triees[0] ?? null, max: triees.at(-1) ?? null },
		erreurs: erreurs.length,
		exemplesErreurs: erreurs.slice(0, 10),
		exemplesAvecSite: resultats.filter((r) => r.site).slice(0, 15),
	};

	console.log(`[piste2] ${rapport.mode}`);
	console.log(
		`[piste2] ${echantillon.length} SIREN dédupliqués (raison sociale + département) sur ${vivier.length} lus`,
	);
	console.log(
		`[piste2] ${reponses200} réponses 200 / ${resultats.length} appels, ` +
			`${avecSite} avec site web (${rapport.tauxReponseAvecSite} %), ${erreurs.length} erreurs`,
	);
	console.log(`[piste2] temps par appel : moyenne ${moyenne} ms, médiane ${mediane} ms`);
	console.log(JSON.stringify(rapport));
	ecrireRapport(sortieJson, rapport);
}

// ---------------------------------------------------------------------------
// Entrée
// ---------------------------------------------------------------------------

export async function main(): Promise<void> {
	try {
		if (piste2) await executerPiste2();
		else await executerPiste1();
	} finally {
		await closePools();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	void main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
