/**
 * Garde-fou de publication du taux de couverture.
 *
 * Le taux est calculé contre le référentiel entreprises. Si ce référentiel ne
 * contient presque aucun des secteurs critiques attendus (agroalimentaire,
 * industrie, construction, commerce), un taux correct arithmétiquement donne
 * une image fausse de la couverture : il ne mesure que le numérique. La mesure
 * doit alors porter la mention « taux non publiable » et dire pourquoi, plutôt
 * que de laisser le lecteur deviner le trou.
 */

/** Secteurs attendus dans le référentiel entreprises « 50 salariés et plus ». */
export const SECTEURS_ATTENDUS = [
	"agroalimentaire",
	"industrie",
	"construction",
	"commerce",
] as const;

/** Part minimale des secteurs attendus pour que le taux soit publié. */
export const SEUIL_SECTEURS_PUBLIABLES = 0.75;

export const MENTION_NON_PUBLIABLE = "taux non publiable";

export type VerdictPublication = {
	publiable: boolean;
	/** `null` quand le taux est publiable ; sinon la mention exacte. */
	mention: typeof MENTION_NON_PUBLIABLE | null;
	/** `null` quand le taux est publiable ; sinon le motif du refus. */
	raison: string | null;
	partSecteurs: number;
	secteursManquants: string[];
};

export function verifierPubliabilite(
	parSecteur: Readonly<Record<string, number>>,
): VerdictPublication {
	const presents = SECTEURS_ATTENDUS.filter((secteur) => (parSecteur[secteur] ?? 0) > 0);
	const secteursManquants = SECTEURS_ATTENDUS.filter((secteur) => (parSecteur[secteur] ?? 0) <= 0);
	const partSecteurs = presents.length / SECTEURS_ATTENDUS.length;

	if (partSecteurs >= SEUIL_SECTEURS_PUBLIABLES) {
		return { publiable: true, mention: null, raison: null, partSecteurs, secteursManquants: [...secteursManquants] };
	}

	const raison =
		`Référentiel incomplet : ${presents.length}/${SECTEURS_ATTENDUS.length} secteurs attendus présents ` +
		`(${Math.round(partSecteurs * 100)} %), sous le seuil de ${Math.round(SEUIL_SECTEURS_PUBLIABLES * 100)} %. ` +
		`Secteurs sans aucune ligne : ${secteursManquants.join(", ")}. ` +
		"Le taux de couverture serait trompeur pour ces secteurs.";
	return {
		publiable: false,
		mention: MENTION_NON_PUBLIABLE,
		raison,
		partSecteurs,
		secteursManquants: [...secteursManquants],
	};
}
