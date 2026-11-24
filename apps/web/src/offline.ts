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
	sources: Record<string, {
		type: "geojson";
		data: GeoJSONCollection;
		cluster?: boolean;
		clusterRadius?: number;
		clusterMaxZoom?: number;
	}>;
	layers: Record<string, unknown>[];
};

type GeoJSONCollection = { type: "FeatureCollection"; features: unknown[] };

/** Sources de données que la carte alimentera dès son `load`, même hors ligne. */
type DonneesSecours = Partial<Record<"orgs" | "events" | "hot" | "arcs", GeoJSONCollection>>;

/**
 * Ce que la carte peut dessiner avec zéro octet de réseau.
 *
 * Contours, villes, organisations, événements, halo et arcs sont soit des
 * constantes du bundle, soit les dernières données reçues par l'application :
 * le repli reste une carte complète, pas seulement des contours. Aucune couche
 * `symbol` n'est déclarée : sans ressource `glyphs` locale, MapLibre ne peut
 * pas rendre de texte — les libellés de villes sont posés en marqueurs DOM par
 * `Map3D`, avec les jetons du thème.
 */
export function styleSecours(
	contours: GeoJSONCollection,
	villes: GeoJSONCollection,
	donnees: DonneesSecours = {},
): StyleSecours {
	const styles = typeof document === "undefined" ? undefined : getComputedStyle(document.documentElement);
	const jeton = (nom: string) => {
		const reference = tokenVar(nom);
		return reference.startsWith("var(")
			? styles?.getPropertyValue(reference.slice(4, -1)).trim() || reference
			: reference;
	};
	const vide = (): GeoJSONCollection => ({ type: "FeatureCollection", features: [] });
	const collection = (source: GeoJSONCollection | undefined): GeoJSONCollection => source ?? vide();
	const largeurArc = (extra: number) => ["+", 2 + extra, ["min", 6, ["/", ["coalesce", ["get", "count"], 1], 12]]];

	return {
		version: 8,
		sources: {
			dep: { type: "geojson", data: contours },
			cities: { type: "geojson", data: villes },
			orgs: {
				type: "geojson",
				data: collection(donnees.orgs),
				cluster: true,
				clusterRadius: 42,
				clusterMaxZoom: 9,
			},
			hot: { type: "geojson", data: collection(donnees.hot) },
			arcs: { type: "geojson", data: collection(donnees.arcs) },
			events: { type: "geojson", data: collection(donnees.events) },
		},
		layers: [
			// Fond plein : la mer et le hors-champ, en une couleur qui ne dépend
			// d'aucune image.
			{ id: "fond", type: "background", paint: { "background-color": jeton("--bg") } },
			{
				id: "dep",
				type: "fill",
				source: "dep",
				paint: { "fill-color": jeton("--surface"), "fill-outline-color": jeton("--line-strong") },
			},
			{
				id: "dep-outline",
				type: "line",
				source: "dep",
				paint: { "line-color": jeton("--accent"), "line-opacity": 0.55, "line-width": 1 },
			},
			{
				id: "arcs-glow",
				type: "line",
				source: "arcs",
				paint: { "line-color": ["get", "color"], "line-width": largeurArc(6), "line-opacity": 0.1 },
			},
			{
				id: "arcs",
				type: "line",
				source: "arcs",
				paint: { "line-color": ["get", "color"], "line-width": largeurArc(0), "line-opacity": 0.85 },
			},
			{
				id: "orgs-clusters",
				type: "circle",
				source: "orgs",
				filter: ["has", "point_count"],
				paint: {
					"circle-color": jeton("--surface-3"),
					"circle-opacity": 0.88,
					"circle-stroke-color": jeton("--data-teal"),
					"circle-stroke-opacity": 0.45,
					"circle-stroke-width": 1,
				},
			},
			{
				id: "orgs",
				type: "circle",
				source: "orgs",
				filter: ["!", ["has", "point_count"]],
				paint: {
					"circle-color": jeton("--muted"),
					"circle-stroke-color": jeton("--bg"),
					"circle-stroke-width": 1.5,
				},
			},
			{
				id: "hot",
				type: "circle",
				source: "hot",
				paint: {
					"circle-radius": 14,
					"circle-color": ["get", "color"],
					"circle-opacity": 0.18,
					"circle-stroke-color": ["get", "color"],
					"circle-stroke-width": 1.2,
					"circle-stroke-opacity": 0.6,
				},
			},
			{
				id: "events",
				type: "circle",
				source: "events",
				paint: {
					"circle-color": ["get", "color"],
					"circle-radius": ["get", "radius"],
					"circle-opacity": 0.92,
					"circle-stroke-color": ["get", "stroke"],
					"circle-stroke-width": 1,
				},
			},
			{
				id: "events-hover",
				type: "circle",
				source: "events",
				paint: {
					"circle-color": ["get", "color"],
					"circle-radius": ["+", ["get", "radius"], 4],
					"circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.22, 0],
					"circle-stroke-color": ["get", "stroke"],
					"circle-stroke-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0],
					"circle-stroke-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.9, 0],
				},
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
