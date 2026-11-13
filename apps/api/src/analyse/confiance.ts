/**
 * Fraîcheur et confiance d'un événement, dites au lecteur.
 *
 * Le fil affiche une sévérité (« 3 »), une famille et une source. Il ne dit pas
 * les deux choses qui décident de ce qu'on peut en faire :
 *
 *   — **quand cela s'est passé, et à quel point on le sait.** Un événement vu
 *     le jour même et un événement dont la date a été déduite du fil n'ont pas
 *     la même valeur, même s'ils portent la même sévérité ;
 *   — **à quel point la source est fiable, et si quelqu'un d'autre le dit.**
 *     Une revendication de rançongiciel portée par une seule source C3 n'est
 *     pas un incident établi.
 *
 * Ce module calcule les deux, sans base ni réseau : il prend ce que la ligne
 * porte déjà. Il ne prétend pas trancher la vérité — il empêche de confondre
 * « récent » avec « vrai », et « sévère » avec « certain ».
 *
 * Les deux axes sont **volontairement séparés**. Un score unique les mélangeait
 * déjà pour les alertes ; ici, un événement peut être frais et peu sûr, ou
 * ancien et certain, et le lecteur doit voir les deux dimensions.
 */

/** Précision de la date d'un événement, du plus sûr au plus faible. */
export type PrecisionDate = "certaine" | "deduite" | "collecte";

export type Fraicheur = {
	/** Jours écoulés depuis l'observation, arrondis vers le bas ; `null` si inconnu. */
	ageJours: number | null;
	precision: PrecisionDate;
	/** `frais` ≤ 2 j, `recent` ≤ 14 j, `ancien` au-delà, `inconnu` sans date. */
	classe: "frais" | "recent" | "ancien" | "inconnu";
	/** Phrase courte, destinée au fil : « il y a 3 h · date certaine ». */
	libelle: string;
};

export type Confiance = {
	/** 0 à 1 : fiabilité de la source, poids de l'affirmation, corroboration. */
	note: number;
	/** `etabli` ≥ 0,7 · `plausible` ≥ 0,4 · `fragile` en dessous. */
	niveau: "etabli" | "plausible" | "fragile";
	/** Ce qui a fait monter ou descendre la note, en clair. */
	raisons: string[];
	/** Nombre de sources distinctes qui parlent de la même organisation. */
	sourcesDistinctes: number;
	libelle: string;
};

/** Seuils de niveau, partagés avec l'écran pour que « pourquoi » et « combien »
 * racontent la même histoire. */
export const SEUILS_CONFIANCE = { etabli: 0.7, plausible: 0.4 } as const;

/** Échelle Admiralty, réduite à ce que le code utilise vraiment. */
const FIABILITE_SOURCE: Record<string, number> = {
	A1: 1,
	A2: 0.85,
	B2: 0.6,
	C3: 0.35,
};

/** Poids de la nature de l'affirmation. */
const POIDS_AFFIRMATION: Record<string, number> = {
	confirmed_incident: 1,
	third_party_claim: 0.65,
	technical_indicator: 0.6,
	ambient_signal: 0.3,
};

function borné(valeur: number): number {
	return Math.min(1, Math.max(0, valeur));
}

/**
 * Fraîcheur d'un événement.
 *
 * `date_source` dit d'où vient la date : `feed` (publiée par la source),
 * `inferred` (déduite du texte), `fetched` (on n'a que l'heure de collecte).
 * Un événement sans date prend la date de collecte — mentir serait pire, mais
 * il faut le dire, d'où la classe `collecte`.
 */
export function fraicheurDe(
	entree: { observedAt: string | null; dateSource?: string | null },
	maintenant: Date = new Date(),
): Fraicheur {
	const brut = entree.observedAt;
	if (brut === null) {
		return { ageJours: null, precision: "collecte", classe: "inconnu", libelle: "date inconnue" };
	}
	const date = new Date(brut);
	if (Number.isNaN(date.getTime())) {
		return { ageJours: null, precision: "collecte", classe: "inconnu", libelle: "date illisible" };
	}

	const source = (entree.dateSource ?? "feed").toLowerCase();
	// `fetched` = on ne connaît que le moment où on a récupéré l'élément : la
	// date affichée n'est pas celle de l'incident.
	const precision: PrecisionDate =
		source === "fetched" ? "collecte" : source === "inferred" ? "deduite" : "certaine";

	const millisecondes = maintenant.getTime() - date.getTime();
	// Une date dans le futur n'est pas « très fraîche » : c'est une date fausse.
	if (millisecondes < 0) {
		return { ageJours: 0, precision, classe: "inconnu", libelle: "date future — invraisemblable" };
	}
	const ageJours = Math.floor(millisecondes / 86_400_000);
	const classe = ageJours <= 2 ? "frais" : ageJours <= 14 ? "recent" : "ancien";

	const quand =
		ageJours === 0
			? "aujourd'hui"
			: ageJours === 1
				? "hier"
				: ageJours < 30
					? `il y a ${ageJours} j`
					: `il y a ${Math.floor(ageJours / 30)} mois`;

	const mention =
		precision === "collecte"
			? " · date de collecte, pas de l'incident"
			: precision === "deduite"
				? " · date déduite du texte"
				: "";

	return { ageJours, precision, classe, libelle: `${quand}${mention}` };
}

/**
 * Confiance en un événement.
 *
 * Trois facteurs, et un seul d'entre eux n'est pas dans la ligne : la
 * corroboration. Elle se mesure sur l'organisation — combien de sources
 * distinctes en parlent sur trente jours — et c'est ce qui distingue une
 * revendication isolée d'un incident dont trois rédactions font état.
 *
 * Une source unique plafonne la note : on ne peut pas être « établi » seul.
 *
 * Un second plafond vise les revendications : une source faible qui rapporte
 * une revendication tierce reste **fragile**, même si deux sources la relaient.
 * Mesuré sur le barème initial : C3 + revendication + deux relais atteignait
 * « plausible » (0,49), alors que deux sites recopiant la même page de
 * rançongiciel ne corroborent rien — ils répètent. C'est le sens du mot
 * « corroboration » qui se perdait là.
 */
export function confianceDe(entree: {
	sourceConfidence?: string | null;
	assertionType?: string | null;
	orgId?: number | null;
	sourcesDistinctes?: number;
}): Confiance {
	const code = String(entree.sourceConfidence ?? "").toUpperCase();
	const fiabilite = FIABILITE_SOURCE[code] ?? 0.35;
	const affirmation = POIDS_AFFIRMATION[String(entree.assertionType ?? "")] ?? 0.3;
	const distinctes = Math.max(0, entree.sourcesDistinctes ?? 0);
	// Une source ne corrobore rien ; deux, un peu ; trois, franchement.
	const corroboration = distinctes >= 3 ? 1 : distinctes === 2 ? 0.6 : distinctes === 1 ? 0.2 : 0;

	const raisons: string[] = [];
	if (code === "") raisons.push("fiabilité de source inconnue");
	else raisons.push(`source ${code}`);
	if (entree.assertionType === "confirmed_incident") raisons.push("incident confirmé");
	else if (entree.assertionType === "third_party_claim") raisons.push("revendication tierce, non confirmée");
	else if (entree.assertionType === "ambient_signal") raisons.push("signal d'ambiance");
	if (distinctes >= 3) raisons.push(`${distinctes} sources concordantes`);
	else if (distinctes === 2) raisons.push("2 sources");
	else if (distinctes === 1) raisons.push("une seule source");
	else raisons.push("aucune corroboration mesurable");
	if (entree.orgId == null) raisons.push("aucune organisation rattachée");

	// Pondération : la fiabilité de la source et la nature de l'affirmation
	// pèsent le plus ; la corroboration corrige sans sauver une source faible.
	let note = 0.42 * fiabilite + 0.38 * affirmation + 0.2 * corroboration;
	// Plafond dur : sans corroboration, rien n'est « établi ».
	if (distinctes <= 1) note = Math.min(note, 0.65);
	// Une revendication portée par une source faible ne devient pas solide
	// parce qu'elle est relayée : plusieurs pages peuvent recopier la même.
	const revendicationFaible =
		entree.assertionType === "third_party_claim" && (code === "C3" || code === "B2" || code === "");
	if (revendicationFaible) {
		note = Math.min(note, 0.38);
		raisons.push("revendication relayée, jamais confirmée par une source de rang A");
	}
	note = borné(note);

	const niveau =
		note >= SEUILS_CONFIANCE.etabli
			? "etabli"
			: note >= SEUILS_CONFIANCE.plausible
				? "plausible"
				: "fragile";
	const libelle =
		niveau === "etabli"
			? "établi"
			: niveau === "plausible"
				? "plausible, à confirmer"
				: "fragile";

	return { note: Math.round(note * 100) / 100, niveau, raisons, sourcesDistinctes: distinctes, libelle };
}
