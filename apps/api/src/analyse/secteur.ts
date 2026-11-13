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
};

export const SEUIL_RESERVE = 10;

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
				rappel: reserve ? null : (a.faits === 0 ? null : a.vus / a.faits),
				precision: reserve || a.vus === 0 ? null : a.corrects / a.vus,
				reserve,
			};
		})
		// Aucun filtre sur `faits > 0` : un secteur absent du corpus est un
		// résultat, pas une ligne à cacher. C'est même le résultat le plus
		// important — « aucune donnée » et « 0 % de réussite » ne se lisent pas
		// pareil.
		.sort((a, b) => b.faits - a.faits);
}
