/**
 * Score de confiance d'un fait, et sa décomposition.
 *
 * Un chiffre seul ne se discute pas : l'API doit pouvoir dire « 62, parce que
 * deux sources indépendantes, une source primaire, une date certaine, et un
 * éditeur cité par le corpus validé — mais le fait lui-même n'y est pas ».
 * Les quatre composantes viennent uniquement de données déjà en base ou du
 * corpus versionné : aucun réseau, aucun modèle, résultat reproductible.
 *
 * | composante           | poids | question posée |
 * |---|---|---|
 * | independentSources   | 0,35  | combien de sources distinctes parlent du fait ? |
 * | sourceQuality        | 0,25  | une source primaire, ou seulement des relais ? |
 * | temporalCoherence    | 0,20  | dates publiées et resserrées, ou déduites ? |
 * | validatedCorpus      | 0,20  | le fait est-il dans le corpus validé ? |
 *
 * Module pur : ni base, ni disque, ni horloge implicite (`now` est injecté).
 */

export type SourceRank = "primary" | "secondary";
export type DatePrecision = "certain" | "inferred" | "collection";
export type CorpusPresence = "exact" | "publisher" | "absent";

export type FactSource = {
	/** Deux lignes du même identifiant ne sont pas deux sources. */
	sourceId: string;
	rank: SourceRank;
	date: string | null;
	precision: DatePrecision;
};

export type ScoreInput = {
	/** Sources du fait, doublons d'identifiant acceptés et écartés ici. */
	sources: readonly FactSource[];
	/** Début/fin du fait, ISO : borne l'écart temporel entre sources. */
	start?: string | null;
	end?: string | null;
	corpusPresence: CorpusPresence;
};

/**
 * Surcouches pour un événement ou un rattachement précis : le fait reste le
 * même, mais la ligne portée par cette source peut avoir une autre date, un
 * autre rang ou un autre degré de présence dans le corpus.
 */
export type ScoreOverrides = {
	rank?: SourceRank;
	precision?: DatePrecision;
	date?: string | null;
	corpusPresence?: CorpusPresence;
};

export const SCORE_WEIGHTS = {
	independentSources: 0.35,
	sourceQuality: 0.25,
	temporalCoherence: 0.2,
	validatedCorpus: 0.2,
} as const;

/** Seuils de lecture, exposés tels quels dans la réponse. */
export const SCORE_LEVELS = { high: 70, medium: 40 } as const;

export type ScoreComponentKey = keyof typeof SCORE_WEIGHTS;
export type ScoreLevel = "high" | "medium" | "low";
export type ScoreComponents = Record<ScoreComponentKey, number>;

export type BreakdownLine = {
	key: ScoreComponentKey;
	label: string;
	/** Valeur normalisée entre 0 et 1. */
	value: number;
	weight: number;
	/** Points apportés à la note, arrondis à 0,1. */
	points: number;
	reason: string;
};

export type ConfidenceScore = {
	/** Note entière sur 100. */
	score: number;
	level: ScoreLevel;
	components: ScoreComponents;
	/** Quatre lignes lisibles : la note s'explique ligne par ligne. */
	breakdown: BreakdownLine[];
	/** Valeurs brutes, pour retracer chaque chiffre. */
	measures: {
		independentSources: number;
		primarySources: number;
		secondarySources: number;
		gapHours: number | null;
		precision: DatePrecision;
		corpusPresence: CorpusPresence;
	};
};

function bound(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function instant(date: string | null | undefined): number | null {
	if (!date) return null;
	const value = new Date(date).getTime();
	return Number.isFinite(value) ? value : null;
}

function gapHours(start: string | null | undefined, end: string | null | undefined): number | null {
	const a = instant(start);
	const b = instant(end);
	if (a === null || b === null || b < a) return null;
	return Math.round(((b - a) / 3_600_000) * 10) / 10;
}

const LABELS: Record<ScoreComponentKey, string> = {
	independentSources: "Independent sources",
	sourceQuality: "Source quality",
	temporalCoherence: "Temporal coherence",
	validatedCorpus: "Validated corpus",
};

const CORPUS_VALUES: Record<CorpusPresence, { value: number; reason: string }> = {
	exact: { value: 1, reason: "URL or entity identified in the validated corpus" },
	publisher: { value: 0.5, reason: "Publisher cited by the corpus, fact not identified" },
	absent: { value: 0, reason: "Absent from the validated corpus" },
};

/** Une primaire suffit à qualifier le fait ; sinon ce n'est qu'un relais. */
function quality(sources: readonly FactSource[], override: SourceRank | undefined): { value: number; reason: string } {
	if (override) {
		return {
			value: override === "primary" ? 1 : 0.5,
			reason: `reported by a ${override} source`,
		};
	}
	if (sources.length === 0) return { value: 0, reason: "no source" };
	const primary = sources.filter((s) => s.rank === "primary").length;
	const secondary = sources.length - primary;
	return {
		value: primary > 0 ? 1 : 0.5,
		reason: `${primary} primary, ${secondary} secondary`,
	};
}

/**
 * Une date publiée par la source et resserrée vaut le maximum ; une date
 * déduite du texte perd du terrain, une date de collecte encore plus. Une date
 * future n'apporte rien : c'est une date fausse, pas une bonne nouvelle.
 */
function coherence(
	sources: readonly FactSource[],
	input: ScoreInput,
	override: ScoreOverrides,
	now: Date,
): { value: number; reason: string; precision: DatePrecision; gap: number | null } {
	const dates = [...sources.map((s) => s.date), override.date ?? null].filter(
		(date): date is string => typeof date === "string",
	);
	const instants = dates.map(instant).filter((t): t is number => t !== null);
	const future = instants.some((t) => t > now.getTime() + 24 * 3_600_000);

	const precision: DatePrecision =
		override.precision ??
		(sources.some((s) => s.precision === "collection")
			? "collection"
			: sources.some((s) => s.precision === "inferred")
				? "inferred"
				: "certain");

	const gap = gapHours(input.start, input.end);
	let value: number;
	let reason: string;
	if (sources.length === 0 && !override.date) {
		value = 0;
		reason = "no date";
	} else if (future) {
		value = 0;
		reason = "date in the future";
	} else if (precision === "collection") {
		value = 0.4;
		reason = "collection date, not the incident date";
	} else if (precision === "inferred") {
		value = 0.7;
		reason = "date inferred from the text";
	} else {
		value = 1;
		reason = "date published by the source";
	}
	if (gap !== null && gap > 24) {
		value = Math.min(value, gap > 72 ? 0.5 : 0.8);
		reason += `, ${gap} h between sources`;
	}
	return { value: bound(value), reason, precision, gap };
}

/** Calcule la note et les quatre composantes. Fonction pure. */
export function scoreConfidence(
	input: ScoreInput,
	overrides: ScoreOverrides = {},
	now: Date = new Date(),
): ConfidenceScore {
	const unique = new Map<string, FactSource>();
	for (const source of input.sources) if (!unique.has(source.sourceId)) unique.set(source.sourceId, source);
	const sources = [...unique.values()];
	const distinct = sources.length;

	// Une seule source ne corrobore rien ; deux commencent à peser ; trois
	// suffisent à considérer le critère comme rempli.
	const countValue = distinct >= 3 ? 1 : distinct === 2 ? 0.6 : distinct === 1 ? 0.2 : 0;
	const countReason =
		distinct === 0
			? "no source"
			: distinct === 1
				? "one source: nothing corroborates it"
				: `${distinct} independent sources`;

	const qual = quality(sources, overrides.rank);
	const time = coherence(sources, input, overrides, now);
	const corpus = CORPUS_VALUES[overrides.corpusPresence ?? input.corpusPresence] ?? CORPUS_VALUES.absent;

	const components: ScoreComponents = {
		independentSources: countValue,
		sourceQuality: bound(qual.value),
		temporalCoherence: time.value,
		validatedCorpus: bound(corpus.value),
	};
	const reasons: Record<ScoreComponentKey, string> = {
		independentSources: countReason,
		sourceQuality: qual.reason,
		temporalCoherence: time.reason,
		validatedCorpus: corpus.reason,
	};

	const breakdown: BreakdownLine[] = (Object.keys(SCORE_WEIGHTS) as ScoreComponentKey[]).map((key) => ({
		key,
		label: LABELS[key],
		value: components[key],
		weight: SCORE_WEIGHTS[key],
		points: Math.round(components[key] * SCORE_WEIGHTS[key] * 1000) / 10,
		reason: reasons[key],
	}));
	const score = Math.round(breakdown.reduce((sum, line) => sum + line.points, 0));
	const level: ScoreLevel = score >= SCORE_LEVELS.high ? "high" : score >= SCORE_LEVELS.medium ? "medium" : "low";

	return {
		score,
		level,
		components,
		breakdown,
		measures: {
			independentSources: distinct,
			primarySources: sources.filter((s) => s.rank === "primary").length,
			secondarySources: sources.filter((s) => s.rank === "secondary").length,
			gapHours: time.gap,
			precision: time.precision,
			corpusPresence: overrides.corpusPresence ?? input.corpusPresence,
		},
	};
}
