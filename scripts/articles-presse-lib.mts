/**
 * Fonctions pures d'extraction d'articles datés — aucune E/S réseau ici.
 * Partagées entre le collecteur et les tests nommés.
 */
export type ArticleLigne = {
	titre: string;
	url: string;
	date: string;
	commune: string | null;
	code_insee: string | null;
	departement: string | null;
	origine: 'commune' | 'presse';
	source_url: string;
	nom_source: string;
	statut_http: number;
	extrait: string;
	cyber: boolean;
	mots_cyber: string[];
	verifie_le: string;
};

const ENTITES: Record<string, string> = {
	amp: '&', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è',
	agrave: 'à', ccedilla: 'ç', ugrave: 'ù', ocirc: 'ô', icirc: 'î',
	ecirc: 'ê', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
};

export function decodeHtml(valeur: string): string {
	return valeur
		.replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&([a-z]+);/gi, (tout, nom: string) => ENTITES[nom.toLowerCase()] ?? tout)
		.replace(/\s+/g, ' ')
		.trim();
}

export function normaliseArticle(valeur: string): string {
	return valeur.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function attribut(html: string, motif: RegExp): string | null {
	const trouve = motif.exec(html);
	return trouve?.[1] ? decodeHtml(trouve[1]) : null;
}

function dateValide(valeur: string): string | null {
	const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur.trim());
	if (!iso) return null;
	const annee = Number(iso[1]);
	const mois = Number(iso[2]);
	const jour = Number(iso[3]);
	const maintenant = new Date();
	if (annee < 2015 || annee > maintenant.getUTCFullYear() + 1 || mois < 1 || mois > 12 || jour < 1 || jour > 31) {
		return null;
	}
	return `${iso[1]}-${iso[2]}-${iso[3]}`;
}

function parcoursJsonLd(noeud: unknown, sortie: { date: string | null; titre: string | null }): void {
	if (!noeud || typeof noeud !== 'object') return;
	if (Array.isArray(noeud)) {
		for (const element of noeud) parcoursJsonLd(element, sortie);
		return;
	}
	const objet = noeud as Record<string, unknown>;
	if (!sortie.date && typeof objet.datePublished === 'string') {
		sortie.date = dateValide(objet.datePublished);
		if (sortie.date) {
			sortie.titre = typeof objet.headline === 'string'
				? decodeHtml(objet.headline)
				: typeof objet.name === 'string' ? decodeHtml(objet.name) : null;
		}
	}
	for (const valeur of Object.values(objet)) parcoursJsonLd(valeur, sortie);
}

/** Date de publication réellement présente dans la page (JSON-LD ou métadonnées). */
export function dateDepuisHtml(html: string): { date: string | null; titre: string | null } {
	const sortie: { date: string | null; titre: string | null } = { date: null, titre: null };
	const blocs = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let correspondance: RegExpExecArray | null;
	while ((correspondance = blocs.exec(html)) !== null && !sortie.date) {
		try {
			parcoursJsonLd(JSON.parse(correspondance[1]!), sortie);
		} catch {
			// JSON-LD invalide : les métadonnées ci-dessous prennent le relais.
		}
	}
	if (!sortie.date) {
		const date = attribut(html, /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:article:published_time|og:article:published_time|datePublished|date|DC\.date\.issued)["'][^>]*content\s*=\s*["']([^"']+)["']/i)
			?? attribut(html, /<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i);
		sortie.date = date ? dateValide(date) : null;
	}
	return sortie;
}

/** Titre lisible d'une page d'article, sans le suffixe du site. */
export function titreDepuisHtml(html: string, repli: string | null = null): string | null {
	const brut = attribut(html, /<meta\b[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["']/i)
		?? attribut(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i)
		?? attribut(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i)
		?? repli;
	if (!brut) return null;
	const titre = brut.replace(/<[^>]+>/g, ' ').trim();
	return titre.length >= 12 ? titre.slice(0, 180) : null;
}

/** Premier paragraphe utile : extrait vérifiable, jamais inventé. */
export function extraitDepuisHtml(html: string): string {
	const meta = attribut(html, /<meta\b[^>]*(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*content\s*=\s*["']([^"']+)["']/i);
	if (meta && meta.length >= 40) return meta.slice(0, 320);
	const paragraphes = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
	let correspondance: RegExpExecArray | null;
	while ((correspondance = paragraphes.exec(html)) !== null) {
		const texte = decodeHtml(correspondance[1]!.replace(/<[^>]+>/g, ' '));
		if (texte.length >= 60) return texte.slice(0, 320);
	}
	return '';
}

/** Liens d'articles internes d'une page de liste ou d'actualités. */
export function liensArticle(html: string, base: string, limite = 6): string[] {
	const sortie: string[] = [];
	let baseUrl: URL;
	try {
		baseUrl = new URL(base);
	} catch {
		return sortie;
	}
	const motif = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
	let correspondance: RegExpExecArray | null;
	while ((correspondance = motif.exec(html)) !== null && sortie.length < limite) {
		const href = correspondance[1] ?? '';
		const libelle = decodeHtml(correspondance[2]!.replace(/<[^>]+>/g, ' '));
		if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
		let url: URL;
		try {
			url = new URL(href, base);
		} catch {
			continue;
		}
		if (!/^https?:$/.test(url.protocol) || url.hostname !== baseUrl.hostname) continue;
		url.hash = '';
		const chemin = normaliseArticle(url.pathname);
		const probable = /(actualit|article|news|evenement|nouvelle|communique|info|\d{4}\/\d{2})/.test(chemin)
			|| libelle.split(/\s+/).filter(Boolean).length >= 5;
		if (!probable || libelle.length < 12) continue;
		const valeur = url.toString();
		if (!sortie.includes(valeur) && valeur !== base) sortie.push(valeur);
	}
	return sortie;
}

const MOTS_CYBER: [string, RegExp][] = [
	['cyber', /cyber/],
	['rancongiciel', /rancongiciel|ransomware/],
	['piratage', /piratage|hacke|hacker|hacking|pirate/],
	['fuite de donnees', /fuite de donnees|violation de donnees|donnees volees|donnees exposees|exfiltration/],
	['phishing', /phishing|hameconnage/],
	['malware', /malware|logiciel espion|cheval de troie|botnet/],
	['ddos', /ddos|deni de service/],
	['incident informatique', /incident informatique|failles? de securite|vulnerabilite|systeme informatique|site internet indisponible|cyberattaque/],
];

/** Mots-clés cyber réellement présents dans le texte normalized (aucune inférence). */
export function motsCyberDetectes(texte: string): string[] {
	const contenu = normaliseArticle(texte);
	const trouves: string[] = [];
	for (const [etiquette, motif] of MOTS_CYBER) {
		if (motif.test(contenu)) trouves.push(etiquette);
	}
	return trouves;
}
