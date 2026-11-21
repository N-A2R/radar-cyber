/**
 * Validation indépendante du corpus de couverture — le contrôle qui rend le
 * corpus défendable : chaque URL déclarée est interrogée pour de vrai, et le
 * texte renvoyé doit mentionner l'organisation annoncée par la ligne.
 *
 * Trois issues, et seulement trois :
 *   - valide      : réponse HTTP 200 (après redirections) ET au moins un jeton
 *                   discriminant de l'organisation présent dans le texte ;
 *   - morte       : erreur réseau, délai dépassé ou statut final != 200 ;
 *   - incohérent  : HTTP 200 mais l'organisation n'apparaît pas dans le contenu.
 *
 * Le test d'organisation est volontairement simple et explicite : on retire les
 * diacritiques, la ponctuation et les mots génériques de « Ville de », puis on
 * cherche un jeton restant comme mot entier. Un titre, une méta-description ou
 * le corps de l'article suffisent. Ce n'est pas une preuve d'exactitude de
 * l'extrait — c'est un contrôle de non-dégradation : une ligne dont la source
 * a disparu ou pointe sur une autre organisation ne peut plus être publiée.
 *
 * Formats lus :
 *   - JSONL : un objet par ligne avec `url` et `organisation` (corpus de
 *     couverture, défaut : bench/couverture/incidents.jsonl) ;
 *   - JSON  : objet avec `incidents[]`, `entite` et `preuve.url` (corpus témoin
 *     de référence). Une seule URL principale par entrée.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/valider-corpus.mts
 *   apps/api/node_modules/.bin/tsx scripts/valider-corpus.mts \
 *     --corpus=bench/fixtures/corpus-reference-na.json \
 *     --json=bench/results/validation-corpus.json \
 *     --concurrence=4 --timeout=8000
 *
 * Le rapport est affiché sur stdout ; --json l'écrit aussi sur disque.
 * Code de sortie 1 si au moins une URL est morte ou incohérente (contrôle CI).
 * Aucune écriture hors du fichier demandé par --json ; aucune base consultée.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);

function entierPositif(brut: string, nom: string): number {
	const valeur = Number(brut);
	if (!/^\d+$/.test(brut) || !Number.isSafeInteger(valeur) || valeur < 1) {
		throw new Error(`--${nom} doit être un entier positif, reçu : ${brut}`);
	}
	return valeur;
}

const CORPUS = resolve(option("corpus") ?? resolve(RACINE, "bench/couverture/incidents.jsonl"));
const CORPUS_AFFICHE = CORPUS.startsWith(RACINE) ? relative(RACINE, CORPUS) : CORPUS;
const SORTIE_JSON = option("json") ? resolve(option("json")!) : null;
const TIMEOUT_MS = entierPositif(option("timeout") ?? "8000", "timeout");
const CONCURRENCE = entierPositif(option("concurrence") ?? "4", "concurrence");
const TAILLE_MAX = 1_000_000; // borne mémoire : titre + corps suffisent

type EntreeCorpus = { id: string; organisation: string; url: string };
type Categorie = "valide" | "morte" | "incoherent";

type Resultat = {
	id: string;
	organisation: string;
	url: string;
	categorie: Categorie;
	statutHttp: number | null;
	urlFinale: string | null;
	erreur: string | null;
	jetonsAttendus: string[];
	jetonsTrouves: string[];
	extrait: string;
	dureeMs: number;
};

type Rapport = {
	genereLe: string;
	corpus: string;
	protocole: {
		criteres: string;
		timeoutMs: number;
		concurrence: number;
		tailleMaxOctets: number;
	};
	totaux: { entrees: number; valides: number; mortes: number; incoherentes: number };
	valides: Resultat[];
	mortes: Resultat[];
	incoherentes: Resultat[];
};

/** Articles, prépositions et mots d'organisation : jamais discriminants. */
const GENERIQUES = new Set(
	`
	de des du de la le les la un une et au aux sur dans par pour en via avec dont ce cette ces
	son ses leur leurs qui que quoi dont ou mais car si ne pas plus moins
	ville mairie commune municipal municipale departement region service services centre
	direction office agence etablissement entreprise societe sarl sas association federation
	nationale national union outil gestion plateforme application prestataire editeur
	incident attaque cyberattaque securite donnees personnelles personnes familles
	accompagnement difficultes prevention sante travail interentreprises campus numerique
	`.trim().split(/\s+/),
);

/** Comparaison insensible aux accents, à la casse et à la ponctuation. */
function normaliser(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

const NOMS_ENTITES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	eacute: "e",
	egrave: "e",
	agrave: "a",
	ccedil: "c",
	ecirc: "e",
	ugrave: "u",
};

function decoderEntite(brut: string): string {
	const entite = brut.toLowerCase();
	if (entite.startsWith("#x") || entite.startsWith("#")) {
		const hex = entite.startsWith("#x");
		const code = Number.parseInt(entite.slice(hex ? 2 : 1), hex ? 16 : 10);
		return Number.isInteger(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : " ";
	}
	return NOMS_ENTITES[entite] ?? " ";
}

/** Texte visible : on jette scripts, styles et balises avant de comparer. */
function texteVisible(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
		.replace(/<svg[\s\S]*?<\/svg>/gi, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_m, entite: string) => decoderEntite(entite))
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function jetonsAttendus(organisation: string): string[] {
	return [...new Set(
		normaliser(organisation)
			.split(" ")
			.filter((jeton) => jeton.length >= 3 && !GENERIQUES.has(jeton) && !/^\d+$/.test(jeton)),
	)];
}

function jetonsTrouves(attendus: string[], texteNormalise: string): string[] {
	const bornes = ` ${texteNormalise} `;
	return attendus.filter((jeton) => bornes.includes(` ${jeton} `));
}

function extraitAutour(texteNormalise: string, jetons: string[]): string {
	const cible = jetons[0];
	if (!cible) return texteNormalise.slice(0, 240);
	const position = texteNormalise.indexOf(` ${cible} `);
	if (position < 0) return texteNormalise.slice(0, 240);
	const debut = Math.max(0, position - 100);
	return `${debut > 0 ? "…" : ""}${texteNormalise.slice(debut, position + 160)}${
		position + 160 < texteNormalise.length ? "…" : ""
	}`;
}

/** Validation minimale d'une valeur JSON objet avant lecture de champs. */
function estObjet(valeur: unknown): valeur is Record<string, unknown> {
	return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function lireCorpus(chemin: string): EntreeCorpus[] {
	const brut = readFileSync(chemin, "utf8");
	const objets: unknown[] = [];
	if (chemin.endsWith(".jsonl")) {
		for (const [i, ligne] of brut.split(/\r?\n/).entries()) {
			if (!ligne.trim()) continue;
			try {
				objets.push(JSON.parse(ligne) as unknown);
			} catch {
				throw new Error(`${chemin}:${i + 1} : JSON invalide`);
			}
		}
	} else {
		const parsed: unknown = JSON.parse(brut);
		if (!estObjet(parsed)) {
			throw new Error(`${chemin} : objet JSON attendu`);
		}
		const incidents = parsed.incidents;
		if (!Array.isArray(incidents)) {
			throw new Error(`${chemin} : objet JSON avec une clé « incidents[] » attendu`);
		}
		objets.push(...incidents);
	}

	return objets.map((objet, i) => {
		if (!estObjet(objet)) {
			throw new Error(`${chemin} : entrée ${i + 1} invalide`);
		}
		const o = objet;
		const preuve = estObjet(o.preuve) ? o.preuve : {};
		const url = typeof o.url === "string" ? o.url : typeof preuve.url === "string" ? preuve.url : null;
		const organisation = typeof o.organisation === "string" ? o.organisation : typeof o.entite === "string" ? o.entite : null;
		if (!url || !/^https?:\/\//i.test(url)) {
			throw new Error(`${chemin} : entrée ${i + 1} sans URL http(s) exploitable`);
		}
		if (!organisation?.trim()) {
			throw new Error(`${chemin} : entrée ${i + 1} sans organisation déclarée`);
		}
		return {
			id: typeof o.id === "string" ? o.id : `entree-${i + 1}`,
			organisation,
			url,
		};
	});
}

type ReponseChargee = {
	statutHttp: number | null;
	urlFinale: string | null;
	corps: string;
	erreur: string | null;
};

/** GET borné en temps et en volume, redirections suivies. */
async function charger(url: string): Promise<ReponseChargee> {
	const controleur = new AbortController();
	const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);
	try {
		const reponse = await fetch(url, {
			signal: controleur.signal,
			redirect: "follow",
			headers: {
				"user-agent": "radar-cyber-validation-corpus/1.0 (controle re-jouable du corpus)",
				accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5",
				"accept-language": "fr,en;q=0.5",
			},
		});
		let corps = "";
		if (reponse.body) {
			const lecteur = reponse.body.getReader();
			const decodeur = new TextDecoder("utf-8");
			let octets = 0;
			while (octets < TAILLE_MAX) {
				const { done, value } = await lecteur.read();
				if (done) break;
				octets += value.byteLength;
				corps += decodeur.decode(value, { stream: true });
			}
			if (octets >= TAILLE_MAX) await lecteur.cancel();
			else corps += decodeur.decode();
		}
		return { statutHttp: reponse.status, urlFinale: reponse.url, corps, erreur: null };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return {
			statutHttp: null,
			urlFinale: null,
			corps: "",
			erreur: controleur.signal.aborted ? `délai dépassé (${TIMEOUT_MS} ms)` : message.slice(0, 200),
		};
	} finally {
		clearTimeout(minuteur);
	}
}

async function valider(entree: EntreeCorpus): Promise<Resultat> {
	const debut = Date.now();
	const commun: Pick<Resultat, "id" | "organisation" | "url"> = {
		id: entree.id,
		organisation: entree.organisation,
		url: entree.url,
	};
	const base = {
		...commun,
		jetonsAttendus: jetonsAttendus(entree.organisation),
		jetonsTrouves: [] as string[],
		extrait: "",
	};
	const reponse = await charger(entree.url);
	const dureeMs = Date.now() - debut;
	if (reponse.statutHttp !== 200) {
		return {
			...base,
			categorie: "morte",
			statutHttp: reponse.statutHttp,
			urlFinale: reponse.urlFinale,
			erreur: reponse.erreur ?? `HTTP ${reponse.statutHttp}`,
			dureeMs,
		};
	}
	const norme = normaliser(texteVisible(reponse.corps));
	const trouves = jetonsTrouves(base.jetonsAttendus, norme);
	return {
		...base,
		categorie: trouves.length > 0 ? "valide" : "incoherent",
		statutHttp: 200,
		urlFinale: reponse.urlFinale,
		erreur: base.jetonsAttendus.length === 0 ? "organisation sans jeton discriminant" : null,
		jetonsTrouves: trouves,
		extrait: extraitAutour(norme, trouves),
		dureeMs,
	};
}

async function fnAvecConcurrence<T, R>(elements: T[], concurrence: number, action: (element: T) => Promise<R>): Promise<R[]> {
	const resultats = new Array<R>(elements.length);
	let suivant = 0;
	const travailleur = async (): Promise<void> => {
		while (suivant < elements.length) {
			const index = suivant++;
			resultats[index] = await action(elements[index]!);
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrence, elements.length) }, travailleur));
	return resultats;
}

function afficherRapport(rapport: Rapport): void {
	console.log(`Validation du corpus ${rapport.corpus} — ${rapport.genereLe}`);
	console.log(`Critère : ${rapport.protocole.criteres}`);
	const sections: [string, Resultat[], string][] = [
		["URLs valides", rapport.valides, "VALIDE"],
		["URLs mortes", rapport.mortes, "MORTE"],
		["Contenu incohérent", rapport.incoherentes, "INCOHERENT"],
	];
	for (const [titre, liste, etiquette] of sections) {
		console.log(`\n${titre} (${liste.length})`);
		if (liste.length === 0) console.log("  — aucune —");
		for (const r of liste) {
			const detail =
				r.categorie === "morte"
					? r.erreur ?? `HTTP ${r.statutHttp}`
					: r.categorie === "incoherent"
						? `jetons attendus : ${r.jetonsAttendus.join(", ") || "aucun"}`
						: `jetons trouvés : ${r.jetonsTrouves.join(", ")}`;
			console.log(`  [${etiquette}] ${r.id} — ${r.url} — ${detail}`);
			if (r.categorie !== "morte" && r.extrait) console.log(`      extrait : ${r.extrait}`);
		}
	}
	const t = rapport.totaux;
	console.log(
		`\nTOTAL : ${t.entrees} entrées — ${t.valides} valides, ${t.mortes} mortes, ${t.incoherentes} incohérentes.`,
	);
}

const entrees = lireCorpus(CORPUS);
const resultats = await fnAvecConcurrence(entrees, CONCURRENCE, valider);
const rapport: Rapport = {
	genereLe: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
	corpus: CORPUS_AFFICHE,
	protocole: {
		criteres: "HTTP 200 final et au moins un jeton discriminant de l'organisation dans le texte visible",
		timeoutMs: TIMEOUT_MS,
		concurrence: CONCURRENCE,
		tailleMaxOctets: TAILLE_MAX,
	},
	totaux: {
		entrees: entrees.length,
		valides: resultats.filter((r) => r.categorie === "valide").length,
		mortes: resultats.filter((r) => r.categorie === "morte").length,
		incoherentes: resultats.filter((r) => r.categorie === "incoherent").length,
	},
	valides: resultats.filter((r) => r.categorie === "valide"),
	mortes: resultats.filter((r) => r.categorie === "morte"),
	incoherentes: resultats.filter((r) => r.categorie === "incoherent"),
};

afficherRapport(rapport);
if (SORTIE_JSON) {
	mkdirSync(dirname(SORTIE_JSON), { recursive: true });
	writeFileSync(SORTIE_JSON, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");
	console.log(`\nRapport JSON écrit : ${SORTIE_JSON}`);
}
if (rapport.totaux.mortes + rapport.totaux.incoherentes > 0) process.exitCode = 1;
