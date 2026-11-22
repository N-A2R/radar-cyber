/**
 * Criticité exploitable d'un service exposé.
 *
 * Le but n'est pas d'inventorier tous les ports ouverts : un service qui
 * n'expose aucune preuve d'exploitabilité ne doit pas passer devant une base
 * de données ou un RDP pour lequel une CVE a un score EPSS élevé ou figure au
 * catalogue CISA KEV. La règle est volontairement lisible et sans état :
 * catégorie de service, score EPSS maximal des CVE observées, appartenance KEV.
 *
 * Aucune donnée d'organisation, d'adresse IP ou de victime n'entre ici : le
 * module ne voit qu'une catégorie technique et deux indicateurs publics.
 */

export const CATEGORIES_CRITIQUES = ["base_de_donnees", "vpn", "rdp"] as const;
export type CategorieCritique = (typeof CATEGORIES_CRITIQUES)[number];

export type NiveauRisque = "critique" | "eleve" | "modere" | "faible";

export type ServiceAClasser = {
	categorie: string;
	epssMax: number;
	kev: boolean;
	port?: number;
	technologie?: string;
};

export type Classement = {
	score: number;
	niveau: NiveauRisque;
	motifs: string[];
};

/** Poids de base : un service d'administration exposé pèse plus qu'un site web. */
export const POIDS_CATEGORIE: Readonly<Record<string, number>> = {
	base_de_donnees: 50,
	rdp: 45,
	vpn: 40,
	mail: 20,
	web: 15,
	autre: 5,
};

/** EPSS est une probabilité 0–1 ; on la convertit en 30 points au maximum. */
export const POIDS_EPSS = 30;
/** Une CVE au catalogue KEV est déjà exploitée dans la nature. */
export const POIDS_KEV = 35;
export const SEUIL_EPSS_ELEVE = 0.1;
export const SEUIL_EPSS_MODERE = 0.01;

export function estCategorieCritique(categorie: string): categorie is CategorieCritique {
	return (CATEGORIES_CRITIQUES as readonly string[]).includes(categorie);
}

function borneEpss(valeur: number): number {
	if (!Number.isFinite(valeur)) return 0;
	return Math.min(1, Math.max(0, valeur));
}

/**
 * Score 0–100. Les trois signaux sont additifs puis bornés :
 * - catégorie (5 à 50 points) ;
 * - EPSS maximal observé (0 à 30 points) ;
 * - présence au KEV (35 points).
 *
 * Un service de base de données sans CVE connue garde donc 50 points : son
 * exposition reste dangereuse même sans preuve d'exploitabilité.
 */
export function scoreCriticite(service: ServiceAClasser): number {
	const base = POIDS_CATEGORIE[service.categorie] ?? POIDS_CATEGORIE.autre!;
	const epss = borneEpss(service.epssMax);
	const score = base + POIDS_EPSS * epss + (service.kev ? POIDS_KEV : 0);
	return Math.round(Math.min(100, Math.max(0, score)) * 100) / 100;
}

export function niveauRisque(service: ServiceAClasser): NiveauRisque {
	if (service.kev) return "critique";
	if (borneEpss(service.epssMax) >= SEUIL_EPSS_ELEVE) return "eleve";
	if (estCategorieCritique(service.categorie)) return "modere";
	if (borneEpss(service.epssMax) >= SEUIL_EPSS_MODERE) return "modere";
	return "faible";
}

/** Motifs lisibles, dans l'ordre où ils pèsent sur le score. */
export function motifsClassement(service: ServiceAClasser): string[] {
	const motifs: string[] = [];
	if (estCategorieCritique(service.categorie)) motifs.push(`categorie:${service.categorie}`);
	if (borneEpss(service.epssMax) >= SEUIL_EPSS_ELEVE) motifs.push(`epss:${borneEpss(service.epssMax).toFixed(5)}`);
	else if (borneEpss(service.epssMax) >= SEUIL_EPSS_MODERE) motifs.push(`epss_faible:${borneEpss(service.epssMax).toFixed(5)}`);
	if (service.kev) motifs.push("kev");
	return motifs;
}

export function classer(service: ServiceAClasser): Classement {
	return {
		score: scoreCriticite(service),
		niveau: niveauRisque(service),
		motifs: motifsClassement(service),
	};
}

/**
 * Tri décroissant stable : score, puis EPSS, puis KEV, puis port.
 * Le port sert uniquement de départage déterministe entre deux services
 * strictement équivalents ; il ne modifie jamais le score.
 */
export function comparerServices(a: ServiceAClasser, b: ServiceAClasser): number {
	const scoreA = scoreCriticite(a);
	const scoreB = scoreCriticite(b);
	if (scoreA !== scoreB) return scoreB - scoreA;
	const epssA = borneEpss(a.epssMax);
	const epssB = borneEpss(b.epssMax);
	if (epssA !== epssB) return epssB - epssA;
	if (a.kev !== b.kev) return a.kev ? -1 : 1;
	return (a.port ?? 0) - (b.port ?? 0);
}

export function classerServices<T extends ServiceAClasser>(services: readonly T[]): (T & Classement)[] {
	return [...services]
		.sort(comparerServices)
		.map((service) => ({ ...service, ...classer(service) }));
}
