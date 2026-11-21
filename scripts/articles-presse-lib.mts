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

function dateDepuisTexte(valeur: string): string | null {
	const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur.trim());
	if (iso) return dateValide(`${iso[1]}-${iso[2]}-${iso[3]}`);
	const temps = Date.parse(valeur);
	return Number.isFinite(temps) ? dateValide(new Date(temps).toISOString()) : null;
}

/** Zones horaires et formats de flux (RFC 2822) acceptés sans invention de date. */
export function dateFlux(valeur: string | null | undefined): string | null {
	return valeur ? dateDepuisTexte(valeur) : null;
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
		sortie.date = date ? dateDepuisTexte(date) : null;
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

export type ItemFlux = {
	url: string;
	date: string | null;
	titre: string | null;
	extrait: string;
};

function texteXml(brut: string | undefined): string {
	if (!brut) return '';
	return decodeHtml(brut.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '));
}

function urlInterne(href: string | undefined, base: string): string | null {
	if (!href) return null;
	try {
		const source = new URL(base);
		const cible = new URL(decodeHtml(href.trim()), base);
		if (!/^https?:$/.test(cible.protocol)) return null;
		const hote = source.hostname.replace(/^www\./, '');
		if (cible.hostname.replace(/^www\./, '') !== hote) return null;
		cible.hash = '';
		return cible.toString();
	} catch {
		return null;
	}
}

/** Articles annoncés par un flux RSS/Atom : les URLs servent seulement à la découverte. */
export function itemsFlux(xml: string, base: string, limite = 100): ItemFlux[] {
	const sortie: ItemFlux[] = [];
	const vus = new Set<string>();
	const blocs = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
	let correspondance: RegExpExecArray | null;
	while ((correspondance = blocs.exec(xml)) !== null && sortie.length < limite) {
		const bloc = correspondance[2]!;
		const href = /<link\b[^>]*href\s*=\s*["']([^"']+)["']/i.exec(bloc)?.[1]
			?? /<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(bloc)?.[1]
			?? /<guid\b[^>]*>([\s\S]*?)<\/guid>/i.exec(bloc)?.[1];
		const url = urlInterne(href, base);
		if (!url || vus.has(url)) continue;
		vus.add(url);
		const dateBrute = /<(?:pubDate|dc:date|published|updated|modified)\b[^>]*>([\s\S]*?)<\/(?:pubDate|dc:date|published|updated|modified)>/i.exec(bloc)?.[1];
		const titre = texteXml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(bloc)?.[1]);
		const extrait = texteXml(/<(?:description|summary)\b[^>]*>([\s\S]*?)<\/(?:description|summary)>/i.exec(bloc)?.[1]);
		sortie.push({ url, date: dateFlux(dateBrute), titre, extrait });
	}
	return sortie;
}

/** Liens de flux annoncés par une page d'accueil (balises <link rel="alternate">). */
export function liensAlternatifsFlux(html: string, base: string): string[] {
	const sortie: string[] = [];
	const motif = /<link\b[^>]*>/gi;
	let correspondance: RegExpExecArray | null;
	while ((correspondance = motif.exec(html)) !== null) {
		const balise = correspondance[0];
		if (!/rss\+xml|atom\+xml/i.test(balise) || !/rel\s*=\s*["']alternate["']/i.test(balise)) continue;
		const url = urlInterne(/href\s*=\s*["']([^"']+)["']/i.exec(balise)?.[1], base);
		if (url && !sortie.includes(url)) sortie.push(url);
	}
	return sortie.slice(0, 4);
}

/** URLs d'articles d'un sitemap ; la date de publication reste lue sur la page. */
export function urlsSitemap(xml: string, base: string, limite = 200): string[] {
	const sortie: string[] = [];
	const blocs = /<url\b[^>]*>([\s\S]*?)<\/url>/gi;
	let correspondance: RegExpExecArray | null;
	while ((correspondance = blocs.exec(xml)) !== null && sortie.length < limite) {
		const loc = /<loc\b[^>]*>([\s\S]*?)<\/loc>/i.exec(correspondance[1]!)?.[1];
		const url = urlInterne(loc, base);
		if (!url || /\.(?:pdf|jpe?g|png|gif|svg|webp|zip|mp[34]|css|js)(?:$|\?)/i.test(url)) continue;
		if (/\/(?:contact|mentions-legales|politique-de-confidentialite|plan-de-site|annuaire|faq)(?:$|[/?#])/i.test(new URL(url).pathname)) continue;
		if (!sortie.includes(url)) sortie.push(url);
	}
	return sortie;
}

/** Sitemaps enfants d'un index, pour les sites qui segmentent leurs URLs. */
export function sitemapsEnfants(xml: string, base: string): string[] {
	const sortie: string[] = [];
	const blocs = /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi;
	let correspondance: RegExpExecArray | null;
	while ((correspondance = blocs.exec(xml)) !== null && sortie.length < 4) {
		const loc = /<loc\b[^>]*>([\s\S]*?)<\/loc>/i.exec(correspondance[1]!)?.[1];
		const url = urlInterne(loc, base);
		if (url && !sortie.includes(url)) sortie.push(url);
	}
	return sortie;
}
