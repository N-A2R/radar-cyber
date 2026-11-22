/**
 * Contrôle en ligne du taux de fausses découvertes (FDR) sur un flux de tests.
 *
 * Le détecteur de séries produisait autrefois des alertes sur un z-score fixe.
 * Ici, chaque candidat est converti en p-value à queue droite, puis décidé par
 * une dépense séquentielle du budget d'erreur (procédure LOND) :
 *
 *   γ_t = 6/(π² t²),  α_t = γ_t · q,  W_t = W_{t-1} − α_t.
 *
 * Σ γ_t = 1 donc Σ α_t = q : sous des p-values valides, la probabilité d'au
 * moins une fausse découverte est bornée par q (union bound), ce qui borne
 * aussi le FDR. Le seuil se resserre à mesure que le flux grandit ; aucune
 * étiquette n'est consultée.
 *
 * Module pur : ni base, ni horloge, ni état partagé au-delà de l'instance.
 */

/** Cible par défaut : 5 % de fausses découvertes au plus. */
export const FDR_CIBLE = 0.05;

export type DecisionFdr = {
	/** Rang du test dans le flux (1-based). */
	rang: number;
	p: number;
	/** Seuil de p-value appliqué à ce test. */
	seuil: number;
	/** Vrai si la p-value passe le seuil en ligne. */
	rejette: boolean;
	/** Budget d'erreur restant après la décision. */
	budget: number;
};

/** Complément de la fonction d'erreur, approximation numerical recipes. */
function erfc(x: number): number {
	const z = Math.abs(x);
	const t = 2 / (2 + z);
	const coefficients = [
		-1.26551223, 1.00002368, 0.37409196, 0.09678418, -0.18628806,
		0.27886807, -1.13520398, 1.48851587, -0.82215223, 0.17087277,
	];
	let polynome = 0;
	for (let i = coefficients.length - 1; i >= 0; i--) polynome = polynome * t + coefficients[i]!;
	const ans = t * Math.exp(-z * z + polynome);
	return x >= 0 ? ans : 2 - ans;
}

/** P-value à queue droite d'un z-score gaussien. */
export function pValueZ(z: number): number {
	if (!Number.isFinite(z)) throw new RangeError("z doit être fini");
	return Math.min(1, Math.max(0, 0.5 * erfc(z / Math.SQRT2)));
}

/** Dépense γ_t = 6/(π² t²) : somme à 1 sur t ≥ 1. */
export function poidsTemps(rang: number): number {
	if (!Number.isInteger(rang) || rang < 1) throw new RangeError("rang doit être un entier >= 1");
	return 6 / (Math.PI * Math.PI * rang * rang);
}

export class ControleFdrEnLigne {
	private rang = 0;
	private budget: number;

	constructor(private readonly cible: number = FDR_CIBLE) {
		if (!Number.isFinite(cible) || cible <= 0 || cible >= 1) {
			throw new RangeError("cible doit être dans (0, 1)");
		}
		this.budget = cible;
	}

	/** Teste une p-value et dépense α_t, que la décision soit positive ou non. */
	tester(p: number): DecisionFdr {
		if (!Number.isFinite(p) || p < 0 || p > 1) throw new RangeError("p doit être dans [0, 1]");
		this.rang++;
		const gamma = poidsTemps(this.rang);
		const seuil = gamma * this.cible;
		const rejette = p <= seuil;
		this.budget = Math.max(0, this.budget - seuil);
		return { rang: this.rang, p, seuil, rejette, budget: this.budget };
	}

	get tests(): number {
		return this.rang;
	}
}
