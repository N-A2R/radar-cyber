#!/usr/bin/env node
/**
 * Corpus d'articles de presse locale/régionale datés — Nouvelle-Aquitaine.
 *
 * Une date n'est retenue que si elle est réellement publiée dans la page
 * (JSON-LD `datePublished`, métadonnée ou balise <time>) ; aucun article n'est
 * fabriqué et aucun contenu payant n'est contourné.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/collecte-articles-presse.mts \
 *     --concurrence=24 --max=900
import { DEPARTEMENTS_NA } from './presse-communale-lib.mjs';
import {
	dateDepuisHtml,
	extraitDepuisHtml,
	itemsFlux,
	liensAlternatifsFlux,
	liensArticle,
	motsCyberDetectes,
	sitemapsEnfants,
	titreDepuisHtml,
	type ArticleLigne,
	urlsSitemap,
} from './articles-presse-lib.mts';

const COMMUNE_CORPUS = resolve('bench/corpus/presse-communale.jsonl');
const PRESSE_CORPUS = resolve('bench/corpus/presse.jsonl');
const SORTIE = resolve('bench/corpus/articles-presse-na.jsonl');
const RAPPORT = resolve('bench/results/articles-presse-na-2026-11-21.json');
const USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const TIMEOUT_MS = 10_000;
const MAX_OCTETS = 300_000;

type Source = {
	url: string;
	origine: 'commune' | 'presse';
	commune: string | null;
	code_insee: string | null;
	departement: string | null;
	nom_source: string;
};
type Tache = { source: Source; url: string };

function message(erreur: unknown): string {
	return erreur instanceof Error ? erreur.message : String(erreur);
}

function parseArgs(argv: string[]) {
	const opt = (nom: string, defaut: number): number => {
		const prefixe = `--${nom}=`;
		const egal = argv.find((a) => a.startsWith(prefixe));
		const brut = egal ? egal.slice(prefixe.length) : argv[argv.indexOf(`--${nom}`) + 1];
		const valeur = Number(brut);
		return Number.isFinite(valeur) && valeur > 0 ? Math.floor(valeur) : defaut;
	};
	return { concurrence: opt('concurrence', 24), max: opt('max', 900), parSource: opt('par-source', 3) };
}

async function lignes(chemin: string): Promise<Record<string, unknown>[]> {
	try {
		return (await readFile(chemin, 'utf8')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
	} catch {
		return [];
	}
}

async function sources(): Promise<Source[]> {
	const sortie: Source[] = [];
	for (const l of await lignes(PRESSE_CORPUS)) {
		if (typeof l.url !== 'string' || !/^https?:/.test(l.url)) continue;
		const departements = Array.isArray(l.departements) ? l.departements : [];
		sortie.push({
			url: l.url,
			origine: 'presse',
			commune: typeof l.nom === 'string' ? l.nom : null,
			code_insee: null,
			departement: departements.length ? String(departements[0]) : null,
			nom_source: typeof l.nom === 'string' ? l.nom : 'Presse régionale',
		});
	}
	for (const l of await lignes(COMMUNE_CORPUS)) {
		if (l.statut !== 'verifie' || typeof l.url !== 'string') continue;
		sortie.push({
			url: l.url,
			origine: 'commune',
			commune: String(l.commune),
			code_insee: String(l.code_insee),
			departement: String(l.departement),
			nom_source: String(l.nom_source),
		});
	}
	return sortie;
}

async function getHtml(url: string): Promise<string | null> {
	try {
		const reponse = await fetch(url, {
			headers: {
				'user-agent': USER_AGENT,
				accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
				'accept-language': 'fr-FR,fr;q=0.9',
			},
			redirect: 'follow',
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		if (reponse.status !== 200 || !/text\/html/i.test(reponse.headers.get('content-type') ?? '')) {
			await reponse.body?.cancel().catch(() => {});
			return null;
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
		return Buffer.concat(morceaux.map((m) => Buffer.from(m))).toString('utf8');
	} catch {
		return null;
	}
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	const listeSources = await sources();
	const verifie_le = new Date().toISOString().slice(0, 10);
	const taches: Tache[] = [];

	// Pages de liste : on ne garde que les liens d'articles internes, vérifiables.
	let curseur = 0;
	const collecteur = async (): Promise<void> => {
		while (true) {
			const index = curseur++;
			if (index >= listeSources.length) return;
			const source = listeSources[index]!;
			const html = await getHtml(source.url);
			if (!html) continue;
			for (const url of liensArticle(html, source.url, args.parSource + 2)) {
				if (taches.length >= args.max * 4) break;
				taches.push({ source, url });
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(args.concurrence, listeSources.length) }, collecteur));

	const articles = new Map<string, ArticleLigne>();
	let suivant = 0;
	let sourcesVues = 0;
	const travailleur = async (): Promise<void> => {
		while (true) {
			if (articles.size >= args.max) return;
			const index = suivant++;
			if (index >= taches.length) return;
			const { source, url } = taches[index]!;
			if (articles.has(url)) continue;
			const html = await getHtml(url);
			if (!html) continue;
			const { date, titre: titreJson } = dateDepuisHtml(html);
			if (!date) continue;
			const titre = titreDepuisHtml(html, titreJson);
			if (!titre) continue;
			const extrait = extraitDepuisHtml(html);
			const mots = motsCyberDetectes(`${titre} ${extrait}`);
			articles.set(url, {
				titre,
				url,
				date,
				commune: source.commune,
				code_insee: source.code_insee,
				departement: source.departement,
				origine: source.origine,
				source_url: source.url,
				nom_source: source.nom_source,
				statut_http: 200,
				extrait,
				cyber: mots.length > 0,
				mots_cyber: mots,
				verifie_le,
			});
			sourcesVues++;
		}
	};
	await Promise.all(Array.from({ length: Math.min(args.concurrence, taches.length) }, travailleur));

	const liste = [...articles.values()].sort((a, b) => b.date.localeCompare(a.date));
	const cyber = liste.filter((a) => a.cyber);
	const parOrigine: Record<string, number> = {};
	const parAnnee: Record<string, number> = {};
	const communesCyber = new Set<string>();
	for (const a of liste) {
		parOrigine[a.origine] = (parOrigine[a.origine] ?? 0) + 1;
		parAnnee[a.date.slice(0, 4)] = (parAnnee[a.date.slice(0, 4)] ?? 0) + 1;
		if (a.cyber && a.code_insee) communesCyber.add(a.code_insee);
	}
	const rapport = {
		titre: 'Articles de presse locale et régionale datés — Nouvelle-Aquitaine',
		genere_le: verifie_le,
		method: {
			verification: 'HTTP 200 + title >= 12 caractères + date de publication lue dans la page (JSON-LD/métadonnée/<time>)',
			cyber: 'heuristique de mots-clés sur le titre et l’extrait ; candidats à la revue, pas des incidents confirmés',
			sources: { communes_verifiees: listeSources.filter((s) => s.origine === 'commune').length, presse: listeSources.filter((s) => s.origine === 'presse').length },
		},
		comptes: {
			sources_interrogees: listeSources.length,
			pages_liste_avec_liens: taches.length,
			articles_collectes: liste.length,
			articles_dates: liste.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.date)).length,
			par_origine: parOrigine,
			par_annee: parAnnee,
			candidats_cyber: cyber.length,
			communes_avec_candidat_cyber: communesCyber.size,
			articles_par_source_retenus: sourcesVues,
		},
		candidats_cyber: cyber.map((a) => ({ titre: a.titre, url: a.url, date: a.date, commune: a.commune, mots: a.mots_cyber })),
	};

	await mkdir(dirname(SORTIE), { recursive: true });
	await mkdir(dirname(RAPPORT), { recursive: true });
	await writeFile(SORTIE, liste.map((l) => JSON.stringify(l)).join('\n') + (liste.length ? '\n' : ''), 'utf8');
	await writeFile(RAPPORT, `${JSON.stringify(rapport, null, 2)}\n`, 'utf8');
	console.log(JSON.stringify({
		articles_collectes: rapport.comptes.articles_collectes,
		articles_dates: rapport.comptes.articles_dates,
		par_origine: parOrigine,
		candidats_cyber: cyber.length,
		communes_avec_candidat_cyber: communesCyber.size,
	}, null, 2));
}

try {
	await main();
} catch (erreur) {
	process.stderr.write(`collecte-articles-presse: ${message(erreur)}\n`);
	process.exitCode = 1;
}
