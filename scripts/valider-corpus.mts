#!/usr/bin/env node
/**
 * Validateur unique du corpus : `bench/corpus/*.jsonl`.
 *
 * Chaque URL déclarée est rechargée pour de vrai (redirections suivies,
 * cookies conservés), puis classée en quatre catégories exclusives :
 *
 *   - valide       : réponse exploitable ET au moins un jeton discriminant du
 *                    nom déclaré présent dans le texte renvoyé ;
 *   - morte        : erreur réseau, délai, statut >= 400 ou redirection sans fin ;
 *   - sans contenu : réponse 2xx mais corps vide, page sans texte ou flux sans
 *                    item ;
 *   - incohérente  : réponse exploitable mais aucun jeton attendu n'apparaît.
 *
 * Quand le site bloque (401/403/429, challenge anti-bot, boucle de
 * redirection), la même URL est relue via un lecteur de texte distant
 * (`https://r.jina.ai/` par défaut, configurable par --lecteur ou
 * RADAR_LECTEUR_URL). Le repli est signalé dans le rapport ; il ne transforme
 * jamais un HTTP 404 en succès. Les lignes sans URL (sources exclues par
 * doctrine, références à un fichier local) sont comptées à part, pas tirées au
 * hasard.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/valider-corpus.mts
 *   apps/api/node_modules/.bin/tsx scripts/valider-corpus.mts \
 *     --dir=bench/corpus --json=bench/results/validation-corpus.json \
 *     --concurrence=12 --timeout=10000 --tentatives=3
 *
 * Sortie : tableau par fichier sur stdout + rapport JSON détaillé (par défaut
 * `bench/results/validation-corpus.json`). `--strict` rend un code 1 dès qu'une
 * URL n'est pas valide ; par défaut le diagnostic ne fait pas échouer la
 * commande, il publie les comptes. Aucune base consultée, aucune écriture hors
 * du rapport JSON demandé.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = fileURLToPath(new URL("..", import.meta.url));

export const CATEGORIES = ["valide", "morte", "sans contenu", "incoherent"] as const;
export type Categorie = (typeof CATEGORIES)[number];

export type Entree = {
	fichier: string;
	ligne: number;
	id: string;
	nom: string;
	url: string | null;
	attendus: string[];
};

export type Resultat = {
	fichier: string;
	ligne: number;
	id: string;
	nom: string;
	url: string | null;
	categorie: Categorie;
	statutHttp: number | null;
	urlFinale: string | null;
	octets: number;
	typeContenu: string | null;
	tentatives: number;
	lecteur: string | null;
	erreur: string | null;
	attendus: string[];
	trouves: string[];
	extrait: string;
	dureeMs: number;
};

export type Comptes = {
	lignes: number;
	urls: number;
	valide: number;
	morte: number;
	"sans contenu": number;
	incoherent: number;
	sansUrl: number;
	lecteur: number;
};

export type LigneFichier = Comptes & { fichier: string; taux: number };

export type Rapport = {
	genereLe: string;
	dureeMs: number;
	protocole: {
		repertoire: string;
		timeoutMs: number;
		concurrence: number;
		tentatives: number;
		lecteur: string | null;
		tailleMaxOctets: number;
		criteres: string;
	};
	totaux: Comptes & { fichiers: number; taux: number };
	parFichier: LigneFichier[];
	resultats: Resultat[];
};

export type Options = {
	timeoutMs: number;
	concurrence: number;
	tentatives: number;
	lecteur: string | null;
	tailleMaxOctets: number;
};

export const OPTIONS_DEFAUT: Options = {
	timeoutMs: 10_000,
	concurrence: 12,
	tentatives: 3,
	lecteur: "https://r.jina.ai/",
	tailleMaxOctets: 1_000_000,
};

export type Reponse = {
	statut: number;
	urlFinale: string;
	corps: string;
	octets: number;
	typeContenu: string | null;
	erreur: string | null;
	bloquee: boolean;
};

export type Chargeur = (url: string, signal: AbortSignal) => Promise<Reponse>;

/** Mots trop génériques pour prouver quoi que ce soit. */
const GENERIQUES = new Set(
	`de des du de la le les la un une et au aux sur dans par pour en via avec dont ce cette ces
	son ses leur leurs qui que quoi ou mais car si ne pas plus moins
	ville mairie commune municipal municipale departement region service services centre
	direction office agence etablissement entreprise societe sarl sas association federation
	nationale national union outil gestion plateforme application prestataire editeur
	incident attaque cyberattaque securite donnees personnelles personnes familles
	accompagnement difficultes prevention sante travail interentreprises campus numerique
	nouvelle aquitaine france flux rss atom feed source sources presse site web actualites
	exemple document reference`.trim().split(/\s+/),
);

const NOMS_ENTITES: Record<string, string> = {
	amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "e", egrave: "e",
	agrave: "a", ccedil: "c", ecirc: "e", ugrave: "u", hellip: " ", mdash: " ", ndash: " ",
};

/** Comparaison insensible aux accents, à la casse et à la ponctuation. */
export function normaliser(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function decoderEntite(brut: string): string {
	const entite = brut.toLowerCase();
	if (entite.startsWith("#x") || entite.startsWith("#")) {
		const hex = entite.startsWith("#x");
		const code = Number.parseInt(entite.slice(hex ? 2 : 1), hex ? 16 : 10);
		return Number.isInteger(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
	}
	return NOMS_ENTITES[entite] ?? " ";
}

/** Texte visible : scripts, styles, SVG, commentaires et balises écartés. */
export function texteVisible(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
		.replace(/<svg[\s\S]*?<\/svg>/gi, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_m, entite: string) => decoderEntite(entite))
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Jetons d'identité : assez longs, non génériques, au plus six par entrée. */
export function jetonsAttendus(nom: string): string[] {
	return [...new Set(
		normaliser(nom)
			.split(" ")
			.filter((jeton) => jeton.length >= 3 && !GENERIQUES.has(jeton) && !/^\d+$/.test(jeton)),
	)].slice(0, 6);
}

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
	return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function chaine(objet: Record<string, unknown>, ...cles: string[]): string | null {
	for (const cle of cles) {
		const valeur = objet[cle];
		if (typeof valeur === "string" && valeur.trim()) return valeur.trim();
	}
	return null;
}

/** Première URL http(s) trouvée dans les champs connus du corpus. */
export function extraireUrl(objet: Record<string, unknown>): string | null {
	// Seules les URLs de la source elle-même : un article cité en exemple n'est
	// pas la ressource déclarée par la ligne et ne doit pas être validé à sa place.
	for (const cle of ["url", "url_flux", "acces"]) {
		const valeur = objet[cle];
		if (typeof valeur === "string" && /^https?:\/\//i.test(valeur.trim())) return valeur.trim();
	}
	const preuve = estObjet(objet.preuve) ? objet.preuve : null;
	if (preuve) {
		for (const cle of ["url", "url_finale"]) {
			const valeur = preuve[cle];
			if (typeof valeur === "string" && /^https?:\/\//i.test(valeur.trim())) return valeur.trim();
		}
	}
	return null;
}

/** Fichiers JSONL du répertoire, y compris les fichiers de recherche masqués. */
export function listerCorpus(repertoire: string): string[] {
	return readdirSync(repertoire, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
		.map((e) => e.name)
		.sort((a, b) => a.localeCompare(b, "fr"));
}

export function lireFichier(repertoire: string, fichier: string): Entree[] {
	const brut = readFileSync(resolve(repertoire, fichier), "utf8");
	const entrees: Entree[] = [];
	for (const [i, ligne] of brut.split(/\r?\n/).entries()) {
		if (!ligne.trim()) continue;
		const ob: unknown = (() => {
			try {
				return JSON.parse(ligne);
			} catch {
				return null;
			}
		})();
		if (!estObjet(ob)) {
			// Ligne illisible : aucune URL à recharger, comptée en « sans URL ».
			entrees.push({
				fichier, ligne: i + 1, id: `ligne-${i + 1}`, nom: "JSON invalide", url: null,
				attendus: [],
			});
			continue;
		}
		const url = extraireUrl(ob);
		const nom = chaine(ob, "organisation", "nom", "name", "source", "titre", "id") ?? "";
		entrees.push({
			fichier,
			ligne: i + 1,
			id: chaine(ob, "id") ?? `ligne-${i + 1}`,
			nom,
			url,
			attendus: jetonsAttendus(nom),
		});
	}
	return entrees;
}

function encodeLecteur(url: string, base: string): string {
	return base.endsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

function enTeteFetch(): Record<string, string> {
	return {
		"user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
		accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
		"accept-language": "fr-FR,fr;q=0.9,en;q=0.6",
	};
}

const MOTIFS_BLOCAGE = /just a moment|access denied|attention required|captcha|cf-browser-verification|verifiez que vous etes humain|activer javascript|bot detection|request (?:has been )?blocked|forbidden/i;

/** GET borné, redirections manuelles et cookies accumulés (anti-bot éditeurs). */
export function creerChargeurHttp(options: Options): Chargeur {
	return async (urlDepart, signal) => {
		let url = urlDepart;
		let redirections = 0;
		const cookies = new Map<string, string>();
		while (true) {
			const enTetes = enTeteFetch();
			if (cookies.size) enTetes.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
			const rep = await fetch(url, { redirect: "manual", headers: enTetes, signal });
			for (const brut of rep.headers.getSetCookie()) {
				const couple = brut.split(";")[0] ?? "";
				const i = couple.indexOf("=");
				if (i > 0) cookies.set(couple.slice(0, i).trim(), couple.slice(i + 1).trim());
			}
			if (rep.status >= 300 && rep.status < 400 && rep.headers.get("location")) {
				if (++redirections > 8) {
					return {
						statut: rep.status, urlFinale: url, corps: "", octets: 0,
						typeContenu: rep.headers.get("content-type"),
						erreur: "redirection circulaire", bloquee: true,
					};
				}
				url = new URL(rep.headers.get("location")!, url).toString();
				continue;
			}
			let corps = "";
			let octets = 0;
			if (rep.body) {
				const lecteurFlux = rep.body.getReader();
				const decodeur = new TextDecoder("utf-8");
				while (true) {
					const { done, value } = await lecteurFlux.read();
					if (done) break;
					corps += decodeur.decode(value, { stream: true });
					octets += value.byteLength;
					if (octets >= options.tailleMaxOctets) {
						await lecteurFlux.cancel();
						break;
					}
				}
				if (octets < options.tailleMaxOctets) corps += decodeur.decode();
			}
			const typeContenu = rep.headers.get("content-type");
			// Un widget reCAPTCHA embarqué dans un script n'est PAS un blocage :
			// seuls les statuts d'accès refusé ou une page visible qui ne contient
			// que le challenge doivent déclencher le repli lecteur.
			const visible = texteVisible(corps.slice(0, 8000));
			const bloquee =
				[401, 403, 429].includes(rep.status) ||
				(visible.length < 300 && MOTIFS_BLOCAGE.test(visible));
			return {
				statut: rep.status, urlFinale: rep.url || url, corps, octets,
				typeContenu, erreur: null, bloquee,
			};
		}
	};
}

export const chargeurHttp = creerChargeurHttp(OPTIONS_DEFAUT);

/** Repli lecteur : même URL, texte extrait par le service de lecture. */
export const chargeurLecteur = (base: string): Chargeur => async (url, signal) => {
	const rep = await fetch(encodeLecteur(url, base), {
		redirect: "follow", signal, headers: enTeteFetch(),
	});
	const brut = await rep.text();
	return {
		statut: rep.status,
		urlFinale: rep.url || url,
		corps: brut,
		octets: Buffer.byteLength(brut),
		typeContenu: rep.headers.get("content-type"),
		erreur: rep.ok ? null : `lecteur HTTP ${rep.status}`,
		bloquee: false,
	};
};

function extraireTexte(rep: Reponse): { texte: string; items: number | null } {
	const type = rep.typeContenu ?? "";
	const debut = rep.corps.replace(/^\uFEFF/, "").trimStart();
	const estFlux = /xml|rss|atom/i.test(type) &&
		/^(<\?xml|<rss|<feed|<rdf)/i.test(debut);
	if (estFlux) {
		return {
			texte: texteVisible(debut),
			items: (debut.match(/<(?:item|entry)\b/gi) ?? []).length,
		};
	}
	return { texte: texteVisible(rep.corps), items: null };
}


function extraitAutour(texteNormalise: string, trouves: string[]): string {
	const cible = trouves[0];
	if (!cible) return texteNormalise.slice(0, 200);
	const position = texteNormalise.indexOf(` ${cible} `);
	if (position < 0) return texteNormalise.slice(0, 200);
	const debut = Math.max(0, position - 80);
	return `${debut > 0 ? "…" : ""}${texteNormalise.slice(debut, position + 140)}${
		position + 140 < texteNormalise.length ? "…" : ""
	}`;
}

/** Classification d'une réponse déjà chargée (pure, testable sans réseau). */
export function classer(
	entree: Entree,
	rep: Reponse,
	options: Options,
	tentatives: number,
	lecteur: string | null,
	dureeMs: number,
): Resultat {
	const base: Resultat = {
		fichier: entree.fichier,
		ligne: entree.ligne,
		id: entree.id,
		nom: entree.nom,
		url: entree.url,
		categorie: "morte",
		statutHttp: rep.statut || null,
		urlFinale: rep.urlFinale,
		octets: rep.octets,
		typeContenu: rep.typeContenu,
		tentatives,
		lecteur,
		erreur: rep.erreur,
		attendus: entree.attendus,
		trouves: [],
		extrait: "",
		dureeMs,
	};
	if (rep.erreur || rep.statut < 200 || rep.statut >= 400) {
		return { ...base, erreur: rep.erreur ?? `HTTP ${rep.statut}`, categorie: "morte" };
	}
	const { texte, items } = extraireTexte(rep);
	const norme = normaliser(texte);
	// Un texte court mais réel (flux RSS, sortie lecteur) n'est pas « sans
	// contenu » : seuls un corps vide ou un flux sans item le sont.
	const tropCourt = items === 0 || rep.octets === 0 || norme.length < 20;
	if (tropCourt) {
		return {
			...base,
			categorie: "sans contenu",
			erreur: items === 0 ? "flux sans item" : "aucun texte exploitable",
			extrait: norme.slice(0, 200),
		};
	}
	const trouves = entree.attendus.length
		? entree.attendus.filter((jeton) => ` ${norme} `.includes(` ${jeton} `))
		: [];
	return {
		...base,
		categorie: trouves.length || entree.attendus.length === 0 ? "valide" : "incoherent",
		erreur: entree.attendus.length === 0 ? "aucun jeton discriminant déclaré" : null,
		trouves,
		extrait: extraitAutour(norme, trouves),
	};
}

/** Attente courte entre deux essais, pour laisser respirer un service saturé. */
function pause(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

/** Essais avec retour en arrière, puis repli lecteur si la page bloque. */
async function chargerAvecRepli(
	entree: Entree,
	options: Options,
	chargeur: Chargeur,
): Promise<{ reponse: Reponse; tentatives: number; lecteur: string | null }> {
	let tentativesEffectuees = 0;
	let derniere: Reponse = {
		statut: 0, urlFinale: entree.url ?? "", corps: "", octets: 0,
		typeContenu: null, erreur: "URL absente", bloquee: false,
	};
	for (let tentative = 1; tentative <= options.tentatives; tentative++) {
		tentativesEffectuees = tentative;
		const controleur = new AbortController();
		const minuteur = setTimeout(() => controleur.abort(), options.timeoutMs);
		try {
			derniere = await chargeur(entree.url!, controleur.signal);
		} catch (e) {
			derniere = {
				statut: 0, urlFinale: entree.url ?? "", corps: "", octets: 0,
				typeContenu: null,
				erreur: controleur.signal.aborted
					? `délai dépassé (${options.timeoutMs} ms)`
					: (e instanceof Error ? e.message : String(e)).slice(0, 200),
				bloquee: false,
			};
		} finally {
			clearTimeout(minuteur);
		}
		if (!derniere.erreur && derniere.statut >= 200 && derniere.statut < 300) break;
		if (tentative < options.tentatives) await pause(200 * tentative);
	}
	if (derniere.bloquee && options.lecteur) {
		const lire = chargeurLecteur(options.lecteur);
		let viaLecteur: Reponse | null = null;
		for (let essai = 1; essai <= 2; essai++) {
			const controleur = new AbortController();
			const minuteur = setTimeout(() => controleur.abort(), options.timeoutMs * 2);
			try {
				const rep = await lire(entree.url!, controleur.signal);
				if (!rep.erreur && rep.statut >= 200 && rep.statut < 400) {
					viaLecteur = rep;
					break;
				}
				derniere.erreur = `${derniere.erreur ?? `HTTP ${derniere.statut}`} ; ${rep.erreur ?? `lecteur HTTP ${rep.statut}`}`;
			} catch (e) {
				derniere.erreur = `${derniere.erreur ?? `HTTP ${derniere.statut}`} ; lecteur : ${e instanceof Error ? e.message : String(e)}`;
			} finally {
				clearTimeout(minuteur);
			}
			if (essai < 2) await pause(600);
		}
		if (viaLecteur) {
			return {
				reponse: viaLecteur,
				tentatives: tentativesEffectuees + 1,
				lecteur: options.lecteur,
			};
		}
	}
	return { reponse: derniere, tentatives: tentativesEffectuees, lecteur: null };
}

export async function validerEntree(
	entree: Entree,
	options: Options,
	chargeur: Chargeur = chargeurHttp,
): Promise<Resultat> {
	const debut = Date.now();
	const { reponse, tentatives, lecteur } = await chargerAvecRepli(entree, options, chargeur);
	return classer(entree, reponse, options, tentatives, lecteur, Date.now() - debut);
}

/** Pool de concurrence borné, Ordre de sortie garanti. */
export async function enConcurrence<T, R>(
	elements: T[],
	concurrence: number,
	action: (element: T) => Promise<R>,
): Promise<R[]> {
	const resultats = new Array<R>(elements.length);
	let suivant = 0;
	const ouvrier = async (): Promise<void> => {
		while (suivant < elements.length) {
			const index = suivant++;
			resultats[index] = await action(elements[index]!);
		}
	};
	await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrence), elements.length) }, ouvrier));
	return resultats;
}

export function comptesVides(): Comptes {
	return {
		lignes: 0, urls: 0, valide: 0, morte: 0, "sans contenu": 0,
		incoherent: 0, sansUrl: 0, lecteur: 0,
	};
}

function ajouter(comptes: Comptes, categorie: Categorie | "sansUrl"): void {
	comptes[categorie] += 1;
}

function taux(comptes: Comptes): number {
	return comptes.urls === 0 ? 0 : Math.round((comptes.valide / comptes.urls) * 1000) / 10;
}

export function construireRapport(
	repertoire: string,
	fichiers: string[],
	entrees: Entree[],
	resultats: Resultat[],
	options: Options,
	debut: number,
): Rapport {
	const parFichier: LigneFichier[] = fichiers.map((fichier) => ({
		fichier, ...comptesVides(), taux: 0,
	}));
	const indexFichier = new Map(parFichier.map((l, i) => [l.fichier, i]));
	for (const e of entrees) {
		const ligne = parFichier[indexFichier.get(e.fichier)!]!;
		ligne.lignes += 1;
		if (!e.url) ligne.sansUrl += 1;
	}
	for (const r of resultats) {
		const ligne = parFichier[indexFichier.get(r.fichier)!]!;
		ligne.urls += 1;
		ajouter(ligne, r.categorie);
		if (r.lecteur) ligne.lecteur += 1;
	}
	for (const ligne of parFichier) ligne.taux = taux(ligne);
	const totaux = parFichier.reduce<Comptes>((acc, l) => {
		for (const cle of Object.keys(comptesVides()) as (keyof Comptes)[]) acc[cle] += l[cle];
		return acc;
	}, comptesVides());
	return {
		genereLe: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
		dureeMs: Date.now() - debut,
		protocole: {
			repertoire,
			timeoutMs: options.timeoutMs,
			concurrence: options.concurrence,
			tentatives: options.tentatives,
			lecteur: options.lecteur,
			tailleMaxOctets: options.tailleMaxOctets,
			criteres: "2xx et texte exploitable ; incohérente si aucun jeton du nom déclaré ; repli lecteur si blocage",
		},
		totaux: { ...totaux, fichiers: fichiers.length, taux: taux(totaux) },
		parFichier,
		resultats,
	};
}

export function rendreTableau(rapport: Rapport): string {
	const colonnes = [
		["fichier", 41], ["lignes", 7], ["URLs", 6], ["valides", 8],
		["mortes", 7], ["sans contenu", 13], ["incoh.", 7], ["sans URL", 9],
		["lecteur", 8], ["taux", 7],
	] as const;
	const cellule = (v: string | number, largeur: number, droite = true): string =>
		droite ? String(v).padStart(largeur) : String(v).slice(0, largeur).padEnd(largeur);
	const ligne = (vals: (string | number)[]): string =>
		vals.map((v, i) => cellule(v, colonnes[i]![1], i > 0)).join(" │ ");
	const largeur = colonnes.reduce((s, c) => s + c[1], 0) + 3 * (colonnes.length - 1);
	const sorties = [
		`Validation du corpus — ${rapport.genereLe} — ${rapport.dureeMs} ms`,
		`Concurrence ${rapport.protocole.concurrence} · timeout ${rapport.protocole.timeoutMs} ms · ${rapport.protocole.tentatives} tentative(s) · lecteur ${rapport.protocole.lecteur ?? "désactivé"}`,
		"",
		ligne(colonnes.map((c) => c[0])),
		"─".repeat(largeur),
	];
	for (const l of rapport.parFichier) {
		sorties.push(ligne([
			l.fichier, l.lignes, l.urls, l.valide, l.morte, l["sans contenu"],
			l.incoherent, l.sansUrl, l.lecteur, `${l.taux.toFixed(1)} %`,
		]));
	}
	const t = rapport.totaux;
	sorties.push(
		"─".repeat(largeur),
		ligne([
			`TOTAL (${t.fichiers} fichiers)`, t.lignes, t.urls, t.valide, t.morte,
			t["sans contenu"], t.incoherent, t.sansUrl, t.lecteur, `${t.taux.toFixed(1)} %`,
		]),
		"",
		`Critère : ${rapport.protocole.criteres}`,
	);
	return sorties.join("\n");
}

type Echec = { index: number; entree: Entree; resultat: Resultat };

/**
 * Un échec n'est publié qu'après une seconde lecture indépendante : les
 * services qui alternent 200 et 503 ne doivent pas faire varier les comptes
 * d'une exécution à l'autre. Seul un succès confirmé remplace l'échec.
 */
export async function confirmerEchecs(
	echecs: Echec[],
	options: Options,
	chargeur: Chargeur,
): Promise<Array<{ index: number; resultat: Resultat }>> {
	const optionsConfirmation: Options = {
		...options,
		timeoutMs: options.timeoutMs + 4000,
		tentatives: Math.max(2, options.tentatives),
	};
	const confirmes = await enConcurrence(echecs, options.concurrence, ({ entree }) =>
		validerEntree(entree, optionsConfirmation, chargeur));
	return echecs.map((echec, i) => ({
		index: echec.index,
		resultat: confirmes[i]!.categorie === "valide" ? confirmes[i]! : echec.resultat,
	}));
}

function entierPositif(brut: string, nom: string): number {
	const valeur = Number(brut);
	if (!/^\d+$/.test(brut) || !Number.isSafeInteger(valeur) || valeur < 1) {
		throw new Error(`--${nom} doit être un entier positif, reçu : ${brut}`);
	}
	return valeur;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<Rapport> {
	const option = (nom: string): string | undefined =>
		argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
	const debut = Date.now();
	const repertoire = resolve(option("dir") ?? resolve(RACINE, "bench/corpus"));
	const cheminJson = resolve(option("json") ?? resolve(RACINE, "bench/results/validation-corpus.json"));
	const strict = argv.includes("--strict");
	const options: Options = {
		timeoutMs: entierPositif(option("timeout") ?? String(OPTIONS_DEFAUT.timeoutMs), "timeout"),
		concurrence: entierPositif(option("concurrence") ?? String(OPTIONS_DEFAUT.concurrence), "concurrence"),
		tentatives: entierPositif(option("tentatives") ?? String(OPTIONS_DEFAUT.tentatives), "tentatives"),
		lecteur:
			option("lecteur") === "off"
				? null
				: option("lecteur") ?? process.env.RADAR_LECTEUR_URL ?? OPTIONS_DEFAUT.lecteur,
		tailleMaxOctets: OPTIONS_DEFAUT.tailleMaxOctets,
	};
	const fichiers = listerCorpus(repertoire);
	const entrees = fichiers.flatMap((f) => lireFichier(repertoire, f));
	const aValider = entrees.filter((e) => e.url !== null);
	const chargeur = creerChargeurHttp(options);
	const initiaux = await enConcurrence(aValider, options.concurrence, (e) =>
		validerEntree(e, options, chargeur));
	const echecs = initiaux.flatMap((resultat, index) =>
		resultat.categorie === "morte" || resultat.categorie === "sans contenu"
			? [{ index, entree: aValider[index]!, resultat }]
			: []);
	const confirmes = await confirmerEchecs(echecs, options, chargeur);
	const resultats = [...initiaux];
	for (const { index, resultat } of confirmes) resultats[index] = resultat;
	const rapport = construireRapport(
		relative(RACINE, repertoire), fichiers, entrees, resultats, options, debut,
	);
	console.log(rendreTableau(rapport));
	mkdirSync(dirname(cheminJson), { recursive: true });
	writeFileSync(cheminJson, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");
	console.log(`\nRapport JSON : ${relative(RACINE, cheminJson)}`);
	if (strict && rapport.totaux.valide !== rapport.totaux.urls) process.exitCode = 1;
	return rapport;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
