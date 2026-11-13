export type Secteur = "collectivite" | "sante" | "enseignement" | "entreprise";

export type FaitSecteur = {
	secteur: Secteur;
	vu: boolean;
	correct: boolean;
};

export type StatSecteur = {
	secteur: Secteur;
	faits: number;
	vus: number;
	rappel: number | null;
	precision: number | null;
	reserve: boolean;
	/**
	 * Intervalle de confiance à 95 % du rappel (méthode de Wilson).
	 *
	 * La réserve binaire (« moins de 10 faits, on ne dit rien ») laissait un
	 * secteur à 4 faits sans aucune information. L'intervalle dit la vérité
	 * utile : 4/4 vus, c'est un rappel de 100 % avec un intervalle de
	 * [51 %, 100 %]. On sait alors ce qu'on sait, et à quel point.
	 */
	intervalle: [number, number] | null;
};

export const SEUIL_RESERVE = 10;

/**
 * Intervalle de Wilson : il reste valable sur de petits effectifs et ne sort
 * jamais de [0, 1], contrairement à l'intervalle normal qui donne des bornes
 * négatives dès que le taux est proche de 0 ou de 1.
 */
export function intervalleWilson(succes: number, total: number, z = 1.96): [number, number] | null {
	if (total <= 0) return null;
	const p = succes / total;
	const z2 = z * z;
	const denominateur = 1 + z2 / total;
	const centre = (p + z2 / (2 * total)) / denominateur;
	const marge = (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominateur;
	return [Math.max(0, centre - marge), Math.min(1, centre + marge)];
}

export function mesurerSecteurs(faits: readonly FaitSecteur[]): StatSecteur[] {
	const acc = new Map<Secteur, { faits: number; vus: number; corrects: number }>();
	for (const s of ["collectivite", "sante", "enseignement", "entreprise"] as Secteur[]) {
		acc.set(s, { faits: 0, vus: 0, corrects: 0 });
	}
	for (const f of faits) {
		const a = acc.get(f.secteur);
		if (!a) continue;
		a.faits++;
		if (f.vu) {
			a.vus++;
			if (f.correct) a.corrects++;
		}
	}
	return [...acc.entries()]
		.map(([secteur, a]) => {
			const reserve = a.faits < SEUIL_RESERVE;
			return {
				secteur,
				faits: a.faits,
				vus: a.vus,
				// Le taux est toujours calculé ; c'est `reserve` qui dit à quel
				// point il est solide, et `intervalle` qui dit combien. Renvoyer
				// `null` revenait à cacher 4/4 = 100 % derrière « réserve ».
				rappel: a.faits === 0 ? null : a.vus / a.faits,
				precision: a.vus === 0 ? null : a.corrects / a.vus,
				reserve,
				intervalle: intervalleWilson(a.vus, a.faits),
			};
		})
		// Aucun filtre sur `faits > 0` : un secteur absent du corpus est un
		// résultat, pas une ligne à cacher. C'est même le résultat le plus
		// important — « aucune donnée » et « 0 % de réussite » ne se lisent pas
		// pareil.
		.sort((a, b) => b.faits - a.faits);
}
