#!/usr/bin/env node
/**
 * Corpus d'articles de presse locale/régionale datés — Nouvelle-Aquitaine.
 *
 * Les URL proviennent des flux RSS/Atom et des pages d'actualité des sources
 * déjà vérifiées. Chaque article retenu a été téléchargé (HTTP 200, contenu
 * lisible) et porte une date de publication réellement publiée par la source :
 * métadonnée JSON-LD/<meta>/<time> de la page, sinon date du flux.
 * Aucun article n'est fabriqué, aucun contenu payant n'est contourné,
 * aucune donnée personnelle de victime n'est stockée.
 *
 * Usage :
 *   apps/api/node_modules/.bin/tsx scripts/collecte-articles-presse.mts \
 *     --concurrence=28 --max=900 --budget-ms=45000
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DEPARTEMENTS_NA } from './presse-communale-lib.mts';
import {
	dateDepuisHtml,
	extraitDepuisHtml,
	itemsFlux,
	liensAlternatifsFlux,
	liensArticle,
	motsCyberDetectes,
	sitemapsEnfants,
	titreDepuisHtml,
	urlsCyberSitemap,
	type ArticleLigne,
} from './articles-presse-lib.mts';

const COMMUNE_CORPUS = resolve('bench/corpus/presse-communale.jsonl');
const PRESSE_CORPUS = resolve('bench/corpus/presse.jsonl');
const SORTIE = resolve('bench/corpus/articles-presse-na.jsonl');
const RAPPORT = resolve('bench/results/articles-presse-na-2026-11-21.json');
const USER_AGENT =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const TIMEOUT_MS = 6000;
const MAX_OCTETS = 250_000;
const MOIS_SITEMAPS = ['2026-11', '2026-10', '2026-09'];
const DOMAINES_SITEMAP = new Set([
	'www.charentelibre.fr', 'www.sudouest.fr', 'www.ici.fr', 'www.dordognelibre.fr',
	'france3-regions.franceinfo.fr', 'www.lamontagne.fr', 'www.lepopulaire.fr',
]);

type Source = {
	url: string;
	origine: 'commune' | 'presse';
	commune: string | null;
	code_insee: string | null;
	departement: string | null;
	nom_source: string;
	flux: boolean;
};
type Candidat = {
	source: Source;
	url: string;
	date: string | null;
	titre: string | null;
	extrait: string;
};

const DEPARTEMENT_CODE: Record<string, string> = Object.fromEntries(
	Object.entries(DEPARTEMENTS_NA).map(([code, nom]) => [nom.toLowerCase(), code]),
);

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
	return {
		concurrence: opt('concurrence', 28),
		max: opt('max', 900),
		budget: opt('budget-ms', 45_000),
		parSource: opt('par-source', 40),
	};
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
		const nom = String(departements[0] ?? '').toLowerCase();
		sortie.push({
			url: l.url,
			origine: 'presse',
			commune: typeof l.nom === 'string' ? l.nom : null,
			code_insee: null,
			departement: DEPARTEMENT_CODE[nom] ?? null,
			nom_source: typeof l.nom === 'string' ? l.nom : 'Presse régionale',
			flux: l.type === 'rss' || /\/(?:rss|feed|flux)(?:\.xml|\/|$)/i.test(l.url),
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
			flux: false,
		});
	}
	// Les flux donnent des URL d'articles et leurs dates : on les interroge d'abord.
	return sortie.sort((a, b) => Number(b.flux) - Number(a.flux));
}

async function getTexte(url: string, htmlSeul: boolean, maxOctets = MAX_OCTETS): Promise<string | null> {
	try {
		const reponse = await fetch(url, {
			headers: {
				'user-agent': USER_AGENT,
				accept: htmlSeul
					? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'
					: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.5',
				'accept-language': 'fr-FR,fr;q=0.9',
			},
			redirect: 'follow',
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		const type = reponse.headers.get('content-type') ?? '';
		if (reponse.status !== 200 || !(htmlSeul ? /text\/html/i : /html|xml|text\/plain/i).test(type)) {
			await reponse.body?.cancel().catch(() => {});
			return null;
		}
		const lecteur = reponse.body?.getReader();
		const morceaux: Uint8Array[] = [];
		let total = 0;
		if (lecteur) {
			while (total < maxOctets) {
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

function ajouteCandidat(
	taches: Candidat[],
	vus: Set<string>,
	source: Source,
	url: string,
	date: string | null,
	titre: string | null,
	extrait: string,
	parSource: number,
): void {
	if (vus.has(url)) return;
	let deja = 0;
	for (let i = taches.length - 1; i >= 0 && deja < parSource; i--) {
		if (taches[i]!.source.url === source.url) deja++;
	}
	if (deja >= parSource) return;
	vus.add(url);
	taches.push({ source, url, date, titre, extrait });
}

/** Découverte ciblée : sitemaps mensuels des quotidiens, URLs dont le intitulé annonce un fait cyber. */
async function candidatsCyber(listeSources: Source[], limite: number, parSource: number): Promise<Candidat[]> {
	const sortie: Candidat[] = [];
	const origines = new Map<string, Source>();
	for (const source of listeSources) {
		if (source.origine !== 'presse') continue;
		let hote: string;
		try {
			hote = new URL(source.url).hostname;
		} catch {
			continue;
		}
		if (!DOMAINES_SITEMAP.has(hote)) continue;
		const origine = new URL(source.url).origin;
		if (!origines.has(origine)) origines.set(origine, source);
	}
	await Promise.all([...origines].map(async ([origine, source]) => {
		if (Date.now() >= limite) return;
		const indexUrl = `${origine}/sitemap.xml`;
		const index = await getTexte(indexUrl, false, 2_000_000);
		if (!index) return;
		const enfants = sitemapsEnfants(index, indexUrl, 300)
			.filter((url) => MOIS_SITEMAPS.some((mois) => url.includes(mois)))
			.slice(0, 9);
		await Promise.all(enfants.map(async (enfant) => {
			if (Date.now() >= limite) return;
			const xml = await getTexte(enfant, false, 6_000_000);
			if (!xml) return;
			for (const url of urlsCyberSitemap(xml, enfant, parSource)) {
				if (!sortie.some((c) => c.url === url)) {
					sortie.push({ source, url, date: null, titre: null, extrait: '' });
				}
			}
		}));
	}));
	return sortie;
}

async function main(): Promise<void> {
	const debut = Date.now();
	const args = parseArgs(process.argv.slice(2));
	const limite = debut + args.budget;
	const limiteDecouverte = debut + Math.floor(args.budget * 0.35);
	const listeSources = await sources();
	const verifie_le = new Date().toISOString().slice(0, 10);
	const deja = await lignes(SORTIE) as unknown as ArticleLigne[];
	const articles = new Map<string, ArticleLigne>();
	for (const a of deja) if (typeof a.url === 'string') articles.set(a.url, a);
	for (const a of articles.values()) {
		const mots = motsCyberDetectes(`${a.titre} ${a.extrait}`);
		a.cyber = mots.length > 0;
		a.mots_cyber = mots;
	}
	const taches: Candidat[] = [];
	const vus = new Set<string>(articles.keys());
	const cyberSitemaps = await candidatsCyber(listeSources, limiteDecouverte, args.parSource);
	for (const candidat of cyberSitemaps) {
		if (vus.has(candidat.url)) continue;
		vus.add(candidat.url);
		taches.push(candidat);
	}
	let curseur = 0;
	const decouvreur = async (): Promise<void> => {
		while (Date.now() < limiteDecouverte && articles.size + taches.length < args.max * 2) {
			const index = curseur++;
			if (index >= listeSources.length) return;
			const source = listeSources[index]!;
			if (source.flux) {
				const xml = await getTexte(source.url, false);
				if (!xml) continue;
				for (const item of itemsFlux(xml, source.url, args.parSource)) {
					ajouteCandidat(taches, vus, source, item.url, item.date, item.titre, item.extrait, args.parSource);
				}
				continue;
			}
			const html = await getTexte(source.url, true);
			if (!html) continue;
			for (const url of liensAlternatifsFlux(html, source.url)) {
				const xml = await getTexte(url, false);
				if (!xml) continue;
				for (const item of itemsFlux(xml, source.url, args.parSource)) {
					ajouteCandidat(taches, vus, source, item.url, item.date, item.titre, item.extrait, args.parSource);
				}
			}
			for (const url of liensArticle(html, source.url, 4)) {
				ajouteCandidat(taches, vus, source, url, null, null, '', args.parSource);
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(args.concurrence, listeSources.length) }, decouvreur));

	let suivant = 0;
	const travailleur = async (): Promise<void> => {
		while (Date.now() < limite && articles.size < args.max) {
			const index = suivant++;
			if (index >= taches.length) return;
			const tache = taches[index]!;
			const html = await getTexte(tache.url, true);
			if (!html) continue;
			const page = dateDepuisHtml(html);
			const date = page.date ?? tache.date;
			if (!date) continue;
			const titre = titreDepuisHtml(html, page.titre ?? tache.titre);
			if (!titre) continue;
			const extrait = extraitDepuisHtml(html) || tache.extrait;
			const mots = motsCyberDetectes(`${titre} ${extrait}`);
			articles.set(tache.url, {
				titre,
				url: tache.url,
				date,
				date_source: page.date ? 'page' : 'flux',
				commune: tache.source.commune,
				code_insee: tache.source.code_insee,
				departement: tache.source.departement,
				origine: tache.source.origine,
				source_url: tache.source.url,
				nom_source: tache.source.nom_source,
				statut_http: 200,
				extrait,
				cyber: mots.length > 0,
				mots_cyber: mots,
				verifie_le,
			});
		}
	};
	await Promise.all(Array.from({ length: Math.min(args.concurrence, taches.length) }, travailleur));

	const liste = [...articles.values()].sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url));
	const cyber = liste.filter((a) => a.cyber);
	const parOrigine: Record<string, number> = {};
	const parAnnee: Record<string, number> = {};
	const parDate: Record<string, number> = {};
	const communesCyber = new Set<string>();
	for (const a of liste) {
		parOrigine[a.origine] = (parOrigine[a.origine] ?? 0) + 1;
		parAnnee[a.date.slice(0, 4)] = (parAnnee[a.date.slice(0, 4)] ?? 0) + 1;
		parDate[a.date] = (parDate[a.date] ?? 0) + 1;
		if (a.cyber && a.code_insee) communesCyber.add(a.code_insee);
	}
	const rapport = {
		titre: 'Articles de presse locale et régionale datés — Nouvelle-Aquitaine',
		genere_le: verifie_le,
		method: {
			decouverte: 'flux RSS/Atom et pages d’actualité des sources vérifiées, complétés par les sitemaps mensuels filtrés sur les sujets cyber',
			verification: 'HTTP 200 + text/html + titre >= 12 caractères + date de publication réellement publiée (page ou flux)',
			cyber: 'heuristique de mots-clés sur le titre et l’extrait : candidats à la revue, pas des incidents confirmés',
			sources: {
				communes_verifiees: listeSources.filter((s) => s.origine === 'commune').length,
				presse: listeSources.filter((s) => s.origine === 'presse').length,
			},
		},
		comptes: {
			sources_interrogees: listeSources.length,
			candidats_decouverts: taches.length,
			candidats_cyber_sitemap: cyberSitemaps.length,
			articles_collectes: liste.length,
			articles_dates: liste.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.date)).length,
			articles_dates_par_la_page: liste.filter((a) => a.date_source === 'page').length,
			par_origine: parOrigine,
			par_annee: parAnnee,
			articles_le_dernier_jour: Object.entries(parDate).sort((a, b) => b[0].localeCompare(a[0]))[0] ?? null,
			candidats_cyber: cyber.length,
			incidents_cyber_extraits: cyber.length,
			communes_avec_candidat_cyber: communesCyber.size,
		},
		candidats_cyber: cyber.map((a) => ({ titre: a.titre, url: a.url, date: a.date, commune: a.commune, mots: a.mots_cyber })),
	};

	await mkdir(dirname(SORTIE), { recursive: true });
	await mkdir(dirname(RAPPORT), { recursive: true });
	await writeFile(SORTIE, liste.map((l) => JSON.stringify(l)).join('\n') + (liste.length ? '\n' : ''), 'utf8');
	await writeFile(RAPPORT, `${JSON.stringify(rapport, null, 2)}\n`, 'utf8');
	console.log(JSON.stringify({
		duree_ms: Date.now() - debut,
		articles_collectes: rapport.comptes.articles_collectes,
		articles_dates: rapport.comptes.articles_dates,
		par_origine: parOrigine,
		candidats_cyber: cyber.length,
	}, null, 2));
}

try {
	await main();
} catch (erreur) {
	process.stderr.write(`collecte-articles-presse: ${message(erreur)}\n`);
	process.exitCode = 1;
}
