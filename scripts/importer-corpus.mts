/**
 * Importe le corpus versionné (`bench/corpus/*.jsonl`) dans Radar Cyber.
 *
 * Deux familles de lignes, reconnues par leur forme (pas par le seul nom de
 * fichier) :
 *
 *   - source   : `{nom|name|source, url|url_flux, famille|family, …}` — une
 *     source à collecter, inscrite dans `source` sous `corpus:<slug>` ;
 *   - incident : `{organisation, titre|groupe, url, date_publication|date, …}`
 *     — un incident cité par le corpus, inscrit dans `event` sous la clé
 *     stable `corpus:incident:<slug>`. Son éditeur devient une source
 *     `corpus:editeur:<slug>` (aucun éditeur n'est inventé : l'URL retenue est
 *     celle de l'article, vérifiée).
 *
 * Chaque ligne est validée : JSON, schéma, URL http(s) joignable (GET, réponse
 * 200 et corps non blanc), absence de doublon (identifiant stable et URL
 * normalisée). Les rejets sont journalisés avec un code et un motif dans un
 * rapport Markdown lisible, produit même sans écriture en base.
 *
 * Rien n'est écrit en base sans `--appliquer`. Les insertions utilisent des
 * clés naturelles et `ON CONFLICT` : deux exécutions laissent exactement les
 * mêmes lignes. Les métadonnées des sources déjà présentes sont rafraîchies,
 * jamais leur état `enabled`.
 *
 * Usage :
 *   tsx scripts/importer-corpus.mts                          # rapport seul
 *   tsx scripts/importer-corpus.mts --appliquer              # rapport + écriture
 *   tsx scripts/importer-corpus.mts --dir /tmp/corpus --appliquer \
 *       --journal /tmp/rejets.md --concurrence 4
 *
 * `--apply` est un alias de `--appliquer`. `--no-probe` remplace la sonde
 * réseau par la preuve HTTP déclarée dans la ligne (utile hors ligne).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CHEMIN_CORPUS = fileURLToPath(new URL("../bench/corpus/", import.meta.url));
export const JOURNAL_DEFAUT = fileURLToPath(new URL("../bench/results/import-corpus-rejets.md", import.meta.url));

const USER_AGENT = "RadarCyberCorpusImport/1.0";
const SAMPLE_BYTES = 64 * 1024;
const CONCURRENCE_DEFAUT = 8;
const TIMEOUT_DEFAUT_MS = 10_000;

/** Motifs de rejet, stables et triables. */
export type Motif =
	| "json_invalide"
	| "schema_inconnu"
	| "champ_manquant"
	| "champ_invalide"
	| "url_invalide"
	| "url_morte"
	| "doublon"
	| "desactive";

export type TypeEntree = "source" | "incident";

export interface Sondage {
	ok: boolean;
	statut: number | null;
	octets: number;
	detail: string;
}

export type Sonde = (url: string) => Promise<Sondage>;

/** Champs canoniques extraits d'une ligne, déjà normalisés. */
export interface DonneesSource {
	type: "source";
	nom: string;
	url: string;
	famille: string;
	format: string;
	kind: string;
	license: string | null;
	description: string | null;
	departement: string | null;
	/** Preuve HTTP déclarée dans la ligne, utilisée par `--no-probe`. */
	preuveStatut: number | null;
}

export interface DonneesIncident {
	type: "incident";
	organisation: string;
	titre: string;
	url: string;
	famille: string;
	typeBrut: string;
	editeur: string;
	departement: string | null;
	datePublication: string | null;
	dateIncident: string | null;
	observedAt: string | null;
	validAt: string | null;
	collectedAt: string | null;
	confiance: string | null;
	assertionType: string;
	extrait: string | null;
	resume: string | null;
	groupe: string | null;
	verifieLe: string | null;
	idEditeur: string;
	nomEditeur: string;
	urlEditeur: string;
}

export interface Entree {
	fichier: string;
	ligne: number;
	type: TypeEntree | null;
	id: string;
	nom: string;
	url: string;
	donnees: DonneesSource | DonneesIncident | null;
	verdict: "valide" | "rejete";
	motif: Motif | null;
	detail: string;
	statut: number | null;
	octets: number;
}

export interface Analyse {
	dossier: string;
	fichiers: string[];
	entrees: Entree[];
	valides: Entree[];
	rejets: Entree[];
	compteurs: {
		total: number;
		sources: number;
		incidents: number;
		sourcesValides: number;
		incidentsValides: number;
		valides: number;
		rejetes: number;
	};
}

export interface Bilan {
	sourcesInserees: number;
	sourcesMisesAJour: number;
	editeursInserees: number;
	incidentsInserees: number;
}

export interface OptionsAnalyse {
	dir?: string;
	/** Sonde injectable (tests). `null` : se fier à la preuve déclarée. */
	probe?: Sonde | null;
	concurrence?: number;
	timeoutMs?: number;
}

export interface OptionsLigne {
	apply: boolean;
	dir: string;
	journal: string;
	concurrence: number;
	timeoutMs: number;
	noProbe: boolean;
}

type RecordBrut = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Utilitaires de lecture et de normalisation
// ---------------------------------------------------------------------------

export function usage(): string {
	return [
		"Usage : tsx scripts/importer-corpus.mts [--appliquer] [options]",
		"  --appliquer        écrit en base (alias : --apply) ; défaut : rapport seul",
		"  --dir <dossier>    dossier à lire (défaut : bench/corpus)",
		"  --journal <fichier> rapport des rejets (défaut : bench/results/import-corpus-rejets.md)",
		"  --concurrence <n>  sondes HTTP simultanées (défaut : 8)",
		"  --timeout <ms>     délai par sonde (défaut : 10000)",
		"  --no-probe         utilise la preuve HTTP déclarée au lieu du réseau",
		"  --help, -h         affiche cette aide",
	].join("\n");
}

export function parseArgs(argv: string[]): OptionsLigne {
	const options: OptionsLigne = {
		apply: false,
		dir: CHEMIN_CORPUS,
		journal: JOURNAL_DEFAUT,
		concurrence: CONCURRENCE_DEFAUT,
		timeoutMs: TIMEOUT_DEFAUT_MS,
		noProbe: false,
	};
	const valeur = (nom: string, i: number): string => {
		const v = argv[i + 1];
		if (v === undefined || v.startsWith("--")) throw new Error(`${nom} attend une valeur`);
		return v;
	};
	const entier = (nom: string, brut: string): number => {
		if (!/^\d+$/.test(brut) || !Number.isSafeInteger(Number(brut)) || Number(brut) < 1) {
			throw new Error(`${nom} doit être un entier positif : ${brut}`);
		}
		return Number(brut);
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--appliquer" || arg === "--apply") options.apply = true;
		else if (arg === "--dry-run") options.apply = false;
		else if (arg === "--no-probe") options.noProbe = true;
		else if (arg === "--dir") options.dir = valeur(arg, i++);
		else if (arg === "--journal") options.journal = valeur(arg, i++);
		else if (arg === "--concurrence") options.concurrence = entier(arg, valeur(arg, i++));
		else if (arg === "--timeout") options.timeoutMs = entier(arg, valeur(arg, i++));
		else if (arg === "--help" || arg === "-h") {
			process.stdout.write(`${usage()}\n`);
			process.exit(0);
		} else throw new Error(`argument inconnu : ${arg}`);
	}
	return options;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function texte(record: RecordBrut, noms: string[]): string | null {
	for (const nom of noms) {
		const valeur = record[nom];
		if (typeof valeur === "string" && valeur.trim() !== "") return valeur.trim();
	}
	return null;
}

function urlValide(valeur: string): boolean {
	try {
		const parsed = new URL(valeur);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function urlNormalee(valeur: string): string {
	try {
		const url = new URL(valeur);
		return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "")}${url.search}`;
	} catch {
		return valeur.trim().toLowerCase();
	}
}

function dateValide(valeur: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(valeur) && !Number.isNaN(Date.parse(`${valeur}T00:00:00Z`));
}

function slug(valeur: string): string {
	return valeur
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/^corpus:(source|incident|editeur):/i, "")
		.replace(/^corpus:/i, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 96)
		.replace(/-+$/g, "");
}

function empreinte(valeur: string): string {
	return createHash("sha256").update(valeur, "utf8").digest("hex").slice(0, 16);
}

function hote(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "source-sans-hote";
	}
}

function infererFamille(haystack: string): string {
	const valeur = haystack.toLowerCase();
	if (/ransom|leak|breach|exfiltr|fuite/.test(valeur)) return "ransomware";
	if (/cve|nvd|vulnerab|faiblesse/.test(valeur)) return "vuln";
	if (/phish|hame[cç]on|escroquerie/.test(valeur)) return "phishing";
	if (/malware|bazaar|botnet|feodo|threatfox/.test(valeur)) return "malware";
	if (/cyber\.gouv\.fr|cert\.ssi\.gouv\.fr|cert-fr/.test(valeur)) return "cert_fr";
	if (/cert|ct log|crt\.sh|transparence/.test(valeur)) return "cert";
	if (/blocklist|blacklist|spamhaus|réputation|reputation/.test(valeur)) return "reputation";
	if (/presse|journal|news|actualit/.test(valeur)) return "presse";
	return "cti";
}

/** Familles d'événements déjà présentes en base : pas de vocabulaire neuf. */
function familleEvenement(typeBrut: string): string {
	const valeur = typeBrut.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
	if (/ransom|lockbit|monti|ransomhub|qilin|nova|dragonforce|xp95|gentlemen|krybit/.test(valeur)) return "ransomware";
	if (/fuite|leak|exfiltr|donnees? vol/.test(valeur)) return "leaks";
	if (/phish|hame[cç]on|escroquerie/.test(valeur)) return "phishing";
	return "cti";
}

function formatUrl(url: string): string {
	if (/\.csv(\?|$)/i.test(url) || /\.txt(\?|$)/i.test(url) || /blocklist|blacklist/i.test(url)) return "txt";
	if (/\.json(\?|$)/i.test(url) || /\/api\//i.test(url)) return "json";
	return "rss";
}

function preuveStatut(record: RecordBrut, preuve: unknown): number | null {
	for (const source of [preuve, record]) {
		if (source === null || typeof source !== "object" || Array.isArray(source)) continue;
		const r = source as RecordBrut;
		const valeur = r.http_status ?? r.statut ?? r.flux_http;
		if (typeof valeur === "number" && Number.isFinite(valeur)) return valeur;
		if (typeof valeur === "string" && /^\d+$/.test(valeur.trim())) return Number(valeur.trim());
	}
	return null;
}

function rejet(fichier: string, ligne: number, motif: Motif, detail: string, id = "—", url = "—"): Entree {
	return {
		fichier,
		ligne,
		type: null,
		id,
		nom: "—",
		url,
		donnees: null,
		verdict: "rejete",
		motif,
		detail,
		statut: null,
		octets: 0,
	};
}

// ---------------------------------------------------------------------------
// Interprétation d'une ligne
// ---------------------------------------------------------------------------

export function interpreterLigne(raw: string, fichier: string, numero: number): Entree {
	if (raw.trim() === "" || raw.trimStart().startsWith("#")) {
		return rejet(fichier, numero, "champ_invalide", "ligne vide ou commentaire");
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
	} catch (error) {
		return rejet(fichier, numero, "json_invalide", message(error));
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return rejet(fichier, numero, "schema_inconnu", "un objet JSON est attendu");
	}
	const r = parsed as RecordBrut;

	const aIncident = typeof r.organisation === "string" && (
		typeof r.titre === "string" || typeof r.groupe === "string" ||
		typeof r.date_publication === "string" || typeof r.date === "string"
	);
	const aSource = !aIncident && (
		"url_flux" in r || "flux_http" in r || "preuve" in r || "proof" in r ||
		"famille" in r || "family" in r || "http_status" in r ||
		(typeof r.nom === "string" && "url" in r) ||
		(typeof r.name === "string" && "url" in r)
	);
	const indiceNom = basename(fichier);
	const forme = aIncident ? "incident" : aSource ? "source" :
		/^incidents?-|^ransomware-/.test(indiceNom) ? "incident" :
		/^sources?-/.test(indiceNom) ? "source" : null;

	if (forme === null) {
		return rejet(fichier, numero, "schema_inconnu", "ni source ni incident reconnu (champs organisation/titre ou nom/url attendus)");
	}
	if (aIncident && aSource) {
		return rejet(fichier, numero, "schema_inconnu", "la ligne mélange les schémas source et incident");
	}
	return forme === "source" ? interpreterSource(r, fichier, numero) : interpreterIncident(r, fichier, numero);
}

function interpreterSource(r: RecordBrut, fichier: string, numero: number): Entree {
	const url = texte(r, ["url", "url_flux"]) ?? "";
	const nom = texte(r, ["nom", "name", "source", "title"]) ?? hote(url);
	const brutId = texte(r, ["id", "slug"]) ?? nom;
	const identifiant = `corpus:${slug(brutId)}`;
	const base: Entree = {
		fichier,
		ligne: numero,
		type: "source",
		id: identifiant,
		nom,
		url,
		donnees: null,
		verdict: "valide",
		motif: null,
		detail: "",
		statut: null,
		octets: 0,
	};
	if (slug(brutId) === "") {
		return { ...base, verdict: "rejete", motif: "champ_invalide", detail: "identifiant impossible à normaliser" };
	}
	if (!urlValide(url)) {
		return { ...base, verdict: "rejete", motif: "url_invalide", detail: "URL absente ou protocole autre que http(s)" };
	}
	if (r.enabled === false || r.actif === false) {
		return { ...base, verdict: "rejete", motif: "desactive", detail: "source désactivée dans le corpus" };
	}
	const format = (texte(r, ["format"]) ?? formatUrl(url)).toLowerCase();
	const preuve = r.preuve ?? r.proof ?? null;
	const departement = texte(r, ["departement", "dept"]);
	const source: DonneesSource = {
		type: "source",
		nom,
		url,
		famille: texte(r, ["famille", "family"]) ?? infererFamille(`${nom} ${url}`),
		format,
		kind: texte(r, ["kind"]) ?? (format === "txt" ? "indicator" : "narrative"),
		license: texte(r, ["license", "licence"]),
		description: texte(r, ["description", "note"]) ?? (departement ? `Source du corpus — ${departement}` : null),
		departement,
		preuveStatut: preuveStatut(r, preuve),
	};
	return { ...base, donnees: source };
}

function interpreterIncident(r: RecordBrut, fichier: string, numero: number): Entree {
	const organisation = texte(r, ["organisation", "entite"]) ?? "";
	const url = texte(r, ["url"]) ?? "";
	const brutId = texte(r, ["id", "slug"]);
	const identifiant = `corpus:incident:${brutId ? slug(brutId) : empreinte(`${organisation}|${url}|${String(r.date ?? r.date_publication ?? "")}`)}`;
	const base: Entree = {
		fichier,
		ligne: numero,
		type: "incident",
		id: identifiant,
		nom: organisation,
		url,
		donnees: null,
		verdict: "valide",
		motif: null,
		detail: "",
		statut: null,
		octets: 0,
	};
	if (organisation === "") {
		return { ...base, verdict: "rejete", motif: "champ_manquant", detail: "organisation absente" };
	}
	if (!urlValide(url)) {
		return { ...base, verdict: "rejete", motif: "url_invalide", detail: "URL de preuve absente ou protocole autre que http(s)" };
	}

	const datePublication = texte(r, ["date_publication", "datePublique"]);
	const dateIncident = texte(r, ["date_incident", "dateIncident"]);
	const dateSimple = texte(r, ["date"]);
	for (const [nom, valeur] of [["date_publication", datePublication], ["date_incident", dateIncident], ["date", dateSimple]] as const) {
		if (valeur !== null && !dateValide(valeur)) {
			return { ...base, verdict: "rejete", motif: "champ_invalide", detail: `${nom} « ${valeur} » n'est pas une date ISO (AAAA-MM-JJ)` };
		}
	}
	if (datePublication !== null && dateIncident !== null && dateIncident > datePublication) {
		return { ...base, verdict: "rejete", motif: "champ_invalide", detail: "date_incident postérieure à date_publication" };
	}
	const confiance = texte(r, ["confiance"]);
	if (confiance !== null && !["etabli", "rapporte", "declare"].includes(confiance)) {
		return { ...base, verdict: "rejete", motif: "champ_invalide", detail: `confiance « ${confiance} » inconnue (etabli|rapporte|declare)` };
	}

	const groupe = texte(r, ["groupe"]);
	const titre = texte(r, ["titre", "title"]) ?? (groupe ? `Revendication ${groupe} — ${organisation}` : organisation);
	const typeBrut = texte(r, ["type"]) ?? groupe ?? "autre";
	const editeur = texte(r, ["source", "editeur"]) ?? hote(url);
	const verifieLe = texte(r, ["verifie_le", "verified_at"]);
	const donnees: DonneesIncident = {
		type: "incident",
		organisation,
		titre,
		url,
		famille: familleEvenement(typeBrut),
		typeBrut,
		editeur,
		departement: texte(r, ["departement", "dept"]),
		datePublication: datePublication ?? dateSimple,
		dateIncident,
		observedAt: dateIncident ?? datePublication ?? dateSimple,
		validAt: datePublication ?? dateSimple,
		collectedAt: verifieLe,
		confiance: confiance ?? (groupe ? "rapporte" : null),
		assertionType: confiance === "etabli" ? "confirmed_incident" : "third_party_claim",
		extrait: texte(r, ["extrait", "citation"]),
		resume: texte(r, ["resume", "résumé", "summary"]),
		groupe,
		verifieLe,
		idEditeur: `corpus:editeur:${slug(editeur)}`,
		nomEditeur: editeur,
		urlEditeur: url,
	};
	return { ...base, donnees };
}

// ---------------------------------------------------------------------------
// Lecture, sondes HTTP, doublons
// ---------------------------------------------------------------------------

async function lireFichiers(dir: string): Promise<{ fichiers: string[]; brutes: { fichier: string; numero: number; raw: string }[] }> {
	let noms: string[];
	try {
		noms = await readdir(dir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return { fichiers: [], brutes: [] };
		throw error;
	}
	const fichiers = noms.filter((nom) => nom.endsWith(".jsonl")).sort();
	const brutes: { fichier: string; numero: number; raw: string }[] = [];
	for (const nom of fichiers) {
		const contenu = await readFile(join(dir, nom), "utf8");
		const lignes = contenu.split(/\r?\n/);
		for (let i = 0; i < lignes.length; i++) {
			if (lignes[i].trim() === "" || lignes[i].trimStart().startsWith("#")) continue;
			brutes.push({ fichier: nom, numero: i + 1, raw: lignes[i] });
		}
	}
	return { fichiers, brutes };
}

/** GET borné : 200 et au moins un octet non blanc. Le corps n'est pas stocké. */
export async function sonderUrl(url: string, timeoutMs = TIMEOUT_DEFAUT_MS): Promise<Sondage> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, {
			method: "GET",
			headers: { "user-agent": USER_AGENT, accept: "*/*" },
			redirect: "follow",
			signal: controller.signal,
		});
		if (response.status !== 200) {
			await response.body?.cancel().catch(() => {});
			return { ok: false, statut: response.status, octets: 0, detail: `HTTP ${response.status}` };
		}
		if (response.body === null) return { ok: false, statut: 200, octets: 0, detail: "corps absent" };
		const reader = response.body.getReader();
		let octets = 0;
		let nonBlanc = false;
		try {
			while (octets < SAMPLE_BYTES) {
				const { done, value } = await reader.read();
				if (done) break;
				octets += value.byteLength;
				if (value.some((octet) => octet !== 0x09 && octet !== 0x0a && octet !== 0x0d && octet !== 0x20)) {
					nonBlanc = true;
					break;
				}
			}
		} finally {
			await reader.cancel().catch(() => {});
		}
		return nonBlanc
			? { ok: true, statut: 200, octets, detail: "HTTP 200 · contenu non vide" }
			: { ok: false, statut: 200, octets, detail: "corps vide ou uniquement blanc" };
	} catch (error) {
		return {
			ok: false,
			statut: null,
			octets: 0,
			detail: controller.signal.aborted ? `délai de ${String(timeoutMs)} ms dépassé` : message(error),
		};
	} finally {
		clearTimeout(timer);
	}
}

async function sonderTout(entrees: Entree[], sonde: Sonde, concurrence: number): Promise<void> {
	let curseur = 0;
	const travailleurs = Array.from({ length: Math.min(concurrence, entrees.length) }, async () => {
		for (;;) {
			const index = curseur++;
			if (index >= entrees.length) return;
			const entree = entrees[index];
			const resultat = await sonde(entree.url);
			entree.statut = resultat.statut;
			entree.octets = resultat.octets;
			if (!resultat.ok) {
				entree.verdict = "rejete";
				entree.motif = "url_morte";
				entree.detail = resultat.detail;
			} else {
				entree.detail = resultat.detail;
			}
		}
	});
	await Promise.all(travailleurs);
}

/** Analyse complète : lecture, validation, doublons et sondes HTTP. */
export async function analyserCorpus(options: OptionsAnalyse = {}): Promise<Analyse> {
	const dir = options.dir ?? CHEMIN_CORPUS;
	const concurrence = options.concurrence ?? CONCURRENCE_DEFAUT;
	const timeoutMs = options.timeoutMs ?? TIMEOUT_DEFAUT_MS;
	const { fichiers, brutes } = await lireFichiers(dir);
	const entrees = brutes.map(({ fichier, numero, raw }) => interpreterLigne(raw, fichier, numero));

	const ids = new Map<string, Entree>();
	const urls = new Map<string, Entree>();
	const aSonder: Entree[] = [];
	for (const entree of entrees) {
		if (entree.verdict !== "valide" || entree.donnees === null) continue;
		const cleUrl = `${entree.donnees.type}:${urlNormalee(entree.url)}`;
		const doublonId = ids.get(entree.id);
		const doublonUrl = urls.get(cleUrl);
		const premier = doublonId ?? doublonUrl;
		if (premier) {
			entree.verdict = "rejete";
			entree.motif = "doublon";
			entree.detail = `déjà retenu ${premier.fichier}:${premier.ligne} (${doublonId ? "identifiant" : "URL"})`;
			continue;
		}
		ids.set(entree.id, entree);
		urls.set(cleUrl, entree);
		aSonder.push(entree);
	}

	if (options.probe === null) {
		for (const entree of aSonder) {
			const statut = entree.donnees?.type === "source" ? entree.donnees.preuveStatut : null;
			entree.statut = statut;
			if (statut !== null && statut !== 200) {
				entree.verdict = "rejete";
				entree.motif = "url_morte";
				entree.detail = `preuve déclarée : HTTP ${statut}`;
			} else {
				entree.detail = statut === 200 ? "preuve déclarée : HTTP 200" : "preuve HTTP absente";
			}
		}
	} else {
		await sonderTout(aSonder, options.probe ?? ((url) => sonderUrl(url, timeoutMs)), concurrence);
	}

	const valides = entrees.filter((entree) => entree.verdict === "valide");
	const rejets = entrees.filter((entree) => entree.verdict === "rejete");
	const sourcesValides = valides.filter((e) => e.donnees?.type === "source").length;
	return {
		dossier: dir,
		fichiers,
		entrees,
		valides,
		rejets,
		compteurs: {
			total: entrees.length,
			sources: entrees.filter((e) => e.type === "source").length,
			incidents: entrees.filter((e) => e.type === "incident").length,
			sourcesValides,
			incidentsValides: valides.length - sourcesValides,
			valides: valides.length,
			rejetes: rejets.length,
		},
	};
}

// ---------------------------------------------------------------------------
// Journal et rapport
// ---------------------------------------------------------------------------

function echapper(valeur: string): string {
	return valeur.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Journal Markdown des rejets : fichier, ligne, identifiant, motif, détail. */
export function formatJournal(analyse: Analyse): string {
	const lignes = [
		"# Rejets — import du corpus",
		"",
		`- Généré le : ${new Date().toISOString()}`,
		`- Dossier : \`${analyse.dossier}\``,
		`- Lignes lues : ${String(analyse.compteurs.total)}`,
		`- Acceptées : ${String(analyse.compteurs.valides)}`,
		`- Rejetées : ${String(analyse.compteurs.rejetes)}`,
		"",
	];
	if (analyse.rejets.length === 0) {
		lignes.push("Aucun rejet.", "");
		return lignes.join("\n");
	}
	const parMotif = new Map<string, number>();
	for (const rejet of analyse.rejets) parMotif.set(rejet.motif ?? "?", (parMotif.get(rejet.motif ?? "?") ?? 0) + 1);
	lignes.push("## Motifs", "");
	for (const [motif, nombre] of [...parMotif].sort((a, b) => b[1] - a[1])) {
		lignes.push(`- \`${motif}\` : ${String(nombre)}`);
	}
	lignes.push("", "## Détail", "", "| Fichier | Ligne | Identifiant | Motif | URL | Détail |", "| --- | ---: | --- | --- | --- | --- |");
	for (const rejet of analyse.rejets) {
		lignes.push(`| ${echapper(rejet.fichier)} | ${String(rejet.ligne)} | ${echapper(rejet.id)} | \`${rejet.motif ?? "?"}\` | ${echapper(rejet.url)} | ${echapper(rejet.detail)} |`);
	}
	lignes.push("");
	return lignes.join("\n");
}

export async function ecrireJournal(analyse: Analyse, chemin: string): Promise<void> {
	await mkdir(dirname(chemin), { recursive: true });
	await writeFile(chemin, formatJournal(analyse), "utf8");
}

export function formatRapport(analyse: Analyse, bilan: Bilan | null, options?: OptionsLigne): string {
	const c = analyse.compteurs;
	const lignes = [
		`IMPORT CORPUS — ${bilan ? "APPLICATION" : "RAPPORT (aucune écriture)"}`,
		`${String(analyse.fichiers.length)} fichier(s) · ${String(c.total)} ligne(s) · ${String(c.sources)} déclarations de source · ${String(c.incidents)} incidents`,
		`acceptées : ${String(c.valides)} (${String(c.sourcesValides)} sources, ${String(c.incidentsValides)} incidents) · rejetées : ${String(c.rejetes)}`,
		"",
	];
	if (bilan) {
		lignes.push(
			"Écritures :",
			`  sources déclarées : ${String(bilan.sourcesInserees)} insérée(s), ${String(bilan.sourcesMisesAJour)} mise(s) à jour`,
			`  éditeurs d'incidents : ${String(bilan.editeursInserees)} inséré(s)`,
			`  incidents : ${String(bilan.incidentsInserees)} inséré(s)`,
			"",
		);
	}
	if (analyse.rejets.length > 0) {
		lignes.push("REJETS", `  ${"fichier:ligne".padEnd(34)} ${"motif".padEnd(16)} identifiant — détail`);
		for (const rejet of analyse.rejets) {
			lignes.push(`  ${`${rejet.fichier}:${rejet.ligne}`.padEnd(34)} ${(rejet.motif ?? "?").padEnd(16)} ${rejet.id} — ${rejet.detail}`);
		}
		lignes.push("");
	}
	if (options?.journal) lignes.push(`Journal des rejets : ${options.journal}`);
	if (!bilan) lignes.push("Relancer avec --appliquer pour écrire en base.");
	return `${lignes.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Écriture en base — clés naturelles, donc idempotente
// ---------------------------------------------------------------------------

export async function importer(analyse: Analyse): Promise<Bilan> {
	const { withTransaction } = await import("../apps/api/src/db.js");
	const entreesSources = analyse.valides.filter((e) => e.donnees?.type === "source");
	const entreesIncidents = analyse.valides.filter((e) => e.donnees?.type === "incident");

	// Un éditeur par corpus d'incidents : son URL est un article vérifié, jamais
	// une homepage supposée. La première occurrence gagne (ordre des fichiers).
	const editeurs = new Map<string, { id: string; nom: string; url: string }>();
	for (const entree of entreesIncidents) {
		const donnees = entree.donnees as DonneesIncident;
		if (!editeurs.has(donnees.idEditeur)) {
			editeurs.set(donnees.idEditeur, { id: donnees.idEditeur, nom: donnees.nomEditeur, url: donnees.urlEditeur });
		}
	}

	return withTransaction(async (client) => {
		let sourcesInserees = 0;
		let editeursInserees = 0;
		let sourcesMisesAJour = 0;

		const ecrireSource = async (
			id: string,
			nom: string,
			famille: string,
			url: string,
			description: string | null,
			license: string | null,
			format: string,
			kind: string,
			parser: Record<string, unknown>,
		): Promise<boolean> => {
			const res = await client.query<{ inserted: boolean }>(
				`INSERT INTO source (id, name, family, url, license, kind, format, parser, description)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 ON CONFLICT (id) DO UPDATE SET
				   name = EXCLUDED.name,
				   family = EXCLUDED.family,
				   url = EXCLUDED.url,
				   license = EXCLUDED.license,
				   kind = EXCLUDED.kind,
				   format = EXCLUDED.format,
				   parser = EXCLUDED.parser,
				   description = EXCLUDED.description
				 RETURNING (xmax = 0) AS inserted`,
				[id, nom, famille, url, license, kind, format, JSON.stringify(parser), description],
			);
			const inseree = res.rows[0]?.inserted === true;
			if (inseree) sourcesInserees++;
			else sourcesMisesAJour++;
			return inseree;
		};

		for (const entree of entreesSources) {
			const donnees = entree.donnees as DonneesSource;
			await ecrireSource(
				entree.id,
				donnees.nom,
				donnees.famille,
				donnees.url,
				donnees.description,
				donnees.license,
				donnees.format,
				donnees.kind,
				{ corpus: { fichier: entree.fichier, ligne: entree.ligne, type: "source" } },
			);
		}
		for (const editeur of editeurs.values()) {
			const insere = await ecrireSource(
				editeur.id,
				editeur.nom,
				"presse",
				editeur.url,
				"Éditeur déclaré par le corpus d'incidents",
				null,
				"rss",
				"narrative",
				{ corpus: { type: "editeur_incidents" } },
			);
			if (insere) editeursInserees++;
		}

		let incidentsInserees = 0;
		for (const entree of entreesIncidents) {
			const d = entree.donnees as DonneesIncident;
			const confiance = d.confiance === "etabli" ? "A1" : d.confiance === "declare" ? "C3" : "B2";
			const res = await client.query<{ inserted: boolean }>(
				`INSERT INTO event (
				   dedup_key, family, assertion_type, title, summary, langue,
				   observed_at, valid_at, at, collected_at, severity, confidence,
				   source_id, source_url, evidence, geo_type
				 ) VALUES (
				   $1, $2, $3, $4, $5, 'fr',
				   $6, $7, COALESCE($8, now()), COALESCE($9, now()), 3, $10,
				   $11, $12, $13, 'entity_location'
				 )
				 ON CONFLICT (dedup_key) DO NOTHING
				 RETURNING (xmax = 0) AS inserted`,
				[
					entree.id,
					d.famille,
					d.assertionType,
					d.titre,
					d.resume,
					d.observedAt ? `${d.observedAt}T00:00:00Z` : null,
					d.validAt ? `${d.validAt}T00:00:00Z` : null,
					d.collectedAt && dateValide(d.collectedAt) ? `${d.collectedAt}T00:00:00Z` : null,
					d.collectedAt && dateValide(d.collectedAt) ? `${d.collectedAt}T00:00:00Z` : null,
					confiance,
					d.idEditeur,
					d.url,
					JSON.stringify({
						corpus: { fichier: entree.fichier, ligne: entree.ligne, id: entree.id },
						organisation: d.organisation,
						departement: d.departement,
						type: d.typeBrut,
						groupe: d.groupe,
						confiance: d.confiance,
						extrait: d.extrait,
						verifie_le: d.verifieLe,
						http: { statut: entree.statut, octets: entree.octets },
					}),
				],
			);
			if (res.rows[0]?.inserted === true) incidentsInserees++;
		}
		return {
			sourcesInserees,
			sourcesMisesAJour,
			editeursInserees,
			incidentsInserees,
		};
	});
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function estLanceDirectement(): boolean {
	const entre = process.argv[1];
	return entre !== undefined && import.meta.url === pathToFileURL(entre).href;
}

if (estLanceDirectement()) {
	const options = parseArgs(process.argv.slice(2));
	let fermer: (() => Promise<void>) | null = null;
	try {
		const analyse = await analyserCorpus({
			dir: options.dir,
			probe: options.noProbe ? null : undefined,
			concurrence: options.concurrence,
			timeoutMs: options.timeoutMs,
		});
		await ecrireJournal(analyse, options.journal);
		let bilan: Bilan | null = null;
		if (options.apply) {
			bilan = await importer(analyse);
			const { closePools } = await import("../apps/api/src/db.js");
			fermer = closePools;
		}
		process.stdout.write(formatRapport(analyse, bilan, options));
	} catch (error) {
		process.stderr.write(`importer-corpus: ${message(error)}\n`);
		process.exitCode = 1;
	} finally {
		if (fermer) await fermer();
	}
}
