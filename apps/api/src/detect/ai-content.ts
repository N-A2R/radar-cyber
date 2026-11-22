/**
 * Detection of AI-written text in Nouvelle-Aquitaine cyber content.
 *
 * The detector is pure, deterministic and offline: no LLM, no network call,
 * no paid service. It returns signal codes and a score, never the input text,
 * so it cannot leak victim identifiers into logs or reports.
 *
 * Gray-area sources are accepted like public sources; only the territorial
 * scope is enforced. Concrete identifiers (CVE, dates, figures, acronyms,
 * links) count against a machine-written verdict: newsroom copy is dense in
 * them, while generated prose tends to be abstract and evenly paced.
 */
import { naDepartmentCode } from "../geo/na-departments.js";

export type SourceKind = "public" | "gray";

export type AiContentInput = {
	text: string;
	department: string | null | undefined;
	sourceKind?: SourceKind;
};

export type AiContentVerdict = {
	inScope: boolean;
	isAiGenerated: boolean;
	score: number;
	signals: string[];
};

export const AI_CONTENT_THRESHOLD = 4;

const FORMULAIC =
	/\b(?:in conclusion|in summary|to sum up|overall|it is important to|it is worth noting|en conclusion|en somme|au final|il est important de|il convient de noter|il est essentiel de|dans le paysage|dans un contexte)/i;
const CLOSING = /^(?:in conclusion|in summary|to sum up|overall|en conclusion|en somme|au final)\b/i;
const HEDGE =
	/\b(?:may|might|could|appears? to|seems? to|likely|possibly|notamment|probablement|semble|semblent|peut-être|potentiellement)\b/gi;
const CONCRETE =
	/\b(?:CVE-\d{4}-\d{4,7}|CVSS|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d[\d.,%]*|@|[a-z0-9-]+\.(?:com|fr|org|net|io|eu)\b)/i;
const ACRONYM = /\b[A-Z]{3,}\b/;
const ABSTRACT =
	/\b(?:landscape|ecosystem|stakeholders|resilience|visibility|coordination|awareness|environment|context|importance|challenges|paysage|écosystème|parties prenantes|résilience|visibilité|coordination|sensibilisation|contexte|enjeux|défis)\b/gi;

const SENTENCE_SPLIT = /[.!?]+(?:\s|$)/;
const WORD_SPLIT = /[\p{L}\p{N}]+/gu;
const SIGNALS: Record<string, number> = {
	formulaic_discourse: 2,
	generic_abstract_prose: 2,
	flat_rhythm: 2,
	formulaic_closing: 1,
	hedging_stack: 1,
};

/** Distinct lowercase matches; a repeated slogan must not inflate the score. */
function distinctTerms(text: string, pattern: RegExp): string[] {
	pattern.lastIndex = 0;
	const found = new Set<string>();
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(text)) !== null) {
		found.add(match[0].toLowerCase());
	}
	return [...found];
}

/** Coefficient of variation of sentence lengths: low means machine-even prose. */
function rhythmScore(parts: string[]): number {
	if (parts.length < 3) return 1;
	const lengths = parts.map((part) => (part.match(WORD_SPLIT) ?? []).length);
	if (lengths.some((n) => n < 4)) return 1;
	const mean = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
	const variance = lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length;
	return mean > 0 ? Math.sqrt(variance) / mean : 1;
}

/**
 * Classify one text. Out-of-scope inputs are refused before any scoring:
 * the measurement and the report stay Nouvelle-Aquitaine only.
 */
export function detectAiContent(input: AiContentInput): AiContentVerdict {
	const inScope = naDepartmentCode(input.department) !== null;
	const text = input.text.replace(/\s+/g, " ").trim();
	const verdict: AiContentVerdict = { inScope, isAiGenerated: false, score: 0, signals: [] };
	if (!inScope || text.length < 100) return verdict;

	const parts = text.split(SENTENCE_SPLIT).map((part) => part.trim()).filter((part) => part.length > 0);
	const signals: string[] = [];

	if (FORMULAIC.test(text)) signals.push("formulaic_discourse");
	if (text.length >= 120 && !CONCRETE.test(text) && !ACRONYM.test(text) && distinctTerms(text, ABSTRACT).length >= 2) {
		signals.push("generic_abstract_prose");
	}
	if (rhythmScore(parts) <= 0.22) signals.push("flat_rhythm");
	const last = parts[parts.length - 1] ?? "";
	if (parts.length >= 2 && CLOSING.test(last)) signals.push("formulaic_closing");
	if ((text.match(HEDGE) ?? []).length >= 2) signals.push("hedging_stack");

	const score = signals.reduce((sum, signal) => sum + SIGNALS[signal], 0);
	// Two independent cue families are required: one slogan alone is not enough.
	verdict.score = score;
	verdict.signals = signals;
	verdict.isAiGenerated = score >= AI_CONTENT_THRESHOLD && signals.length >= 2;
	return verdict;
}
