/**
 * Consolide le référentiel des institutions publiques de Nouvelle-Aquitaine
 * (`bench/corpus/institutions-complet.jsonl`).
 *
 * Sources : référentiel territorial versionné (SIREN des communes et EPCI),
 * Wikidata (P374/P1616 + P856), annuaire de l'Éducation nationale (web + SIRET)
 * et corpus existants pour les établissements de santé. Chaque URL retenue est
 * interrogée à nouveau : HTTP 200 final et jeton discriminant du nom présent
 * dans le texte visible. Les preuves stockées ne sont jamais prises pour argent
 * comptant.
 *
 * Usage :
 *   tsx scripts/institutions-complet.mts [--limite=200] [--concurrence=24]
 *   Les options --limite et --concurrence servent aux essais ; la génération
 *   définitive tourne sans --limite.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { calculerHashCorpus, FICHIER_HASH } from "./corpus-hash.mts";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const REFERENTIEL = resolve(RACINE, "db/data/referentiel-na.json");
const CORPUS_COMMUNES = resolve(RACINE, "bench/corpus/communes.jsonl");
const CORPUS_SANTE = resolve(RACINE, "bench/corpus/sante-enseignement.jsonl");
const SORTIE = resolve(RACINE, "bench/corpus/institutions-complet.jsonl");
const RAPPORT = resolve(RACINE, "bench/results/institutions-complet.json");
const DATE = new Date().toISOString().slice(0, 10);

const argv = process.argv.slice(2);
const option = (nom: string): string | undefined =>
	argv.find((a) => a.startsWith(`--${nom}=`))?.slice(nom.length + 3);
const LIMITE = option("limite") ? Number(option("limite")) : Infinity;
const CONCURRENCE = Number(option("concurrence") ?? "24");
const TIMEOUT_MS = 8000;
const OCTETS_MAX = 400_000;

export type Candidat = {
	id: string;
	nom: string;
	type: string;
	commune: string;
	departement: string;
	siren: string;
	url: string;
	source: string;
	sourceSiren: string;
};

export type Verification = {
	statut: number | null;
	urlFinale: string;
	extrait: string;
	jetons: string[];
	confirme: boolean;
	erreur: string | null;
};

const GENERIQUES: Record<string, true> = Object.fromEntries(
	`
	de des du de la le les la un une et au aux sur dans par pour en via avec dont ce cette ces
	son ses leur leurs qui que quoi ou mais car si ne pas plus moins ville mairie communes commune
	municipal municipale departement region service services centre direction office agence
	etablissement entreprise societe sarl sas association federation nationale national union
	outil gestion plateforme application prestataire editeur public prive
	lycee college professionnel general technologique agricole intercommunal communaute
	communautaire agglomeration metropole pays canton
	`.trim().split(/\s+/).map((mot) => [mot, true as const]),
);
export function normaliser(texte: string): string {
	return texte
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

export function jetonsAttendus(nom: string): string[] {
	return [...new Set(normaliser(nom).split(" ").filter((t) => t.length >= 3 && GENERIQUES[t] !== true))];
}

const NOMS_ENTITES: Record<string, string> = {
	amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "e",
	egrave: "e", agrave: "a", ccedil: "c", ecirc: "e", ugrave: "u",
};

export function texteVisible(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
		.replace(/<svg[\s\S]*?<\/svg>/gi, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_m, e: string) => {
			const hex = e.toLowerCase().startsWith("#x");
			const code = Number.parseInt(e.slice(hex ? 2 : e.startsWith("#") ? 1 : 0), hex ? 16 : 10);
			return e.startsWith("#") && Number.isInteger(code) && code > 0 && code < 0x10ffff
				? String.fromCodePoint(code)
				: NOMS_ENTITES[e.toLowerCase()] ?? " ";
		})
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Un jeton discriminant ou le nom exact suffit ; le texte visible est normalisé. */
export function evaluerPage(html: string, nom: string): Verification {
	const visible = texteVisible(html);
	const texte = normaliser(visible);
	const jetons = jetonsAttendus(nom);
	const trouves = jetons.filter((j) => new RegExp(`(^|[^a-z0-9])${j}([^a-z0-9]|$)`).test(texte));
	const brut = normaliser(nom);
	const exact = brut.length >= 4 && texte.includes(brut);
	const confirme = trouves.length > 0 || exact;
	const position = exact ? texte.indexOf(brut) : texte.indexOf(trouves[0] ?? "");
	const extrait = position < 0 ? "" : visible.slice(Math.max(0, position - 60), position + 120).trim();
	return { statut: 200, urlFinale: "", extrait, jetons: trouves, confirme, erreur: null };
}

export function ligneCorpus(c: Candidat, v: Verification): Record<string, unknown> {
	return {
		id: c.id,
		nom: c.nom,
		type: c.type,
		commune: c.commune,
		departement: c.departement,
		siren: c.siren,
		url: c.url,
		url_preuve: v.urlFinale,
		source: c.source,
		source_siren: c.sourceSiren,
		preuve: {
			http_status: v.statut,
			verifie_le: DATE,
			url_candidate: c.url,
			url_finale: v.urlFinale,
			extrait: v.extrait,
			jetons_trouves: v.jetons,
			methode: "GET HTTP, 200 final et jeton discriminant du nom dans le texte visible",
		},
	};
}

function lireJsonl(chemin: string): Record<string, unknown>[] {
	return readFileSync(chemin, "utf8")
		.split(/\r?\n/)
		.filter((l) => l.trim())
		.map((l) => JSON.parse(l) as Record<string, unknown>);
}

type Referentiel = {
	communes: { code: string; nom: string; siren: string; departement: string; type: string; population: number }[];
	epci: { code: string; nom: string; type: string }[];
	departements: { code: string; nom: string }[];
};

export function candidatsCommunes(
	ref: Referentiel,
	parCode: Map<string, string[]>,
	verifiees: Map<string, string>,
): Candidat[] {
	const nomsDep = new Map(ref.departements.map((d) => [d.code, d.nom]));
	return ref.communes
		.filter((c) => c.type === "commune-actuelle" && c.population > 5000 && /^\d{9}$/.test(c.siren))
		.flatMap((c) => {
			const urls = [...new Set([...(parCode.get(c.code) ?? []), ...(verifiees.has(c.code) ? [verifiees.get(c.code)!] : [])])];
			return urls.map((url, i) => ({
				id: `na-mairie-${c.code}${i ? `-${i + 1}` : ""}`,
				nom: `Mairie de ${c.nom}`,
				type: "mairie",
				commune: c.nom,
				departement: nomsDep.get(c.departement) ?? c.departement,
				siren: c.siren,
				url,
				source: i ? "corpus-communes" : "wikidata:P374+P856",
				sourceSiren: "referentiel-na.json",
			}));
		});
}

export function candidatsEpci(ref: Referentiel, parSiren: Map<string, string[]>): Candidat[] {
	return ref.epci
		.filter((e) => /^\d{9}$/.test(e.code))
		.flatMap((e) =>
			(parSiren.get(e.code) ?? []).map((url, i) => ({
				id: `na-epci-${e.code}${i ? `-${i + 1}` : ""}`,
				nom: e.nom,
				type: "epci",
				commune: "",
				departement: "Nouvelle-Aquitaine",
				siren: e.code,
				url,
				source: "wikidata:P1616+P856",
				sourceSiren: "referentiel-na.json",
			})),
		);
}

type RecordEducation = {
	identifiant_de_l_etablissement: string;
	nom_etablissement: string;
	nom_commune: string;
	code_departement: string;
	web: string;
	siren_siret: string;
	type_etablissement: string;
};

export function candidatsScolaires(records: RecordEducation[], nomsDep: Map<string, string>): Candidat[] {
	return records
		.filter((r) => /^https?:\/\//i.test(r.web ?? "") && /^\d{14}$/.test(r.siren_siret ?? ""))
		.map((r) => ({
			id: `na-edu-${r.identifiant_de_l_etablissement}`,
			nom: r.nom_etablissement,
			type: normaliser(r.type_etablissement) === "college" ? "collège" : "lycée",
			commune: r.nom_commune ?? "",
			departement: nomsDep.get(r.code_departement) ?? r.code_departement,
			siren: r.siren_siret.slice(0, 9),
			url: r.web.trim(),
			source: "education.gouv.fr:annuaire",
			sourceSiren: "education.gouv.fr:siren_siret (9 premiers chiffres)",
		}));
}

/** Préfectures et SDIS de NA : Wikidata fournit le SIREN et le site officiel. */
export function candidatsEtat(
	entre: { label: string; siren: string; site: string }[],
	nomsDep: { code: string; nom: string }[],
): Candidat[] {
	const propres = entre.filter((e) => /^https?:\/\//i.test(e.site) && /^\d{9}$/.test(e.siren));
	const resultats: Candidat[] = [];
	for (const d of nomsDep) {
		const departement = normaliser(d.nom);
		const correspond = (prefix: string) => propres.find((e) => {
			const label = normaliser(e.label);
			return label.startsWith(prefix) && label.endsWith(departement);
		});
		for (const [i, prefix] of ["prefecture", "service departemental d incendie"].entries()) {
			const trouve = correspond(prefix);
			if (!trouve) continue;
			resultats.push({
				id: `na-etat-${i ? "sdis" : "prefecture"}-${d.code}`,
				nom: i ? `SDIS ${d.nom}` : `Préfecture de ${d.nom}`,
				type: i ? "sdis" : "prefecture",
				commune: "",
				departement: d.nom,
				siren: trouve.siren,
				url: trouve.site,
				source: "wikidata:P1616+P856",
				sourceSiren: "wikidata:P1616",
			});
		}
	}
	const region = propres.find((e) => normaliser(e.label).includes("prefecture de la region nouvelle aquitaine"));
	if (region) resultats.push({
		id: "na-etat-prefecture-75",
		nom: "Préfecture de la région Nouvelle-Aquitaine",
		type: "prefecture",
		commune: "Bordeaux",
		departement: "Nouvelle-Aquitaine",
		siren: region.siren,
		url: region.site,
		source: "wikidata:P1616+P856",
		sourceSiren: "wikidata:P1616",
	});
	return resultats;
}

export function candidatsSante(lignes: Record<string, unknown>[], nomsDep: Map<string, string>): Candidat[] {
	return lignes
		.filter((l) => /^\d{9}$/.test(String(l.siren ?? "")) && /^https?:\/\//i.test(String(l.url ?? "")))
		.map((l, i) => ({
			id: `na-sante-${String(l.id ?? i)}`,
			nom: String(l.nom),
			type: String(l.type ?? "etablissement_sante"),
			commune: String(l.commune ?? ""),
			departement: String(l.departement ?? nomsDep.get(String(l.departement)) ?? ""),
			siren: String(l.siren),
			url: String(l.url),
			source: String(l.source ?? "finess+sante.fr"),
			sourceSiren: "finess (corpus sante-enseignement)",
		}));
}

async function getJson<T>(url: URL, timeoutMs = 60_000): Promise<T> {
	const reponse = await fetch(url, {
		signal: AbortSignal.timeout(timeoutMs),
		headers: {
			"user-agent": "radar-cyber-corpus-institutions/1.0 (contrôle re-jouable du référentiel NA)",
			accept: "application/json, application/sparql-results+json",
		},
	});
	if (!reponse.ok) throw new Error(`${reponse.status} ${url}`);
	return (await reponse.json()) as T;
}

async function sparql<T>(requete: string): Promise<T[]> {
	const url = new URL("https://query.wikidata.org/sparql");
	url.searchParams.set("query", requete);
	url.searchParams.set("format", "json");
	const json = await getJson<{ results: { bindings: T[] } }>(url, 90_000);
	return json.results.bindings;
}

function valeurs(liste: string[]): string {
	return liste.map((v) => `"${v}"`).join(" ");
}

async function sitesWikidata(cibles: string[], proprietaire: string): Promise<Map<string, string[]>> {
	const resultat = new Map<string, string[]>();
	for (let i = 0; i < cibles.length; i += 90) {
		const lot = cibles.slice(i, i + 90);
		const requete = `SELECT ?cible ?site WHERE { VALUES ?cible { ${valeurs(lot)} } ?item wdt:${proprietaire} ?cible ; wdt:P856 ?site . }`;
		const lignes = await sparql<{ cible: { value: string }; site: { value: string } }>(requete);
		for (const l of lignes) {
			if (!/^https?:\/\//i.test(l.site.value)) continue;
			const liste = resultat.get(l.cible.value) ?? [];
			if (!liste.includes(l.site.value)) liste.push(l.site.value);
			resultat.set(l.cible.value, liste);
		}
	}
	return resultat;
}

async function annuaireEducation(): Promise<RecordEducation[]> {
	const base = "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records";
	const tout: RecordEducation[] = [];
	for (let offset = 0; offset < 2000; offset += 100) {
		const url = new URL(base);
		url.searchParams.set("select", "identifiant_de_l_etablissement,nom_etablissement,nom_commune,code_departement,web,siren_siret,type_etablissement");
		url.searchParams.set("where", 'code_region="75" AND web IS NOT NULL AND type_etablissement IN ("Collège","Lycée")');
		url.searchParams.set("order_by", "identifiant_de_l_etablissement");
		url.searchParams.set("limit", "100");
		url.searchParams.set("offset", String(offset));
		const json = await getJson<{ results: RecordEducation[] }>(url);
		tout.push(...json.results);
		if (json.results.length < 100) break;
	}
	return tout;
}

export async function verifierUrl(c: Candidat): Promise<Verification> {
	const controleur = new AbortController();
	const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_MS);
	try {
		const reponse = await fetch(c.url, {
			signal: controleur.signal,
			redirect: "follow",
			headers: {
				"user-agent": "radar-cyber-corpus-institutions/1.0 (contrôle HTTP des sites officiels)",
				accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
				"accept-language": "fr,en;q=0.6",
			},
		});
		let html = "";
		if (reponse.body) {
			const lecteur = reponse.body.getReader();
			const decodeur = new TextDecoder("utf-8");
			while (html.length < OCTETS_MAX) {
				const { done, value } = await lecteur.read();
				if (done) break;
				html += decodeur.decode(value, { stream: true });
			}
			await lecteur.cancel().catch(() => undefined);
		}
		if (reponse.status !== 200) {
			return { statut: reponse.status, urlFinale: reponse.url, extrait: "", jetons: [], confirme: false, erreur: `HTTP ${reponse.status}` };
		}
		const evaluee = evaluerPage(html, c.nom);
		return { ...evaluee, statut: 200, urlFinale: reponse.url, erreur: evaluee.confirme ? null : "nom absent de la page" };
	} catch (e) {
		return {
			statut: null, urlFinale: "", extrait: "", jetons: [], confirme: false,
			erreur: e instanceof Error ? e.message : String(e),
		};
	} finally {
		clearTimeout(minuteur);
	}
}

async function verifierTous(candidats: Candidat[]): Promise<{ retenus: Record<string, unknown>[]; echecs: Record<string, number> }> {
	const retenus: Record<string, unknown>[] = [];
	const echecs: Record<string, number> = {};
	let curseur = 0;
	const vus = new Set<string>();
	async function ouvrier(): Promise<void> {
		while (curseur < candidats.length) {
			const c = candidats[curseur++]!;
			let host = c.url;
			try { host = new URL(c.url).host; } catch { /* URL invalide : rejetée à la vérification */ }
			const cle = `${normaliser(c.nom)}|${host}`;
			if (vus.has(cle)) continue;
			vus.add(cle);
			const v = await verifierUrl(c);
			if (v.statut === 200 && v.confirme) retenus.push(ligneCorpus(c, v));
			else echecs[c.type] = (echecs[c.type] ?? 0) + 1;
		}
	}
	await Promise.all(Array.from({ length: Math.max(1, CONCURRENCE) }, () => ouvrier()));
	retenus.sort((a, b) => String(a.id).localeCompare(String(b.id)));
	return { retenus, echecs };
}

export function estLanceDirectement(): boolean {
	return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (estLanceDirectement()) {
	const ref = JSON.parse(readFileSync(REFERENTIEL, "utf8")) as Referentiel;
	const nomsDep = new Map(ref.departements.map((d) => [d.code, d.nom]));
	const communesVerifiees = new Map<string, string>();
	for (const l of lireJsonl(CORPUS_COMMUNES)) {
		if (l.statut_http === 200 && typeof l.url_finale === "string") communesVerifiees.set(String(l.code_insee), l.url_finale);
	}
	console.error("Récupération des sites depuis Wikidata et l'annuaire de l'Éducation nationale…");
	const [parCode, parSiren, education, etat] = await Promise.all([
		sitesWikidata(ref.communes.filter((c) => c.type === "commune-actuelle" && c.population > 5000).map((c) => c.code), "P374"),
		sitesWikidata(ref.epci.map((e) => e.code), "P1616"),
		annuaireEducation(),
		sparql<{ label: { value: string }; siren: { value: string }; site: { value: string } }>(
			`SELECT ?item ?label ?siren ?site WHERE { ?item wdt:P856 ?site ; wdt:P1616 ?siren ; rdfs:label ?label . FILTER(LANG(?label)="fr") FILTER(CONTAINS(LCASE(?label),"préfecture") || CONTAINS(LCASE(?label),"incendie et de secours")) }`,
		).then((lignes) => lignes.map((l) => ({ label: l.label.value, siren: l.siren.value, site: l.site.value }))),
	]);
	const candidats = [
		...candidatsCommunes(ref, parCode, communesVerifiees),
		...candidatsEpci(ref, parSiren),
		...candidatsEtat(etat, ref.departements),
		...candidatsScolaires(education, nomsDep),
		...candidatsSante(lireJsonl(CORPUS_SANTE), nomsDep),
	];
	const retenusCandidats = Number.isFinite(LIMITE) ? candidats.slice(0, LIMITE) : candidats;
	console.error(`${retenusCandidats.length} candidats à vérifier (${candidats.length} au total)…`);
	const { retenus, echecs } = await verifierTous(retenusCandidats);
	const parType: Record<string, number> = {};
	for (const l of retenus) parType[String(l.type)] = (parType[String(l.type)] ?? 0) + 1;
	const rapport = {
		genereLe: new Date().toISOString(),
		dateVerification: DATE,
		protocole: "HTTP GET, redirect follow, 200 final, au moins un jeton discriminant du nom dans le texte visible",
		candidats: candidats.length,
		verifies: retenusCandidats.length,
		retenus: retenus.length,
		tauxVerification: retenusCandidats.length ? `${(100 * retenus.length / retenusCandidats.length).toFixed(1)} %` : "0 %",
		avecSiren: retenus.filter((l) => /^\d{9}$/.test(String(l.siren))).length,
		parType,
		echecsParType: echecs,
		sources: {
			communes: "referentiel-na.json + wikidata:P374/P856 + corpus communes",
			epci: "referentiel-na.json + wikidata:P1616/P856",
			prefectures_sdis: "wikidata:P1616/P856",
			education: "data.education.gouv.fr fr-en-annuaire-education",
			sante: "corpus sante-enseignement (FINESS + annuaire sante.fr)",
		},
	};
	mkdirSync(dirname(SORTIE), { recursive: true });
	mkdirSync(dirname(RAPPORT), { recursive: true });
	writeFileSync(SORTIE, retenus.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
	writeFileSync(RAPPORT, JSON.stringify(rapport, null, 2) + "\n", "utf8");
	if (!Number.isFinite(LIMITE)) writeFileSync(FICHIER_HASH, `${calculerHashCorpus()}\n`, "utf8");
	console.error(`${retenus.length} institutions retenues ; rapport ${RAPPORT}`);
}
