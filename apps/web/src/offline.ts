/**
 * Hors ligne de la carte — chantier 17.
 *
 * Le constat de départ : quand le réseau tombe, la carte se vide. Pas seulement
 * les données — le fond de carte, les polices, les étiquettes de villes. Un
 * plan qui disparaît au moment où on en a besoin n'est pas un plan.
 *
 * Ce module s'occupe de deux choses distinctes :
 *
 *  1. **le fond de carte** : un style minimal sans serveur de tuiles, dessiné à
 *     partir des contours départementaux déjà embarqués dans le bundle ;
 *  2. **les données** : la dernière réponse connue de chaque écran, conservée
 *     et réaffichée avec son âge, jamais présentée comme fraîche.
 *
 * Rien ici n'appelle `localStorage` directement : le stockage est injecté, donc
 * testable hors navigateur, et une panne de quota ne doit pas casser la carte.
 */

import { tokenVar } from "@astryxdesign/core/theme";

/** Style MapLibre sans tuiles : rien à télécharger, rien à perdre. */
export type StyleSecours = {
	version: 8;
	sources: Record<string, { type: "geojson"; data: GeoJSONCollection }>;
	layers: unknown[];
};

type GeoJSONCollection = { type: "FeatureCollection"; features: unknown[] };

/**
 * Ce que la carte peut dessiner avec zéro octet de réseau.
 *
 * Les contours départementaux (`DEP_FEATURES`) et les libellés de villes sont
 * déjà des constantes du bundle : ils pèsent quelques dizaines de kilooctets,
 * sont versionnés avec le code, et ne dépendent d'aucun service. Les tuiles
 * raster, elles, ne peuvent pas être mises en cache durablement par-dessus le
 * quota d'un navigateur — d'où le choix du vectoriel embarqué.
 */
export function styleSecours(contours: GeoJSONCollection, villes: GeoJSONCollection): StyleSecours {
	// MapLibre ne comprend pas `var(...)` dans une paint property : on résout
	// les jetons du pont gothic via le CSS du thème actif. Sans DOM (tests,
	// SSR), la référence CSS reste intacte.
	const styles = typeof document === "undefined" ? undefined : getComputedStyle(document.documentElement);
	const jetons = {
		fond: tokenVar("--bg"),
		dep: tokenVar("--surface"),
		contour: tokenVar("--line-strong"),
		texte: tokenVar("--text"),
	};
	const couleurs = Object.fromEntries(
		Object.entries(jetons).map(([nom, jeton]) => [
			nom,
			styles?.getPropertyValue(jeton.slice(4, -1)).trim() || jeton,
		]),
	);
	return {
		version: 8,
		sources: {
			dep: { type: "geojson", data: contours },
			cities: { type: "geojson", data: villes },
		},
		layers: [
			// Fond plein : la mer et le hors-champ, en une couleur qui ne dépend
			// d'aucune image.
			{ id: "fond", type: "background", paint: { "background-color": couleurs.fond } },
			{
				id: "dep",
				type: "fill",
				source: "dep",
				paint: { "fill-color": couleurs.dep, "fill-outline-color": couleurs.contour },
			},
			{
				id: "cities",
				type: "symbol",
				source: "cities",
				layout: { "text-field": ["get", "name"], "text-size": 12, "text-font": ["Noto Sans Regular"] },
				paint: { "text-color": couleurs.texte, "text-halo-color": couleurs.fond, "text-halo-width": 1.5 },
			},
		],
	};
}

/** Instantané d'un écran, avec sa date de capture. */
export type Instantane<T> = { at: number; data: T };

/**
 * Mémoire locale, tolérante à l'absence de stockage.
 *
 * `localStorage` peut être absent (rendu serveur, navigation privée stricte) ou
 * plein. Dans les deux cas la carte doit continuer : on préfère perdre le cache
 * que perdre l'écran.
 */
export function creerMemoire(stockage: Pick<Storage, "getItem" | "setItem"> | null) {
	return {
		lire<T>(cle: string): Instantane<T> | null {
			if (stockage === null) return null;
			try {
				const brut = stockage.getItem(`radar:instantane:${cle}`);
				if (brut === null) return null;
				const parsed = JSON.parse(brut) as Instantane<T>;
				// Un instantané sans date est inutilisable : on ne saurait pas quel
				// âge lui donner, et un âge faux est pire qu'une absence.
				if (typeof parsed?.at !== "number") return null;
				return parsed;
			} catch {
				return null;
			}
		},
		ecrire<T>(cle: string, data: T, at = Date.now()): void {
			if (stockage === null) return;
			try {
				stockage.setItem(`radar:instantane:${cle}`, JSON.stringify({ at, data }));
			} catch {
				// Quota dépassé : on garde l'écran, on perd le cache.
			}
		},
	};
}

export type EtatReseau = "frais" | "perime" | "absent";

/** Libellé à afficher au-dessus de la carte. Jamais « à jour » pour du cache. */
export function etatDonnees(instantane: Instantane<unknown> | null, maintenant = Date.now()): {
	etat: EtatReseau;
	libelle: string;
	ageMinutes: number | null;
} {
	if (instantane === null) {
		return { etat: "absent", libelle: "aucune donnée en mémoire", ageMinutes: null };
	}
	const ageMinutes = Math.max(0, Math.round((maintenant - instantane.at) / 60_000));
	// Au-delà de 15 minutes, un instantané n'est plus « frais » : sur une carte
	// d'incidents, quart d'heure est déjà une éternité.
	if (ageMinutes <= 15) {
		return { etat: "frais", libelle: "à jour", ageMinutes };
	}
	if (ageMinutes < 60) {
		return { etat: "perime", libelle: `hors ligne · données de ${ageMinutes} min`, ageMinutes };
	}
	const heures = Math.round(ageMinutes / 60);
	if (heures < 48) return { etat: "perime", libelle: `hors ligne · données de ${heures} h`, ageMinutes };
	return { etat: "perime", libelle: `hors ligne · données de ${Math.round(heures / 24)} j`, ageMinutes };
}
