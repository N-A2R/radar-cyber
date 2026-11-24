/**
 * Isolation forest sur les profils d'événements, comparés à leur distribution
 * régionale. Un point est d'autant plus anomaly que son chemin moyen dans la
 * forêt est court (Liu, Ting & Zhou, 2008).
 *
 * Les fonctions pures de ce module sont partagées par le générateur de fixture,
 * le script de mesure et les tests : un seul calcul de score, donc aucune
 * divergence possible entre la table d'évaluation et le détecteur.
 */

export type EventCounts = {
	ransomware: number;
	phishing: number;
	vuln: number;
	ct: number;
	leak: number;
};

export type CandidateProfile = {
	event_id: string;
	region: string;
	counts: EventCounts;
	sources: number;
	peak: number;
};

export type ScoredCandidate = {
	event_id: string;
	region: string;
	score: number;
	rank: number;
	vector: number[];
};

export type ForestOptions = {
	trees?: number;
	sampleSize?: number;
	seed?: number;
};

type Node =
	| { leaf: true; size: number }
	| { leaf: false; feature: number; threshold: number; left: Node; right: Node };

type Tree = { root: Node; sampleSize: number };

export type Forest = { trees: Tree[]; dimensions: number };

/** PRNG déterministe (mulberry32) : même graine, même forêt, mêmes scores. */
export function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function harmonic(number: number): number {
	let sum = 0;
	for (let i = 1; i <= number; i += 1) sum += 1 / i;
	return sum;
}

/** Longueur moyenne d'un chemin dans un arbre de `size` points. */
function expectedPath(size: number): number {
	if (size <= 1) return 0;
	return 2 * harmonic(size - 1) - (2 * (size - 1)) / size;
}

const FEATURE_NAMES = [
	"total",
	"ransomware",
	"phishing",
	"vuln",
	"ct",
	"leak",
	"sources",
	"burst",
] as const;

export function featureNames(): readonly string[] {
	return FEATURE_NAMES;
}

function rawFeatures(profile: CandidateProfile): number[] {
	const counts = profile.counts;
	const total = counts.ransomware + counts.phishing + counts.vuln + counts.ct + counts.leak;
	return [
		total,
		counts.ransomware,
		counts.phishing,
		counts.vuln,
		counts.ct,
		counts.leak,
		profile.sources,
		profile.peak,
	];
}

/**
 * Écart au profil régional : chaque grandeur est divisée par la médiane de sa
 * région, puis passée en log2. Les organisations d'une région à faible volume
 * ne sont donc pas pénalisées face à une région à fort volume.
 */
export function regionalVectors(profiles: readonly CandidateProfile[]): Map<string, number[]> {
	const rawByEvent = new Map(profiles.map((profile) => [profile.event_id, rawFeatures(profile)]));
	const byRegion = new Map<string, CandidateProfile[]>();
	for (const profile of profiles) {
		const group = byRegion.get(profile.region) ?? [];
		group.push(profile);
		byRegion.set(profile.region, group);
	}

	function median(values: number[]): number {
		const sorted = [...values].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
	}

	const baselines = new Map<string, number[]>();
	for (const [region, group] of byRegion) {
		baselines.set(
			region,
			FEATURE_NAMES.map((_, index) =>
				median(group.map((profile) => rawByEvent.get(profile.event_id)![index]!)),
			),
		);
	}

	const vectors = new Map<string, number[]>();
	for (const profile of profiles) {
		const baseline = baselines.get(profile.region)!;
		const raw = rawByEvent.get(profile.event_id)!;
		vectors.set(
			profile.event_id,
			raw.map((value, index) => Math.log2((value + 0.5) / (baseline[index]! + 0.5))),
		);
	}
	return vectors;
}

function buildNode(
	points: readonly number[][],
	depth: number,
	limit: number,
	random: () => number,
): Node {
	if (points.length <= 1 || depth >= limit) return { leaf: true, size: points.length };

	const candidates: Array<{ feature: number; min: number; max: number }> = [];
	for (let feature = 0; feature < points[0]!.length; feature += 1) {
		let min = Infinity;
		let max = -Infinity;
		for (const point of points) {
			min = Math.min(min, point[feature]!);
			max = Math.max(max, point[feature]!);
		}
		if (max > min) candidates.push({ feature, min, max });
	}
	if (candidates.length === 0) return { leaf: true, size: points.length };

	const picked = candidates[Math.floor(random() * candidates.length)]!;
	const threshold = picked.min + random() * (picked.max - picked.min);
	const left: number[][] = [];
	const right: number[][] = [];
	for (const point of points) {
		if (point[picked.feature]! < threshold) left.push(point);
		else right.push(point);
	}
	if (left.length === 0 || right.length === 0) return { leaf: true, size: points.length };

	return {
		leaf: false,
		feature: picked.feature,
		threshold,
		left: buildNode(left, depth + 1, limit, random),
		right: buildNode(right, depth + 1, limit, random),
	};
}

export function buildForest(vectors: readonly number[][], options: ForestOptions = {}): Forest {
	if (vectors.length === 0) throw new RangeError("aucun vecteur pour construire la forêt");
	const trees = options.trees ?? 128;
	const sampleSize = Math.min(options.sampleSize ?? 64, vectors.length);
	const seed = options.seed ?? 20261123;
	const random = seededRandom(seed);
	const limit = Math.max(1, Math.ceil(Math.log2(sampleSize)));
	const built: Tree[] = [];
	for (let i = 0; i < trees; i += 1) {
		const sample: number[][] = [];
		for (let j = 0; j < sampleSize; j += 1) {
			sample.push(vectors[Math.floor(random() * vectors.length)]!);
		}
		built.push({ root: buildNode(sample, 0, limit, random), sampleSize });
	}
	return { trees: built, dimensions: vectors[0]!.length };
}

function pathLength(vector: readonly number[], node: Node, depth: number): number {
	if (node.leaf) return depth + expectedPath(node.size);
	return pathLength(
		vector,
		vector[node.feature]! < node.threshold ? node.left : node.right,
		depth + 1,
	);
}

/** Score d'anomalie dans [0, 1] ; les valeurs élevées sont les plus isolées. */
export function anomalyScore(forest: Forest, vector: readonly number[]): number {
	if (vector.length !== forest.dimensions) throw new RangeError("dimension du vecteur incorrecte");
	let total = 0;
	for (const tree of forest.trees) {
		total += pathLength(vector, tree.root, 0) / expectedPath(tree.sampleSize);
	}
	const mean = total / forest.trees.length;
	return Math.min(1, Math.max(0, Math.pow(2, -mean)));
}

/**
 * Note une cohorte entière et attribue un rang 1..n (score décroissant,
 * event_id croissant en cas d'égalité).
 */
export function scoreCandidates(
	profiles: readonly CandidateProfile[],
	options: ForestOptions = {},
): ScoredCandidate[] {
	const vectors = regionalVectors(profiles);
	const forest = buildForest([...vectors.values()], options);
	const scored = profiles.map((profile) => ({
		event_id: profile.event_id,
		region: profile.region,
		score: anomalyScore(forest, vectors.get(profile.event_id)!),
		vector: vectors.get(profile.event_id)!,
		rank: 0,
	}));
	scored.sort((a, b) => b.score - a.score || a.event_id.localeCompare(b.event_id));
	scored.forEach((entry, index) => {
		entry.rank = index + 1;
	});
	return scored;
}

/** Précision@K : part de vrais positifs parmi les K premiers rangs. */
export function precisionAtK(labels: readonly boolean[], scores: readonly number[], k: number): number {
	if (labels.length !== scores.length) throw new RangeError("labels et scores de tailles différentes");
	const order = scores
		.map((score, index) => ({ score, label: labels[index] }))
		.sort((a, b) => b.score - a.score);
	const top = order.slice(0, k);
	return top.filter((entry) => entry.label).length / k;
}

/** ROC-AUC par la statistique de Mann-Whitney, avec moyenne des rangs ex aequo. */
export function rocAuc(labels: readonly boolean[], scores: readonly number[]): number {
	if (labels.length !== scores.length) throw new RangeError("labels et scores de tailles différentes");
	const ordered = scores
		.map((score, index) => ({ score, positive: labels[index] === true }))
		.sort((a, b) => a.score - b.score);
	const positives = ordered.filter((entry) => entry.positive).length;
	const negatives = ordered.length - positives;
	if (positives === 0 || negatives === 0) return Number.NaN;

	let rankSum = 0;
	for (let index = 0; index < ordered.length; ) {
		let end = index + 1;
		while (end < ordered.length && ordered[end]!.score === ordered[index]!.score) end += 1;
		const averageRank = (index + 1 + end) / 2;
		rankSum += ordered[index]!.positive ? averageRank : 0;
		index = end;
	}
	return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

/** Accord inter-annotateurs, corrigé du hasard (kappa de Cohen). */
export function cohenKappa(first: readonly boolean[], second: readonly boolean[]): number {
	if (first.length !== second.length || first.length === 0) {
		throw new RangeError("annotations de tailles différentes");
	}
	let observed = 0;
	let firstYes = 0;
	let secondYes = 0;
	for (let i = 0; i < first.length; i += 1) {
		if (first[i] === second[i]) observed += 1;
		if (first[i]) firstYes += 1;
		if (second[i]) secondYes += 1;
	}
	const n = first.length;
	const pObserved = observed / n;
	const pFirst = firstYes / n;
	const pSecond = secondYes / n;
	const pChance = pFirst * pSecond + (1 - pFirst) * (1 - pSecond);
	return (pObserved - pChance) / (1 - pChance);
}
