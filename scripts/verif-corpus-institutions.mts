/**
 * Vérification jouable du corpus des sources institutionnelles de
 * Nouvelle-Aquitaine (`bench/corpus/institutions.jsonl`).
 *
 * Contrôle réel, pas une relecture des preuves stockées : chaque URL est
 * interrogée à nouveau, et au moins un jeton discriminant du nom de
 * l'organisation doit apparaître dans le texte visible renvoyé. Les champs
 * obligatoires (nom, url, format, fréquence, département, preuve) sont
 * également contrôlés. Le taux de validité observé est affiché en fin de
 * rapport avec le compte par type d'institution.
 *
 * La `frequence` déclarée est une classe qualitative déduite de la rubrique
 * (voir `frequence_precision`) : ce script ne prétend pas la mesurer.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/verif-corpus-institutions.mts \
 *     [--corpus=bench/corpus/institutions.jsonl] \
 *     [--json=bench/results/verification-institutions.json] \
 *     [--concurrence=6] [--timeout=12000]
 *
 * Code de sortie 1 si une entrée est invalide ou incohérente.
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

const CORPUS = resolve(option("corpus") ?? resolve(RACINE, "bench/corpus/institutions.jsonl"));
const CORPUS_AFFICHE = CORPUS.startsWith(RACINE) ? relative(RACINE, CORPUS) : CORPUS;
const SORTIE_JSON = option("json") ? resolve(option("json")!) : null;
const TIMEOUT_MS = entierPositif(option("timeout") ?? "12000", "timeout");
const CONCURRENCE = entierPositif(option("concurrence") ?? "6", "concurrence");
const TAILLE_MAX = 1_000_000;

type Entree = {
	id: string;
	nom: string;
	organisation: string;
	type: string;
	url: string;
	format: string;
	frequence: string;
	departement: string;
	preuve: Record<string, unknown>;
};

type Resultat = {
	id: string;
	nom: string;
	type: string;
	departement: string;
	url: string;
	categorie: "valide" | "invalide" | "morte" | "incoherent";
	statutHttp: number | null;
	urlFinale: string | null;
	erreur: string | null;
	jetonsTrouves: string[];
	extrait: string;
	dureeMs: number;
};

type Rapport = {
	genereLe: string;
	corpus: string;
	protocole: Record<string, unknown>;
	totaux: {
		entrees: number;
		valides: number;
		invalides: number;
		mortes: number;
		incoherentes: number;
		tauxValidite: string;
		parType: Record<string, { total: number; valides: number }>;
	};
	resultats: Resultat[];
};

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

function normaliser(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

const NOMS_ENTITES: Record<string, string> = {
	amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
	eacute: "e", egrave: "e", agrave: "a", ccedil: "c", ecirc: "e", ugrave: "u",
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

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
	return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function lireCorpus(chemin: string): { entrees: Entree[]; invalides: Resultat[] } {
	const brut = readFileSync(chemin, "utf8");
	const entrees: Entree[] = [];
	const invalides: Resultat[] = [];
	for (const [i, ligne] of brut.split(/\r?\n/).entries()) {
		if (!ligne.trim()) continue;
		let objet: unknown;
		try {
			objet = JSON.parse(ligne);
		} catch {
			invalides.push({
				id: `ligne-${i + 1}`, nom: "", type: "", departement: "", url: "",
				categorie: "invalide", statutHttp: null, urlFinale: null,
				erreur: `ligne ${i + 1} : JSON invalide`, jetonsTrouves: [], extrait: "", dureeMs: 0,
			});
			continue;
		}
		if (!estObjet(objet)) {
			invalides.push({
				id: `ligne-${i + 1}`, nom: "", type: "", departement: "", url: "",
				categorie: "invalide", statutHttp: null, urlFinale: null,
				erreur: `ligne ${i + 1} : objet attendu`, jetonsTrouves: [], extrait: "", dureeMs: 0,
			});
			continue;
		}
		const o = objet;
		const champs = ["id", "nom", "type", "url", "format", "frequence", "departement"];
		const manquants = champs.filter((c) => typeof o[c] !== "string" || !(o[c] as string).trim());
		const preuve = estObjet(o.preuve) ? o.preuve : {};
		if (typeof preuve.http_status !== "number" || typeof preuve.extrait !== "string" || !preuve.extrait.trim()) {
			manquants.push("preuve.http_status / preuve.extrait");
		}
		const url = typeof o.url === "string" ? o.url : "";
		if (!/^https?:\/\//i.test(url)) manquants.push("url http(s)");
		if (manquants.length) {
			invalides.push({
				id: typeof o.id === "string" ? o.id : `ligne-${i + 1}`,
				nom: typeof o.nom === "string" ? o.nom : "",
				type: typeof o.type === "string" ? o.type : "",
				departement: typeof o.departement === "string" ? o.departement : "",
				url, categorie: "invalide", statutHttp: null, urlFinale: null,
				erreur: `champs manquants : ${[...new Set(manquants)].join(", ")}`,
				jetonsTrouves: [], extrait: "", dureeMs: 0,
			});
			continue;
		}
		entrees.push({
			id: o.id as string,
			nom: o.nom as string,
			organisation: typeof o.organisation === "string" && o.organisation.trim() ? o.organisation : o.nom as string,
			type: o.type as string,
			url,
			format: o.format as string,
			frequence: o.frequence as string,
			departement: o.departement as string,
			preuve,
		});
	}
	return { entrees, invalides };
}

type Chargee = { statutHttp: number | null; urlFinale: string | null; corps: string; erreur: string | null };

async function charger(url: string): Promise<Chargee> {
	const controleur = new AbortController();
	const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);
	try {
		const reponse = await fetch(url, {
			signal: controleur.signal,
			redirect: "follow",
			headers: {
				"user-agent": "radar-cyber-validation-corpus-institutions/1.0 (controle re-jouable du corpus)",
				accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "fr,en;q=0.6",
			},
		});
		let corps = "";
		if (reponse.body) {
			const lecteur = reponse.body.getReader();
			const decodeur = new TextDecoder("utf-8");
			while (corps.length < TAILLE_MAX) {
				const { done, value } = await lecteur.read();
				if (done) break;
				corps += decodeur.decode(value, { stream: true });
			}
			await lecteur.cancel().catch(() => undefined);
		}
		return { statutHttp: reponse.status, urlFinale: reponse.url, corps, erreur: null };
	} catch (e) {
		return { statutHttp: null, urlFinale: null, corps: "", erreur: e instanceof Error ? e.message : String(e) };
	} finally {
		clearTimeout(minuteur);
	}
}

async function verifier(entree: Entree): Promise<Resultat> {
	const debut = Date.now();
	const commun = {
		id: entree.id, nom: entree.nom, type: entree.type,
		departement: entree.departement, url: entree.url, dureeMs: 0,
	};
	const reponse = await charger(entree.url);
	const dureeMs = Date.now() - debut;
	const base = { ...commun, dureeMs, urlFinale: reponse.urlFinale };
	if (reponse.statutHttp !== 200) {
		return {
			...base, categorie: "morte", statutHttp: reponse.statutHttp,
			erreur: reponse.erreur ?? `HTTP ${reponse.statutHttp}`,
			jetonsTrouves: [], extrait: "",
		};
	}
	const norme = normaliser(texteVisible(reponse.corps));
	const bornes = ` ${norme} `;
	const trouves = jetonsAttendus(entree.organisation).filter((jeton) => bornes.includes(` ${jeton} `));
	const position = trouves.length ? norme.indexOf(` ${trouves[0]} `) : 0;
	const debutExtrait = Math.max(0, position - 90);
	const finExtrait = Math.min(norme.length, position + 200);
	return {
		...base,
		categorie: trouves.length ? "valide" : "incoherent",
		statutHttp: 200,
		erreur: trouves.length ? null : "aucun jeton discriminant de l'organisation dans le texte visible",
		jetonsTrouves: trouves,
		extrait: `${debutExtrait > 0 ? "…" : ""}${norme.slice(debutExtrait, finExtrait)}${finExtrait < norme.length ? "…" : ""}`,
	};
}

async function fnAvecConcurrence<T, R>(elements: T[], concurrence: number, action: (e: T) => Promise<R>): Promise<R[]> {
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

const { entrees, invalides } = lireCorpus(CORPUS);
const resultats = [...invalides, ...(await fnAvecConcurrence(entrees, CONCURRENCE, verifier))];
const valides = resultats.filter((r) => r.categorie === "valide");
const parType: Record<string, { total: number; valides: number }> = {};
for (const r of resultats) {
	parType[r.type || "(invalide)"] ??= { total: 0, valides: 0 };
	parType[r.type || "(invalide)"]!.total++;
	if (r.categorie === "valide") parType[r.type || "(invalide)"]!.valides++;
}
const rapport: Rapport = {
	genereLe: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
	corpus: CORPUS_AFFICHE,
	protocole: {
		criteres: "champs requis présents, HTTP 200 final et au moins un jeton discriminant de l'organisation dans le texte visible",
		timeoutMs: TIMEOUT_MS,
		concurrence: CONCURRENCE,
		tailleMaxOctets: TAILLE_MAX,
		frequence: "classe qualitative déclarée, non mesurée par ce contrôle",
	},
	totaux: {
		entrees: resultats.length,
		valides: valides.length,
		invalides: resultats.filter((r) => r.categorie === "invalide").length,
		mortes: resultats.filter((r) => r.categorie === "morte").length,
		incoherentes: resultats.filter((r) => r.categorie === "incoherent").length,
		tauxValidite: resultats.length ? `${((valides.length / resultats.length) * 100).toFixed(1)} %` : "n/a",
		parType,
	},
	resultats,
};

console.log(`Vérification du corpus ${rapport.corpus} — ${rapport.genereLe}`);
console.log(`Critère : ${String(rapport.protocole.criteres)}`);
console.log("\nCompte par type d'institution (valides / total) :");
for (const [type, compte] of Object.entries(parType).sort(([a], [b]) => a.localeCompare(b))) {
	console.log(`  ${type.padEnd(24)} ${compte.valides} / ${compte.total}`);
}
const echecs = resultats.filter((r) => r.categorie !== "valide");
console.log(`\nÉchecs (${echecs.length})`);
if (!echecs.length) console.log("  — aucun —");
for (const r of echecs) {
	console.log(`  [${r.categorie.toUpperCase()}] ${r.id} — ${r.url} — ${r.erreur ?? ""}`);
	if (r.extrait) console.log(`      extrait : ${r.extrait}`);
}
const t = rapport.totaux;
console.log(
	`\nTOTAL : ${t.entrees} entrées — ${t.valides} valides, ${t.invalides} invalides, ${t.mortes} mortes, ${t.incoherentes} incohérentes. Taux de validité observé : ${t.tauxValidite}.`,
);
if (SORTIE_JSON) {
	mkdirSync(dirname(SORTIE_JSON), { recursive: true });
	writeFileSync(SORTIE_JSON, `${JSON.stringify(rapport, null, 2)}\n`, "utf8");
	console.log(`\nRapport JSON écrit : ${SORTIE_JSON}`);
}
if (t.valides !== t.entrees) process.exitCode = 1;
