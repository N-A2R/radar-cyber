/**
 * Fonctions pures du corpus « presse communale » — aucune E/S réseau ici.
 * Partagées entre le générateur et le test nommé.
 */
export type CommuneCible = {
	code_insee: string;
	nom: string;
	departement: string;
	population: number;
	url_wikipedia?: string;
};

export type SourceType = 'journal municipal' | 'page actualité mairie' | 'site officiel mairie' | 'correspondant de presse';

export const DEPARTEMENTS_NA: Record<string, string> = {
	'16': 'Charente',
	'17': 'Charente-Maritime',
	'19': 'Corrèze',
	'23': 'Creuse',
	'24': 'Dordogne',
	'33': 'Gironde',
	'40': 'Landes',
	'47': 'Lot-et-Garonne',
	'64': 'Pyrénées-Atlantiques',
	'79': 'Deux-Sèvres',
	'86': 'Vienne',
	'87': 'Haute-Vienne',
};

const GENERIQUES = new Set([
	'saint', 'sainte', 'ville', 'mairie', 'commune', 'communaute', 'departement',
	'de', 'des', 'du', 'd', 'la', 'le', 'les', 'en', 'sur', 'sous', 'et', 'au',
	'aux', 'nouvelle', 'aquitaine', 'france', 'nord', 'sud', 'est', 'ouest',
	'grand', 'petit', 'petite', 'haut', 'haute', 'bas', 'basse', 'charente',
	'correze', 'creuse', 'dordogne', 'gironde', 'landes', 'lot', 'garonne',
	'pyrenees', 'atlantiques', 'vienne', 'sevres', 'limousin', 'poitou',
]);

/** Normalise pour comparaison : accents repliés, ponctuation en espaces. */
export function normalise(valeur: string): string {
	return valeur
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

/** Slug ASCII d'un nom de commune, pour les noms de domaine candidats. */
export function slugify(valeur: string): string {
	return normalise(valeur).replace(/\s+/g, '-');
}

/** Une commune cible : Nouvelle-Aquitaine (reg_code 75) et population > 2000. */
export function estCible(regCode: string, population: number): boolean {
	return regCode === '75' && Number.isFinite(population) && population > 2000;
}

/** Jetons distinctifs du nom d'une commune, du plus long au plus court. */
export function jetonsCommune(nom: string): string[] {
	return [...new Set(normalise(nom).split(' ').filter((mot) => mot.length >= 4 && !GENERIQUES.has(mot)))]
		.sort((a, b) => b.length - a.length);
}

/**
 * Candidats de sources locales, du plus fiable au plus spéculatif.
 * Les URL Wikidata (P856) et les URL déjà confirmées du corpus existant
 * passent en tête ; les noms de domaine déduits servent de repli.
 */
export function candidatsUrl(
	commune: CommuneCible,
	sitesWikidata: string[],
	urlsConfirmees: string[] = [],
): string[] {
	const slug = slugify(commune.nom);
	const compact = slug.replace(/-/g, '');
	const deduits = [
		slug ? `https://mairie-${slug}.fr` : null,
		compact ? `https://mairie-${compact}.fr` : null,
		slug ? `https://www.mairie-${slug}.fr` : null,
		slug ? `https://${slug}.fr` : null,
		compact ? `https://${compact}.fr` : null,
		slug ? `https://ville-${slug}.fr` : null,
	].filter((u): u is string => u !== null);
	return [...new Set([...urlsConfirmees, ...sitesWikidata, ...deduits])];
}

/** Accepte une page comme preuve de source locale : HTTP 200 + contenu nommé. */
export function contenuValide(nom: string, texte: string): boolean {
	if (texte.length < 150) return false;
	const jetons = jetonsCommune(nom);
	const cle = jetons.length > 0 ? jetons.some((jeton) => texte.includes(jeton)) : texte.includes(normalise(nom));
	if (!cle) return false;
	return /(mairie|commune|ville|actualite|municipal)/.test(texte);
}
export function extraitPreuve(texte: string, taille = 180): string {
	return texte.replace(/\s+/g, ' ').trim().slice(0, taille);
}

/** Type de source déduit de l'URL et du contenu de la page. */
export function classifieSource(url: string, texte: string): SourceType {
	const chemin = normalise(url);
	const contenu = normalise(texte);
	if (/(journal|bulletin|lettre municipale|lettre information)/.test(chemin)
		|| /(journal municipal|bulletin municipal|lettre d information|lettre municipale)/.test(contenu)) {
		return 'journal municipal';
	}
	if (/(correspondant de presse|attache de presse|contact presse)/.test(contenu)) {
		return 'correspondant de presse';
	}
	if (/actualite/.test(contenu) || /actualite/.test(chemin)) {
		return 'page actualité mairie';
	}
	return 'site officiel mairie';
}

/** Nom lisible de la source, tel qu'il apparaîtra dans le corpus. */
export function nomSource(commune: CommuneCible, type: SourceType, url: string): string {
	let hebergeur = '';
	try {
		hebergeur = new URL(url).hostname.replace(/^www\./, '');
	} catch {
		hebergeur = url;
	}
	if (type === 'site officiel mairie') return `Site officiel — Mairie de ${commune.nom}`;
	if (type === 'journal municipal') return `Journal municipal — ${commune.nom}`;
	if (type === 'correspondant de presse') return `Correspondant de presse — ${commune.nom}`;
	return `Actualités — Mairie de ${commune.nom} (${hebergeur})`;
}

/** Ligne JSONL du corpus : clés demandées en tête, puis preuves. */
export function ligneCorpus(args: {
	commune: CommuneCible;
	url: string | null;
	type: SourceType | null;
	statut: 'verifie' | 'non_verifie' | 'sans_source';
	http: number | null;
	raison: string | null;
	preuve: string | null;
	candidat: string | null;
	tentatives: { url: string; statut: number | null; raison: string | null }[];
	verifie_le: string;
}) {
	return {
		commune: args.commune.nom,
		code_insee: args.commune.code_insee,
		departement: args.commune.departement,
		nom_source: args.type ? nomSource(args.commune, args.type, args.url ?? '') : null,
		url: args.url,
		type: args.type,
		statut: args.statut,
		population: args.commune.population,
		statut_http: args.http,
		source_candidat: args.candidat,
		preuve: args.preuve,
		raison: args.raison,
		tentatives: args.tentatives,
		verifie_le: args.verifie_le,
	};
}

/** HTML → texte comparable (script/style/tags retirés, entités courantes repliées). */
export function htmlEnTexte(html: string): string {
	return html
		.replace(/<(script|style|noscript|svg|head|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&(?:nbsp|rsquo|lsquo|ldquo|rdquo|amp|quot|eacute|egrave|agrave|ccedilla|ugrave|ocirc|icirc|ecirc|hellip|#\d+|#x[0-9a-f]+);/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Liens internes d'une page, résolus en URL absolues. */
export function liensInternes(html: string, base: string, motsCles: RegExp, limite = 4): string[] {
	const sortie: string[] = [];
	const motif = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
	let correspondance: RegExpExecArray | null;
	while ((correspondance = motif.exec(html)) !== null && sortie.length < limite) {
		const href = correspondance[1] ?? '';
		const libelle = htmlEnTexte(correspondance[2] ?? '');
		if (!motsCles.test(href) && !motsCles.test(normalise(libelle))) continue;
		if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
		try {
			const url = new URL(href, base);
			if (!/^https?:$/.test(url.protocol)) continue;
			if (url.hostname !== new URL(base).hostname) continue;
			url.hash = '';
			const valeur = url.toString();
			if (!sortie.includes(valeur)) sortie.push(valeur);
		} catch {
			// Lien relatif invalide : ignoré.
		}
	}
	return sortie;
}
