/**
 * Décomposition STL (Seasonal-Trend decomposition using Loess), sans
 * dépendance externe.
 *
 * Les séries de volume par famille sont quotidiennes : la saison est la
 * semaine (période 7), la tendance porte la montée lente du corpus, et le
 * reste porte les pics. STL isole ces trois composantes ; un pic de volume
 * est une valeur du reste hors de l'échelle robuste de la série, pas un
 * simple seuil sur le compte brut (qui confondrait une famille volumineuse
 * et une famille naissante).
 *
 * Le module est pur : il reçoit des nombres, ne lit ni la base, ni l'horloge.
 * La version robuste (boucle externe) repondère les points extrêmes pour que
 * deux ou trois jours de rattrapage ne déforment pas la tendance de six mois.
 */

export type StlOptions = {
	/** Période saisonnière ; 7 pour une série quotidienne. */
	period?: number;
	/** Nombre de points lissés par le loess saisonnier (une sous-série par phase). */
	seasonalWindow?: number;
	/** Nombre de jours lissés par le loess de tendance. */
	trendWindow?: number;
	/** Passes internes saison/tendance. */
	inner?: number;
	/** Passes externes de repondération robuste ; 1 désactive la robustesse. */
	outer?: number;
	/** Poids de robustesse : borne des résidus à laquelle le bisquare s'annule. */
	robustCutoff?: number;
};

export type StlDecomposition = {
	seasonal: number[];
	trend: number[];
	remainder: number[];
};

/** Moyenne mobile centrée ; la fenêtre rétrécit aux extrémités. */
export function movingAverage(values: readonly number[], radius: number): number[] {
	if (!Number.isInteger(radius) || radius < 0) throw new RangeError("radius must be a non-negative integer");
	const n = values.length;
	return values.map((_, i) => {
		const lo = Math.max(0, i - radius);
		const hi = Math.min(n - 1, i + radius);
		let sum = 0;
		for (let j = lo; j <= hi; j++) sum += values[j] ?? 0;
		return sum / (hi - lo + 1);
	});
}

/**
 * Loess local : régression linéaire pondérée sur les `span * n` points les plus
 * proches (tricube). `degree = 0` suffit pour un lissage saisonnier ; la
 * tendance utilise le degré 1 pour suivre une pente sans la décaler. Les poids
 * d'observation (robustesse) se multiplient au tricube : ils pondèrent le
 * résidu, ils ne multiplient pas la valeur observée.
 */
export function loess(
	xs: readonly number[],
	ys: readonly number[],
	span: number,
	degree: 0 | 1 = 1,
	observationWeights?: readonly number[],
): number[] {
	const n = xs.length;
	if (n === 0) return [];
	if (n !== ys.length) throw new RangeError("xs and ys must have the same length");
	if (observationWeights && observationWeights.length !== n) {
		throw new RangeError("observationWeights must have the same length as xs");
	}
	if (!Number.isFinite(span) || span <= 0) throw new RangeError("span must be > 0");
	const q = Math.min(n, Math.max(2, Math.ceil(span * n)));
	return xs.map((x0) => {
		const nearest = xs
			.map((x, i) => ({ distance: Math.abs(x - x0), i }))
			.sort((a, b) => a.distance - b.distance)
			.slice(0, q);
		const bandwidth = nearest[nearest.length - 1]?.distance ?? 0;
		const h = bandwidth > 0 ? bandwidth : 1;
		let sw = 0;
		let swx = 0;
		let swy = 0;
		let swxx = 0;
		let swxy = 0;
		for (const { distance, i } of nearest) {
			const u = distance / h;
			const w = (u < 1 ? (1 - u ** 3) ** 3 : 0) * (observationWeights?.[i] ?? 1);
			const x = xs[i] ?? 0;
			const y = ys[i] ?? 0;
			sw += w;
			swx += w * x;
			swy += w * y;
			swxx += w * x * x;
			swxy += w * x * y;
		}
		if (sw === 0) {
			// Tous les poids d'observation sont nuls dans ce voisinage : on
			// retombe sur la moyenne locale brute plutôt que d'inventer zéro.
			let sum = 0;
			for (const { i } of nearest) sum += ys[i] ?? 0;
			return sum / nearest.length;
		}
		if (degree === 0) return swy / sw;
		const denominator = sw * swxx - swx * swx;
		if (Math.abs(denominator) < 1e-12) return swy / sw;
		const slope = (sw * swxy - swx * swy) / denominator;
		const intercept = (swy - slope * swx) / sw;
		return intercept + slope * x0;
	});
}

/** Médiane d'une série non vide ; `null` si aucun nombre fini. */
export function median(values: readonly number[]): number | null {
	const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
	if (finite.length === 0) return null;
	const middle = Math.floor(finite.length / 2);
	if (finite.length % 2 === 1) return finite[middle] ?? null;
	const low = finite[middle - 1];
	const high = finite[middle];
	return typeof low === "number" && typeof high === "number" ? (low + high) / 2 : null;
}

/** Écart absolu médian, sans le facteur 1,4826. */
export function medianAbsoluteDeviation(values: readonly number[]): number {
	const center = median(values);
	if (center === null) return 0;
	return median(values.map((v) => Math.abs(v - center))) ?? 0;
}

/**
 * Échelle robuste d'une série de résidus : 1,4826 × MAD. Le plancher évite
 * qu'une série parfaitement plate transforme un +1 en z infini.
 */
export function robustScale(values: readonly number[], floor = 1e-9): number {
	return Math.max(1.4826 * medianAbsoluteDeviation(values), floor);
}

/**
 * Décompose une série en saison + tendance + reste.
 *
 * L'ordre suit Cleveland et al. (1990) : on retire la tendance, on lisse
 * chaque phase saisonnière, on filtre le saisonnier par deux moyennes mobiles
 * de période puis une moyenne de 3, on retire le saisonnier pour lisser la
 * tendance. La boucle externe repondère les résidus extrêmes (bisquare) sans
 * les supprimer : un pic reste dans le reste, mais ne dicte plus la tendance.
 */
export function stl(values: readonly number[], options: StlOptions = {}): StlDecomposition {
	const n = values.length;
	const period = options.period ?? 7;
	const seasonalWindow = options.seasonalWindow ?? 13;
	const trendWindow = options.trendWindow ?? 21;
	const inner = options.inner ?? 2;
	const outer = options.outer ?? 5;
	const robustCutoff = options.robustCutoff ?? 6;
	if (!Number.isInteger(period) || period < 2) throw new RangeError("period must be an integer >= 2");
	if (!Number.isFinite(seasonalWindow) || seasonalWindow <= 0) throw new RangeError("seasonalWindow must be > 0");
	if (!Number.isFinite(trendWindow) || trendWindow <= 0) throw new RangeError("trendWindow must be > 0");
	if (!Number.isInteger(inner) || inner < 1) throw new RangeError("inner must be an integer >= 1");
	if (!Number.isInteger(outer) || outer < 1) throw new RangeError("outer must be an integer >= 1");
	if (!Number.isFinite(robustCutoff) || robustCutoff <= 0) throw new RangeError("robustCutoff must be > 0");
	if (n === 0) return { seasonal: [], trend: [], remainder: [] };

	const xs = Array.from({ length: n }, (_, i) => i);
	const seasonal = new Array<number>(n).fill(0);
	const trend = new Array<number>(n).fill(0);
	let weights = new Array<number>(n).fill(1);

	if (n < 2 * period + 2) {
		const center = median(values) ?? 0;
		return {
			seasonal: new Array<number>(n).fill(0),
			trend: new Array<number>(n).fill(center),
			remainder: values.map((v) => v - center),
		};
	}

	for (let pass = 0; pass < outer; pass++) {
		for (let iteration = 0; iteration < inner; iteration++) {
			const detrended = values.map((v, i) => v - (trend[i] ?? 0));
			const rawSeasonal = new Array<number>(n).fill(0);
			for (let phase = 0; phase < period; phase++) {
				const indices: number[] = [];
				for (let i = phase; i < n; i += period) indices.push(i);
				if (indices.length === 0) continue;
				const positions = indices.map((_, j) => j);
				const phaseValues = indices.map((i) => detrended[i] ?? 0);
				const smoothed = loess(
					positions,
					phaseValues,
					Math.min(1, seasonalWindow / indices.length),
					0,
					indices.map((i) => weights[i] ?? 1),
				);
				indices.forEach((i, j) => {
					rawSeasonal[i] = smoothed[j] ?? 0;
				});
			}
			const lowPass = loess(
				xs,
				movingAverage(movingAverage(movingAverage(rawSeasonal, Math.floor(period / 2)), Math.floor(period / 2)), 1),
				Math.min(1, seasonalWindow / n),
				0,
			);
			for (let i = 0; i < n; i++) seasonal[i] = (rawSeasonal[i] ?? 0) - (lowPass[i] ?? 0);
			const deseasonalized = values.map((v, i) => v - (seasonal[i] ?? 0));
			const smoothedTrend = loess(xs, deseasonalized, Math.min(1, trendWindow / n), 1, weights);
			for (let i = 0; i < n; i++) trend[i] = smoothedTrend[i] ?? 0;
		}
		const remainder = values.map((v, i) => v - (seasonal[i] ?? 0) - (trend[i] ?? 0));
		if (pass < outer - 1) {
			const cutoff = robustCutoff * (median(remainder.map(Math.abs)) ?? 0);
			const bound = cutoff > 0 ? cutoff : 1e-9;
			weights = remainder.map((r) => {
				const u = Math.abs(r) / bound;
				return u < 1 ? (1 - u * u) ** 2 : 0;
			});
		}
	}

	return {
		seasonal,
		trend,
		remainder: values.map((v, i) => v - (seasonal[i] ?? 0) - (trend[i] ?? 0)),
	};
}
