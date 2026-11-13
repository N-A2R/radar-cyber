/**
 * Le « pourquoi » d'un rattachement, rangé avec l'événement.
 *
 * Le moteur sait *pourquoi* il rattache : un alias distinctif, un rôle
 * institutionnel, un département cité qui départage deux homonymes, ou au
 * contraire une ambiguïté qu'il refuse de trancher. Il savait tout cela… et ne
 * le gardait nulle part. Le journal consignait « aucun rattachement retenu »,
 * ce qui est exactement le degré zéro de l'information : la même ligne pour un
 * texte qui ne nomme personne, pour deux homonymes à égalité, et pour un
 * moteur qui n'a pas encore chargé son index.
 *
 * Ce module traduit un motif de moteur en une raison lisible et la rend. Il ne
 * décide rien, ne juge rien : il rend la décision **auditable**.
 *
 * Convention de rangement, dans `event.evidence.rattachement` :
 *
 *   { moteur, motif, alias, confiance, version?, candidats? }
 *
 * `motif` est la valeur brute du moteur (`alias-distinctif`, `lieu-contredit`,
 * `ambigu`…), jamais un libellé traduit : un libellé change, un motif se rejoue.
 */
import type { MatchReason } from "../match/gazetteer.js";

/** Ce qu'on sait d'un rattachement, au moment où il est décidé. */
export type ExplicationRattachement = {
	moteur: "gazetteer@2" | "fuzzy@1" | "lien@1";
	motif: MatchReason | "fuzzy" | "aucun";
	alias: string | null;
	confiance: number;
	candidats?: { id: number; name: string }[];
	/** L'index n'était pas chargé : l'absence de rattachement n'est pas un verdict. */
	indisponible?: boolean;
};

/**
 * Libellés affichés. Chacun répond à « pourquoi celui-là ? » ou « pourquoi
 * aucun ? » — pas à « quel score ? », qui ne dit rien à un analyste.
 */
export const LIBELLES_MOTIF: Record<string, string> = {
	"alias-role": "rôle institutionnel reconnu dans le texte",
	"alias-distinctif": "nom distinctif cité dans le texte",
	departement: "homonymes départagés par le département cité",
	commune: "homonymes départagés par la commune citée",
	"lieu-contredit": "nom reconnu, mais le texte le situe hors de la région",
	ambigu: "plusieurs organisations également plausibles : aucun choix",
	ambiant: "le texte ne nomme aucune organisation, seulement un lieu",
	aucun: "aucune organisation du référentiel n'est citée",
	fuzzy: "nom approchant, retenu au-delà du seuil de ressemblance",
	indisponible: "référentiel indisponible au moment du rattachement",
};

/** Phrase lisible pour un motif ; retombe sur le motif brut s'il est inconnu. */
export function libelleMotif(motif: string): string {
	return LIBELLES_MOTIF[motif] ?? `motif non documenté : ${motif}`;
}

/**
 * Vrai si le motif signifie « on n'a pas pu essayer » plutôt que « on a essayé
 * et rien trouvé ». La distinction est celle qui empêche de compter une panne
 * de référentiel comme un échec de rattachement — elle a déjà faussé une mesure
 * de couverture.
 */
export function estIndisponible(explication: { motif: string; indisponible?: boolean }): boolean {
	return explication.indisponible === true || explication.motif === "indisponible";
}

/** Forme rangée dans `evidence`, sans champ vide. */
export function versEvidence(explication: ExplicationRattachement): Record<string, unknown> {
	const out: Record<string, unknown> = {
		moteur: explication.moteur,
		motif: explication.motif,
		confiance: Math.round(explication.confiance * 100) / 100,
	};
	if (explication.alias !== null) out.alias = explication.alias;
	if (explication.candidats !== undefined && explication.candidats.length > 0) {
		out.candidats = explication.candidats.map((c) => ({ id: c.id, name: c.name }));
	}
	if (explication.indisponible === true) out.indisponible = true;
	return out;
}

/** Relit l'explication rangée dans une preuve d'événement, sans faire confiance à sa forme. */
export function depuisEvidence(evidence: unknown): ExplicationRattachement | null {
	if (typeof evidence !== "object" || evidence === null) return null;
	const brut = (evidence as Record<string, unknown>).rattachement;
	if (typeof brut !== "object" || brut === null) return null;
	const obj = brut as Record<string, unknown>;
	const motif = typeof obj.motif === "string" ? obj.motif : null;
	const moteur = typeof obj.moteur === "string" ? obj.moteur : null;
	if (motif === null || moteur === null) return null;
	const alias = typeof obj.alias === "string" ? obj.alias : null;
	const confiance = typeof obj.confiance === "number" && Number.isFinite(obj.confiance) ? obj.confiance : 0;
	const candidats = Array.isArray(obj.candidats)
		? obj.candidats
				.filter(
					(c): c is { id: number; name: string } =>
						typeof c === "object" && c !== null && typeof (c as { id?: unknown }).id === "number" &&
						typeof (c as { name?: unknown }).name === "string",
				)
				.map((c) => ({ id: c.id, name: c.name }))
		: undefined;
	return {
		moteur: moteur as ExplicationRattachement["moteur"],
		motif: motif as ExplicationRattachement["motif"],
		alias,
		confiance,
		...(candidats !== undefined ? { candidats } : {}),
		...(obj.indisponible === true ? { indisponible: true } : {}),
	};
}
