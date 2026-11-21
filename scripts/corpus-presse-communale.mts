#!/usr/bin/env node
/**
 * Corpus « presse locale exhaustive » — Nouvelle-Aquitaine.
 *
 * Pour chaque commune de plus de 2 000 habitants :Find la source d'information
 * locale existante (journal municipal, page d'actualité de la mairie,
 * correspondant de presse), puis vérifie HTTP 200 + contenu nominatif.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/corpus-presse-communale.mts \
 *     --json=bench/results/presse-communale-2026-11-21.json
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
	DEPARTEMENTS_NA,
	candidatsUrl,
	classifieSource,
	contenuValide,
	estCible,
	extraitPreuve,
	htmlEnTexte,
	liensInternes,
	ligneCorpus,
	normalise,
	type CommuneCible,
	type SourceType,
} from './presse-communale-lib.mts';

const CSV_URL =
	'https://static.data.gouv.fr/resources/communes-et-villes-de-france-en-csv-excel-json-parquet-et-feather/20260617-160400/communes-france-2026.csv.gz';
const DATASET_ID = '6745d9ae4524d845d2138193';
const RESSOURCE_ID = 'c63fd0b1-7987-46f6-b779-8b3ed889090c';
const SPARQL = 'https://query.wikidata.org/sparql';
const SORTIE = resolve('bench/corpus/presse-communale.jsonl');
const USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const TIMEOUT_MS = 12_000;
const MAX_OCTETS = 300_000;

type Sondage = {
	statut: number | null;
	html: string;
	texte: string;
	raison: string | null;
};

type Tentative = { url: string; statut: number | null; raison: string | null };

function message(erreur: unknown): string {
	return erreur instanceof Error ? erreur.message : String(erreur);
}

function parseArgs(argv: string[]) {
	const opt = (nom: string, defaut: string): string => {
		const prefixe = `--${nom}=`;
		const egal = argv.find((a) => a.startsWith(prefixe));
		if (egal) return egal.slice(prefixe.length) || defaut;
		const i = argv.indexOf(`--${nom}`);
		return i >= 0 && argv[i + 1] && !argv[i + 1]?.startsWith('--') ? argv[i + 1]! : defaut;
	};
	return {
		json: resolve(opt('json', 'bench/results/presse-communale-2026-11-21.json')),
		sortie: resolve(opt('sortie', SORTIE)),
		concurrence: Math.max(1, Number(opt('concurrence', '24')) || 24),
		limite: Math.max(0, Number(opt('limite', '0')) || 0),
		dryRun: argv.includes('--dry-run'),
	};
}

/** Parseur CSV minimal mais correct sur les champs cités (guillemets doublés). */
function parseCsv(contenu: string): Record<string, string>[] {
	const lignes: string[][] = [];
	let champ = '';
	let ligne: string[] = [];
	let cité = false;
	for (let i = 0; i < contenu.length; i++) {
		const c = contenu[i]!;
		if (cité) {
			if (c === '"' && contenu[i + 1] === '"') {
				champ += '"';
				i++;
			} else if (c === '"') {
				cité = false;
			} else {
				champ += c;
			}
		} else if (c === '"') {
			cité = true;
		} else if (c === ',') {
			ligne.push(champ);
			champ = '';
		} else if (c === '\n') {
			ligne.push(champ.replace(/\r$/, ''));
			lignes.push(ligne);
			ligne = [];
			champ = '';
		} else {
			champ += c;
		}
	}
	if (champ !== '' || ligne.length > 0) {
		ligne.push(champ.replace(/\r$/, ''));
		lignes.push(ligne);
	}
	const entete = lignes.shift() ?? [];
	return lignes
		.filter((l) => l.length === entete.length)
		.map((l) => Object.fromEntries(entete.map((cle, index) => [cle, l[index] ?? ''])));
}

async function communesCibles(): Promise<CommuneCible[]> {
	const reponse = await fetch(CSV_URL, {
		headers: { 'user-agent': USER_AGENT },
		signal: AbortSignal.timeout(90_000),
	});
	if (!reponse.ok) throw new Error(`CSV data.gouv.fr : HTTP ${reponse.status}`);
	const brut = Buffer.from(await reponse.arrayBuffer());
	const csv = gunzipSync(brut).toString('utf8');
	const cibles: CommuneCible[] = [];
	for (const ligne of parseCsv(csv)) {
		const population = Number(ligne.population);
		if (!estCible(ligne.reg_code ?? '', population)) continue;
		const departement = ligne.dep_code ?? ligne.code_insee?.slice(0, 2) ?? '';
		if (!DEPARTEMENTS_NA[departement]) continue;
		cibles.push({
			code_insee: ligne.code_insee!,
			nom: ligne.nom_standard!,
			departement,
			population,
			url_wikipedia: ligne.url_wikipedia || undefined,
		});
	}
	return cibles.sort((a, b) => a.code_insee.localeCompare(b.code_insee));
}

/** Wikidata P856 : site officiel déclaré, indexé par code INSEE. */
async function sitesWikidata(codes: string[]): Promise<Map<string, string[]>> {
	const valeurs = codes.map((code) => `"${code}"`).join(' ');
	const requete = `SELECT ?insee ?site WHERE { VALUES ?insee { ${valeurs} } ?commune wdt:P374 ?insee ; wdt:P856 ?site . }`;
	const url = new URL(SPARQL);
	url.searchParams.set('query', requete);
	url.searchParams.set('format', 'json');
	const resultat = await fetch(url, {
		headers: { accept: 'application/sparql-results+json', 'user-agent': USER_AGENT },
		signal: AbortSignal.timeout(120_000),
	});
	if (!resultat.ok) throw new Error(`Wikidata SPARQL : HTTP ${resultat.status}`);
	const json = (await resultat.json()) as {
		results: { bindings: { insee: { value: string }; site: { value: string } }[] };
	};
	const carte = new Map<string, string[]>();
	for (const l of json.results.bindings) {
		const tableau = carte.get(l.insee.value) ?? [];
		tableau.push(l.site.value);
		carte.set(l.insee.value, tableau);
	}
	for (const [code, urls] of carte) {
		carte.set(code, [...new Set(urls)].sort((a, b) => (a.startsWith('https') === b.startsWith('https') ? 0 : a.startsWith('https') ? -1 : 1)));
	}
	return carte;
}

/** URL déjà confirmées par le corpus commune existant (population > 10 000). */
async function urlsConfirmees(): Promise<Map<string, string[]>> {
	const carte = new Map<string, string[]>();
	try {
		const brut = await readFile(resolve('bench/corpus/communes.jsonl'), 'utf8');
		for (const ligne of brut.split('\n')) {
			if (!ligne.trim()) continue;
			const j = JSON.parse(ligne) as { code_insee?: string; url_finale?: string; statut_http?: number };
			if (j.code_insee && j.url_finale && j.statut_http === 200) {
				carte.set(j.code_insee, [...(carte.get(j.code_insee) ?? []), j.url_finale]);
			}
		}
	} catch {
		// Corpus antérieur absent : les candidats Wikidata suffisent.
	}
	return carte;
}

async function sonde(url: string): Promise<Sondage> {
	try {
		const reponse = await fetch(url, {
			method: 'GET',
			headers: {
				'user-agent': USER_AGENT,
				accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
				'accept-language': 'fr-FR,fr;q=0.9',
			},
			redirect: 'follow',
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		const type = reponse.headers.get('content-type') ?? '';
		if (reponse.status !== 200) {
			await reponse.body?.cancel().catch(() => {});
			return { statut: reponse.status, html: '', texte: '', raison: `HTTP ${reponse.status}` };
		}
		if (!/(text\/html|application\/xhtml|text\/plain)/i.test(type)) {
			await reponse.body?.cancel().catch(() => {});
			return { statut: 200, html: '', texte: '', raison: `type ${type || 'inconnu'}` };
		}
		const lecteur = reponse.body?.getReader();
		const morceaux: Uint8Array[] = [];
		let total = 0;
		if (lecteur) {
			while (total < MAX_OCTETS) {
				const { done, value } = await lecteur.read();
				if (done) break;
				morceaux.push(value!);
				total += value!.length;
			}
			await lecteur.cancel().catch(() => {});
		}
		const html = Buffer.concat(morceaux.map((m) => Buffer.from(m))).toString('utf8');
		const texte = normalise(htmlEnTexte(html));
		return { statut: 200, html, texte, raison: null };
	} catch (erreur) {
		return { statut: null, html: '', texte: '', raison: message(erreur).slice(0, 120) };
	}
}

async function traite(commune: CommuneCible, sites: Map<string, string[]>, connus: Map<string, string[]>, verifie_le: string) {
	const candidats = candidatsUrl(commune, sites.get(commune.code_insee) ?? [], connus.get(commune.code_insee) ?? []);
	const tentatives: Tentative[] = [];
	let retenu: { url: string; html: string; texte: string; candidat: string } | null = null;

	for (const url of candidats) {
		const resultat = await sonde(url);
		if (resultat.statut === 200 && contenuValide(commune.nom, resultat.texte)) {
			retenu = { url, html: resultat.html, texte: resultat.texte, candidat: url };
			tentatives.push({ url, statut: 200, raison: null });
			break;
		}
		tentatives.push({
			url,
			statut: resultat.statut,
			raison: resultat.raison ?? 'contenu sans mention de la commune',
		});
	}

	if (!retenu) {
		return ligneCorpus({
			commune,
			url: null,
			type: null,
			statut: 'sans_source',
			http: tentatives[0]?.statut ?? null,
			raison: tentatives.length === 0
				? 'aucune URL de site officiel connue et aucun domaine candidat'
				: tentatives.map((t) => `${new URL(t.url).hostname}: ${t.raison ?? 'HTTP ' + t.statut}`).join(' | '),
			preuve: null,
			candidat: null,
			tentatives,
			verifie_le,
		});
	}

	// Deuxième passe : préférer un vrai journal municipal ou une page
	// d'actualités détectée depuis la page d'accueil déjà téléchargée.
	let urlFinale = retenu.url;
	let htmlFinal = retenu.html;
	let texteFinal = retenu.texte;
	let type: SourceType = classifieSource(urlFinale, texteFinal);
	if (type !== 'journal municipal' && type !== 'correspondant de presse') {
		const journaux = liensInternes(htmlFinal, urlFinale, /journal|bulletin|lettre/);
		const actualites = liensInternes(htmlFinal, urlFinale, /actualit/);
		for (const lien of [...journaux.slice(0, 1), ...actualites.slice(0, 1)]) {
			const resultat = await sonde(lien);
			if (resultat.statut === 200 && contenuValide(commune.nom, resultat.texte)) {
				urlFinale = lien;
				htmlFinal = resultat.html;
				texteFinal = resultat.texte;
				type = classifieSource(urlFinale, texteFinal);
				break;
			}
		}
	} else if (type === 'correspondant de presse') {
		// Le lien « contact presse » n'est pas une source d'information :
		// on reste sur la page d'actualités de la mairie.
		type = 'page actualité mairie';
	}
	if (type === 'correspondant de presse') type = 'page actualité mairie';

	return ligneCorpus({
		commune,
		url: urlFinale,
		type,
		statut: 'verifie',
		http: 200,
		raison: null,
		preuve: extraitPreuve(texteFinal),
		candidat: retenu.candidat,
		tentatives,
		verifie_le,
	});
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const communes = await communesCibles();
	const cibles = args.limite ? communes.slice(0, args.limite) : communes;
	let sites: Map<string, string[]>;
	try {
		sites = await sitesWikidata(cibles.map((c) => c.code_insee));
	} catch (erreur) {
		// Wikidata peut être indisponible : les URL confirmées et les domaines
		// déduits restent exploitables, on ne perd pas la collecte entière.
		process.stderr.write(`wikidata indisponible, repli sans P856 : ${message(erreur)}\n`);
		sites = new Map();
	}
	const connus = await urlsConfirmees();
	const verifie_le = new Date().toISOString().slice(0, 10);

	const lignes: ReturnType<typeof ligneCorpus>[] = new Array(cibles.length);
	let suivant = 0;
	const travailleur = async (): Promise<void> => {
		while (true) {
			const index = suivant++;
			if (index >= cibles.length) return;
			lignes[index] = await traite(cibles[index]!, sites, connus, verifie_le);
		}
	};
	await Promise.all(Array.from({ length: Math.min(args.concurrence, cibles.length) }, travailleur));

	const verifies = lignes.filter((l) => l.statut === 'verifie');
	const sansSource = lignes.filter((l) => l.statut !== 'verifie');
	const parType: Record<string, number> = {};
	const parDepartement: Record<string, { cibles: number; verifies: number }> = {};
	const raisons: Record<string, number> = {};
	for (const l of lignes) {
		if (l.type) parType[l.type] = (parType[l.type] ?? 0) + 1;
		const dept = parDepartement[l.departement] ?? { cibles: 0, verifies: 0 };
		dept.cibles++;
		if (l.statut === 'verifie') dept.verifies++;
		parDepartement[l.departement] = dept;
		if (l.statut !== 'verifie') {
			const cle = !l.url ? 'aucune URL connue' : (l.raison ?? 'inconnue').split(':')[0]!;
			raisons[cle] = (raisons[cle] ?? 0) + 1;
		}
	}

	const rapport = {
		titre: 'Presse communale exhaustive — Nouvelle-Aquitaine',
		genere_le: verifie_le,
		population: {
			jeu: 'communes-france-2026.csv.gz',
			url: CSV_URL,
			dataset_id: DATASET_ID,
			ressource_id: RESSOURCE_ID,
			filtre: 'reg_code = 75 (Nouvelle-Aquitaine) ET population > 2000',
		},
		sites: {
			primaire: 'Wikidata P856 (site officiel), requête SPARQL par VALUES ?insee',
			repli: 'URL confirmées du corpus communes.jsonl + domaines mairie-/ville- déduits',
			verification: 'HTTP 200 + text/html + >= 150 caractères + jeton distinctif du nom de la commune',
		},
		comptes: {
			communes_cibles: lignes.length,
			avec_source_verifiee: verifies.length,
			sans_source: sansSource.length,
			taux_couverture_pct: lignes.length ? Math.round((verifies.length / lignes.length) * 1000) / 10 : 0,
			par_type: parType,
			par_departement: parDepartement,
			raisons_sans_source: raisons,
		},
	};

	if (!args.dryRun) {
		await mkdir(dirname(args.sortie), { recursive: true });
		await mkdir(dirname(args.json), { recursive: true });
		const contenu = lignes.map((l) => JSON.stringify(l)).join('\n');
		await writeFile(args.sortie, contenu === '' ? '' : `${contenu}\n`, 'utf8');
		await writeFile(args.json, `${JSON.stringify(rapport, null, 2)}\n`, 'utf8');
	}

	console.log(JSON.stringify({
		communes_cibles: rapport.comptes.communes_cibles,
		avec_source_verifiee: rapport.comptes.avec_source_verifiee,
		sans_source: rapport.comptes.sans_source,
		taux_couverture_pct: rapport.comptes.taux_couverture_pct,
		par_type: parType,
		sortie: args.dryRun ? null : args.sortie,
	}, null, 2));
}

try {
	await main();
} catch (erreur) {
	process.stderr.write(`corpus-presse-communale: ${message(erreur)}\n`);
	process.exitCode = 1;
}
