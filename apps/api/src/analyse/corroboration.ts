/**
 * Corroboration et contradiction entre sources — chantiers 9 et 12.
 *
 * Deux sources qui décrivent le même incident ne sont pas deux incidents. Et
 * deux sources qui se contredisent ne sont pas du bruit : c'est un fait, et il
 * vaut mieux l'afficher que laisser l'analyste choisir en silence.
 *
 * Ce module prend les événements d'une organisation sur une fenêtre et les
 * regroupe. Il ne fusionne rien en base : les événements restent distincts par
 * construction (clés de déduplication différentes), et le regroupement est une
 * lecture, donc réversible.
 *
 * Ce qu'il fait, concrètement :
 *   — un **groupe** par famille et par proximité temporelle (72 h) ;
 *   — pour chaque groupe, la liste des sources, celle qui est arrivée en
 *     premier, et le délai de reprise ;
 *   — les **désaccords** entre sources d'un même groupe : gravité, gravité
 *     différente, nature de l'affirmation contradictoire (confirmation contre
 *     revendication), et date divergente de plus de sept jours.
 *
 * Volontairement sans modèle ni réseau : ce sont des règles déterministes,
 * donc reproductibles et contestables. Une contradiction mal détectée se
 * corrige dans le code, pas dans un prompt.
 */

export type EvenementCorroborable = {
	id: string;
	family: string;
	/**
	 * Sévérité déclarée. `null` = non renseignée, et ce n'est pas zéro : une
	 * source muette sur la gravité ne rend pas l'incident bénin. Les désaccords
	 * se calculent donc sur les seules valeurs renseignées.
	 */
	severity: number | null;
	assertionType: string;
	sourceId: string;
	/** Date de référence, ISO. */
	date: string;
	orgId: number | null;
	title: string;
};

export type SourceGroupe = {
	sourceId: string;
	/** Premier événement de cette source dans le groupe : c'est le « premier à en parler ». */
	premiereDate: string;
	/** Premier événement du groupe, toutes sources confondues. */
	estPremier: boolean;
	/** Heures entre le premier événement du groupe et celui-ci. */
	delaiHeures: number;
	evenements: number;
	graviteMax: number | null;
	assertion: string;
};

export type Groupe = {
	/** Clé stable, dérivée de la famille et de l'instant d'ouverture. */
	cle: string;
	family: string;
	orgId: number | null;
	/** Titre du premier événement : le plus proche de la source. */
	titre: string;
	debut: string;
	fin: string;
	sources: SourceGroupe[];
	/** Nombre de sources distinctes — la mesure de corroboration. */
	sourcesDistinctes: number;
	/** `isole` (1 source) · `corrobore` (2) · `etabli` (3 et plus). */
	force: "isole" | "corrobore" | "etabli";
};

export type Desaccord = {
	cle: string;
	orgId: number | null;
	family: string;
	/**
	 * Ce sur quoi les sources ne disent pas la même chose.
	 *
	 * Il y avait une troisième valeur, `date` : deux sources datant le même
	 * fait à plus de sept jours d'écart. Un test a montré qu'elle ne pouvait
	 * **jamais** se déclencher — le regroupement ferme à 72 h, donc deux
	 * sources d'un même groupe ne peuvent pas être à sept jours l'une de
	 * l'autre. Une règle morte qui a l'air de fonctionner est pire que pas de
	 * règle : elle fait croire à une vigilance qui n'existe pas. Supprimée.
	 * Détecter une divergence de date suppose de comparer la date *déclarée*
	 * par la source à celle qu'on a retenue, ce qui demande de la conserver.
	 */
	objet: "gravite" | "nature";
	description: string;
	positions: { sourceId: string; valeur: string }[];
};

/** Fenêtre de regroupement : deux signalements à plus de trois jours d'écart ne parlent pas du même fait. */
export const FENETRE_GROUPE_MS = 72 * 3600 * 1000;
function heuresEntre(a: string, b: string): number {
	const d = new Date(b).getTime() - new Date(a).getTime();
	return Number.isFinite(d) ? Math.round((d / 3_600_000) * 10) / 10 : 0;
}

/**
 * Regroupe des événements d'une même organisation.
 *
 * Le regroupement est glouton et chronologique : on ouvre un groupe au premier
 * événement, on y agrège tout ce qui tombe dans les 72 h suivantes **dans la
 * même famille**, puis on en ouvre un autre. Pas de clustering probabiliste :
 * on veut pouvoir expliquer chaque rattachement.
 */
export function regrouper(evenements: readonly EvenementCorroborable[]): Groupe[] {
	const tries = [...evenements]
		.filter((e) => Number.isFinite(new Date(e.date).getTime()))
		.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

	const groupes: Groupe[] = [];
	let courant: { debut: number; famille: string; orgId: number | null; items: EvenementCorroborable[] } | null = null;

	for (const evt of tries) {
		const instant = new Date(evt.date).getTime();
		if (courant === null || evt.family !== courant.famille || instant - courant.debut > FENETRE_GROUPE_MS) {
			if (courant !== null) groupes.push(finaliser(courant));
			courant = { debut: instant, famille: evt.family, orgId: evt.orgId, items: [evt] };
			continue;
		}
		courant.items.push(evt);
	}
	if (courant !== null) groupes.push(finaliser(courant));
	// Du plus récent au plus ancien : un analyste ouvre une fiche pour savoir ce
	// qui vient de se passer, pas ce qui s'est passé il y a trois mois. Le
	// regroupement se fait chronologiquement, l'affichage se fait à l'envers —
	// mesuré sur un scénario à trois faits, la fiche ouvrait sur le plus vieux.
	return groupes.sort((a, b) => new Date(b.debut).getTime() - new Date(a.debut).getTime());
}

/** Force probante d'une affirmation : du plus fort au plus faible. */
const ORDRE_ASSERTION = ["confirmed_incident", "technical_indicator", "third_party_claim", "ambient_signal"];

/**
 * Retient la plus forte affirmation d'une source.
 *
 * Prendre la dernière ligne était un raccourci faux : une source qui confirme
 * l'incident puis publie un rappel d'ambiance se retrouvait classée « ambiance ».
 */
export function plusForteAssertion(assertions: readonly (string | null)[]): string {
	for (const rang of ORDRE_ASSERTION) {
		if (assertions.includes(rang)) return rang;
	}
	return assertions[0] ?? "ambient_signal";
}

function finaliser(courant: { debut: number; famille: string; orgId: number | null; items: EvenementCorroborable[] }): Groupe {
	const debut = courant.items[0] as EvenementCorroborable;
	const parSource = new Map<string, EvenementCorroborable[]>();
	for (const evt of courant.items) {
		const liste = parSource.get(evt.sourceId) ?? [];
		liste.push(evt);
		parSource.set(evt.sourceId, liste);
	}

	const sources: SourceGroupe[] = [...parSource.entries()]
		.map(([sourceId, liste]) => {
			const premier = liste[0] as EvenementCorroborable;
			const gravites = liste.map((e) => e.severity).filter((v): v is number => typeof v === "number");
			return {
				sourceId,
				premiereDate: premier.date,
				estPremier: sourceId === debut.sourceId && premier.id === debut.id,
				// Une source peut avoir plusieurs événements dans le groupe ; seul le
				// premier compte pour le délai, et il ne peut pas être négatif.
				delaiHeures: Math.max(0, heuresEntre(debut.date, premier.date)),
				evenements: liste.length,
				// `Math.max()` sur une liste vide rend `-Infinity`, qui devenait une
				// gravité affichée en base. Une source muette sur la gravité n'a pas
				// de gravité : `null`.
				graviteMax: gravites.length === 0 ? null : Math.max(...gravites),
				// La dernière ligne d'une source n'est pas sa position : si elle a
				// d'abord confirmé puis nuancé, on retient la plus forte preuve.
				assertion: plusForteAssertion(liste.map((e) => e.assertionType)),
			};
		})
		.sort((a, b) => new Date(a.premiereDate).getTime() - new Date(b.premiereDate).getTime());

	const distinctes = sources.length;
	return {
		cle: `${courant.famille}:${new Date(courant.debut).toISOString()}`,
		family: courant.famille,
		orgId: courant.orgId,
		titre: debut.title,
		debut: debut.date,
		fin: (courant.items[courant.items.length - 1] as EvenementCorroborable).date,
		sources,
		sourcesDistinctes: distinctes,
		force: distinctes >= 3 ? "etabli" : distinctes === 2 ? "corrobore" : "isole",
	};
}

/**
 * Désaccords entre sources d'un même groupe.
 *
 * Deux cas observables sur le corpus réel :
 *   - **gravité** : une source dit 4, l'autre 2 — l'une parle d'un incident
 *     majeur, l'autre d'un désagrément ;
 *   - **nature** : une source confirme l'incident, l'autre relaie une
 *     revendication. C'est le désaccord le plus fréquent et le plus coûteux :
 *     rien ne dit que la revendication soit vraie.
 */
export function desaccords(groupes: readonly Groupe[]): Desaccord[] {
	const out: Desaccord[] = [];
	for (const groupe of groupes) {
		if (groupe.sourcesDistinctes < 2) continue;

		const gravites = groupe.sources
			.map((s) => s.graviteMax)
			.filter((v): v is number => typeof v === "number");
		if (gravites.length >= 2 && Math.max(...gravites) - Math.min(...gravites) >= 2) {
			out.push({
				cle: groupe.cle,
				orgId: groupe.orgId,
				family: groupe.family,
				objet: "gravite",
				description: `gravité ${Math.min(...gravites)} chez une source, ${Math.max(...gravites)} chez une autre`,
				positions: groupe.sources
					.filter((s) => typeof s.graviteMax === "number")
					.map((s) => ({ sourceId: s.sourceId, valeur: String(s.graviteMax) })),
			});
		}

		const confirmations = groupe.sources.filter((s) => s.assertion === "confirmed_incident");
		const revendications = groupe.sources.filter((s) => s.assertion === "third_party_claim");
		if (confirmations.length > 0 && revendications.length > 0) {
			out.push({
				cle: groupe.cle,
				orgId: groupe.orgId,
				family: groupe.family,
				objet: "nature",
				description:
					"une source confirme l'incident, une autre ne fait que relayer une revendication",
				positions: [
					...confirmations.map((s) => ({ sourceId: s.sourceId, valeur: "confirmé" })),
					...revendications.map((s) => ({ sourceId: s.sourceId, valeur: "revendiqué" })),
				],
			});
		}
	}

	return out;
}

/**
 * Ce que l'organisation a vécu, en une phrase : « 3 faits, 4 sources, 2
 * désaccords ». C'est ce qu'un analyste lit avant d'ouvrir la fiche.
 */
export function resume(groupes: readonly Groupe[], conflits: readonly Desaccord[]) {
	const evenements = groupes.reduce((total, g) => total + g.sources.reduce((n, s) => n + s.evenements, 0), 0);
	const sources = new Set(groupes.flatMap((g) => g.sources.map((s) => s.sourceId)));
	return {
		faits: groupes.length,
		evenements,
		sources: sources.size,
		corrobores: groupes.filter((g) => g.force !== "isole").length,
		isoles: groupes.filter((g) => g.force === "isole").length,
		desaccords: conflits.length,
	};
}
