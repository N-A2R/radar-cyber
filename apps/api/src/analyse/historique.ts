/**
 * Historique d'une organisation : ce qui a changé, pas seulement où on en est.
 *
 * La fiche répond à « que sait-on maintenant ? ». Un analyste devant une
 * organisation qui remonte se pose une autre question : est-ce que c'est
 * nouveau, ou est-ce qu'on la voit tout le temps ? Sans cette distinction,
 * celle qui apparaît dans trois faits et celle qui en a trente sur deux ans se
 * ressemblent.
 *
 * Aucune prédiction, aucune note : un histogramme, une tendance grossière, et
 * ce qui revient. Les chiffres sont calculés sur les **faits** (groupes), pas
 * sur les lignes d'événements — sinon un seul incident bien couvert par la
 * presse ressemblerait à une année d'attaques.
 */
import type { Groupe } from "./corroboration.js";

export type Tendance = "nouveau" | "en hausse" | "stable" | "en baisse" | "ancien";

export type Historique = {
	premier: string | null;
	dernier: string | null;
	faits: number;
	/** 12 mois, du plus ancien au plus récent, mois vides inclus. */
	parMois: { mois: string; faits: number }[];
	tendance: Tendance;
	/** Familles rencontrées, la plus fréquente d'abord. */
	familles: { family: string; faits: number }[];
	/** Sources distinctes sur toute la période. */
	sources: string[];
};

const JOUR_MS = 86_400_000;
/** Fenêtre de comparaison de la tendance : 90 jours contre les 90 précédents. */
export const FENETRE_TENDANCE_JOURS = 90;

/** Clé `AAAA-MM` en UTC : une barre mensuelle fausse d'un jour serait invisible. */
function moisDe(instant: number): string {
	return new Date(instant).toISOString().slice(0, 7);
}

/**
 * Construit l'historique, en se plaçant à `maintenant`.
 *
 * `maintenant` est un paramètre et non `Date.now()` : sans cela, le résultat
 * changerait au fil de l'exécution et le test serait impossible à écrire.
 */
export function construireHistorique(
	groupes: readonly Groupe[],
	maintenant: number = Date.now(),
): Historique {
	const datables = groupes
		.map((g) => ({ groupe: g, instant: Date.parse(g.debut) }))
		.filter((x) => Number.isFinite(x.instant));

	if (datables.length === 0) {
		return {
			premier: null,
			dernier: null,
			faits: 0,
			parMois: douzeMois(maintenant),
			tendance: "nouveau",
			familles: [],
			sources: [],
		};
	}

	const instants = datables.map((x) => x.instant);
	const premier = Math.min(...instants);
	const dernier = Math.max(...instants);

	// Douze mois glissants, du plus ancien au plus récent, trous compris.
	const parMois = douzeMois(maintenant);
	const index = new Map(parMois.map((m, i) => [m.mois, i]));
	for (const { instant } of datables) {
		// Un fait daté dans le futur (source qui déclare n'importe quoi) ne crée
		// pas de barre à venir : il est simplement ignoré de l'histogramme.
		if (instant > maintenant) continue;
		const i = index.get(moisDe(instant));
		const point = i === undefined ? undefined : parMois[i];
		if (point !== undefined) point.faits++;
	}

	const debutRecent = maintenant - FENETRE_TENDANCE_JOURS * JOUR_MS;
	const debutPrecedent = debutRecent - FENETRE_TENDANCE_JOURS * JOUR_MS;
	const recents = datables.filter((x) => x.instant >= debutRecent).length;
	const precedents = datables.filter((x) => x.instant >= debutPrecedent && x.instant < debutRecent).length;

	// L'ordre des cas porte une décision, et un test l'a corrigée : avec deux
	// faits vieux de 200 et 260 jours, les deux fenêtres sont vides (0 et 0) et
	// la comparaison `recents >= precedents * 1.5` donnait « en hausse » — une
	// organisation silencieuse depuis huit mois annoncée en hausse. Les cas
	// vides sont traités d'abord ; `0 >= 0 * 1.5` n'est pas une hausse.
	let tendance: Tendance;
	// Aucun fait dans la fenêtre récente : on ne monte pas, on s'éteint.
	if (recents === 0 && precedents === 0) tendance = "ancien";
	else if (recents === 0) tendance = "ancien";
	else if (precedents === 0) tendance = "nouveau";
	else if (recents >= precedents * 1.5) tendance = "en hausse";
	else if (recents * 1.5 <= precedents) tendance = "en baisse";
	else tendance = "stable";

	const parFamille = new Map<string, number>();
	for (const { groupe } of datables) parFamille.set(groupe.family, (parFamille.get(groupe.family) ?? 0) + 1);

	return {
		premier: new Date(premier).toISOString(),
		dernier: new Date(dernier).toISOString(),
		faits: datables.length,
		parMois,
		tendance,
		familles: [...parFamille.entries()]
			.map(([family, faits]) => ({ family, faits }))
			.sort((a, b) => b.faits - a.faits || a.family.localeCompare(b.family)),
		sources: [...new Set(datables.flatMap((x) => x.groupe.sources.map((s) => s.sourceId)))].sort(),
	};
}

/** Les douze derniers mois, mois courant inclus, à zéro. */
function douzeMois(maintenant: number): { mois: string; faits: number }[] {
	const out: { mois: string; faits: number }[] = [];
	const d = new Date(Date.UTC(new Date(maintenant).getUTCFullYear(), new Date(maintenant).getUTCMonth(), 1));
	for (let i = 11; i >= 0; i--) {
		const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
		out.push({ mois: m.toISOString().slice(0, 7), faits: 0 });
	}
	return out;
}
