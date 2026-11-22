/**
 * Décroissance de la valeur d'un fait avec son âge.
 *
 * Un incident d'il y a six mois ne dit plus grand-chose du risque d'aujourd'hui,
 * alors qu'un signal de la semaine dernière est un indice direct. Le modèle
 * `risk_static` additionne tous les faits à poids égal ; `risk_decay` multiplie
 * chaque fait par une demi-vie exponentielle. Les deux partagent le même
 * découpage temporel : les faits sont observés avant `asOf`, l'issue est
 * constatée dans `(asOf, asOf + horizon]`.
 *
 * Aucune donnée personnelle, aucune organisation, aucune source réelle : ce
 * module ne manipule que des identifiants d'entité synthétiques et des comptes.
 */

export type Fact = {
	/** Jour ISO (YYYY-MM-DD) auquel le fait a été observé. */
	day: string;
	/** Poids brut du fait ; 1 pour un signal banal, davantage pour un incident avéré. */
	weight: number;
};

export type LabelledEntity = {
	/** Identifiant synthétique, jamais un nom d'organisation. */
	id: number;
	facts: readonly Fact[];
	/** Vrai si un incident survient dans la fenêtre d'horizon après `asOf`. */
	positive: boolean;
};

const DAY_MS = 86_400_000;

/** Nombre de jours entiers entre deux jours ISO, `day` antérieur à `asOf`. */
export function ageInDays(day: string, asOf: string): number {
	const from = Date.parse(`${day}T00:00:00Z`);
	const to = Date.parse(`${asOf}T00:00:00Z`);
	if (!Number.isFinite(from) || !Number.isFinite(to)) {
		throw new RangeError(`jour ISO invalide : ${day} / ${asOf}`);
	}
	return Math.round((to - from) / DAY_MS);
}

/**
 * Poids d'un fait âgé de `ageDays` jours pour une demi-vie donnée.
 * À l'âge zéro le poids vaut 1 ; à une demi-vie il vaut 0,5 ; à deux
 * demi-vies 0,25. Un âge négatif (fait postérieur au point d'observation)
 * est refusé : il signalerait une fuite d'information temporelle.
 */
export function decayWeight(ageDays: number, halfLifeDays: number): number {
	if (!(halfLifeDays > 0)) throw new RangeError(`demi-vie invalide : ${halfLifeDays}`);
	if (ageDays < 0) throw new RangeError(`âge négatif : ${ageDays}`);
	return 0.5 ** (ageDays / halfLifeDays);
}

/**
 * Modèle statique : chaque fait pèse son poids, quel que soit son âge.
 * C'est le comportement historique du score, celui que la décroissance doit
 * battre sur un risque non stationnaire.
 */
export function scoreStatic(facts: readonly Fact[], asOf: string): number {
	let score = 0;
	for (const fact of facts) {
		if (ageInDays(fact.day, asOf) < 0) throw new RangeError(`fait postérieur à ${asOf}`);
		score += fact.weight;
	}
	return score;
}

/** Modèle à décroissance : poids brut multiplié par la demi-vie exponentielle. */
export function scoreDecay(facts: readonly Fact[], asOf: string, halfLifeDays: number): number {
	let score = 0;
	for (const fact of facts) {
		const age = ageInDays(fact.day, asOf);
		if (age < 0) throw new RangeError(`fait postérieur à ${asOf}`);
		score += fact.weight * decayWeight(age, halfLifeDays);
	}
	return score;
}

export type Concordance = {
	/** Indice de concordance (équivalent à l'AUC pour une issue binaire). */
	cIndex: number;
	/** Paires positives/négatives réellement comparées. */
	pairs: number;
	concordant: number;
	discordant: number;
	/** Paires à scores égaux, comptées 0,5. */
	tied: number;
};

/**
 * Indice de concordance de Harrell pour une issue binaire : sur chaque paire
 * (positive, négative), le score de la positive doit être plus haut. Les
 * égalités valent 0,5. Aucune paire exploitable rend 0,5 (hasard), jamais 0
 * ni 1 : sans comparaison, il n'y a pas de preuve de discrimination.
 */
export function concordanceIndex(
	rows: readonly { score: number; positive: boolean }[],
): Concordance {
	let pairs = 0;
	let concordant = 0;
	let discordant = 0;
	let tied = 0;
	for (let i = 0; i < rows.length; i++) {
		for (let j = i + 1; j < rows.length; j++) {
			const a = rows[i]!;
			const b = rows[j]!;
			if (a.positive === b.positive) continue;
			const positive = a.positive ? a.score : b.score;
			const negative = a.positive ? b.score : a.score;
			pairs += 1;
			if (positive > negative) concordant += 1;
			else if (positive < negative) discordant += 1;
			else tied += 1;
		}
	}
	return {
		cIndex: pairs === 0 ? 0.5 : (concordant + 0.5 * tied) / pairs,
		pairs,
		concordant,
		discordant,
		tied,
	};
}
