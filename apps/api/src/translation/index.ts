/**
 * Offline translation of foreign-language articles in Nouvelle-Aquitaine.
 *
 * Pure module: no database, no network, no paid service, no personal data.
 * A translation is produced only for an article anchored in one of the twelve
 * Nouvelle-Aquitaine departments. The engine is a deterministic glossary: it
 * never invents facts, and protected tokens (identifiers, numbers, domains,
 * product names) are carried over verbatim. Victim contact details make an
 * article ineligible instead of being stored or translated.
 */
import { isInNouvelleAquitaine } from "../multilingualIncidents/index.js";

export type ArticleLanguage = "fr" | "en" | "de" | "nl" | "und";
export type ForeignLanguage = Exclude<ArticleLanguage, "fr" | "und">;

export const MIN_LANGUAGE_EVIDENCE = 3;
export const MIN_LANGUAGE_CONFIDENCE = 0.3;

export interface ArticleRecord {
	id: number | string;
	title: string | null;
	summary?: string | null;
	department?: string | null;
	regional?: boolean | null;
}

export interface LanguageDetection {
	language: ArticleLanguage;
	confidence: number;
	scores: Readonly<Record<ArticleLanguage, number>>;
}

export interface TranslationResult {
	eventId: number | string;
	language: ForeignLanguage;
	translatedTitle: string;
	quality: number;
}

type WordMap = Readonly<Record<string, number>>;

/** Function words and strong domain terms: each token belongs to one language. */
const WORDS: Readonly<Record<ArticleLanguage, WordMap>> = {
	fr: {
		revendiqué: 4, revendiquée: 4, par: 2, dans: 1, pour: 1, avec: 1,
		une: 2, des: 2, les: 2, cette: 2, est: 2, sont: 2, été: 2, sur: 1,
		après: 2, selon: 2, fuite: 3, fuites: 3, données: 2, vulnérabilités: 3,
		cyberattaque: 3, cyberattaques: 3, préfecture: 2, communes: 2,
		entreprise: 1, sécurité: 1, plusieurs: 1,
	},
	en: {
		breached: 3, breach: 3, accounts: 2, operational: 3, guidance: 3,
		handling: 3, rulebooks: 3, arrests: 3, affiliates: 3, specializing: 2,
		headquartered: 2, vulnerabilities: 2, vulnerability: 2, incident: 2,
		incidents: 2, provides: 2, disclosed: 2, affected: 2, critical: 2,
		company: 1, products: 1, updates: 1, known: 1, about: 1, what: 1,
		know: 1, we: 1, the: 1, of: 1, for: 1, and: 1, is: 1, was: 1,
		were: 1, has: 1, have: 1, with: 1, from: 1, data: 1, security: 1,
		french: 1, technical: 1,
	},
	de: {
		kritische: 3, sicherheitslücken: 4, sicherheitslücke: 4, verfügbar: 3,
		wurden: 3, manipuliert: 3, frankreich: 3, kühlanlagen: 3, geht: 2,
		auch: 2, uns: 2, und: 2, weitere: 2, ausgenutzt: 3, gegen: 1,
		nicht: 1, bei: 1, nach: 1, für: 1, der: 1, die: 1, das: 1,
		ist: 1, sind: 1, ein: 1, eine: 1, in: 1,
	},
	nl: {
		kwetsbaarheden: 4, kwetsbaarheid: 4, verholpen: 4, misbruikt: 3,
		onmiddellijk: 3, mogelijk: 2, meerdere: 2, actief: 2, nu: 2,
		van: 2, voor: 2, bij: 2, heeft: 2, zijn: 2, actueel: 2,
	},
	und: {},
};

const PHRASES: ReadonlyArray<{ language: ForeignLanguage; pattern: RegExp; weight: number }> = [
	{ language: "en", pattern: /\bbreached accounts\b/gi, weight: 5 },
	{ language: "en", pattern: /\bdata breach\b/gi, weight: 4 },
	{ language: "en", pattern: /\boperational guidance\b/gi, weight: 5 },
	{ language: "en", pattern: /\bincident handling\b/gi, weight: 4 },
	{ language: "en", pattern: /\bwhat we know\b/gi, weight: 4 },
	{ language: "en", pattern: /\bthe arrests of\b/gi, weight: 4 },
	{ language: "de", pattern: /\b(in frankreich wurden|kritische sicherheitslücken|updates verfügbar)\b/gi, weight: 5 },
	{ language: "de", pattern: /\bgeht das auch bei uns\b/gi, weight: 5 },
	{ language: "nl", pattern: /\bkwetsbaarheden verholpen\b/gi, weight: 6 },
	{ language: "nl", pattern: /\bkwetsbaarheden in\b/gi, weight: 5 },
	{ language: "nl", pattern: /\bupdate nu\b/gi, weight: 5 },
];

/** Tokens claimed by two languages prove nothing and are discarded. */
const EXCLUSIVE_WORDS: Readonly<Record<ArticleLanguage, WordMap>> = (() => {
	const owners = new Map<string, Array<{ language: ArticleLanguage; weight: number }>>();
	for (const language of Object.keys(WORDS) as ArticleLanguage[]) {
		for (const [raw, weight] of Object.entries(WORDS[language])) {
			const token = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
			const list = owners.get(token) ?? [];
			list.push({ language, weight });
			owners.set(token, list);
		}
	}
	const result = {} as Record<ArticleLanguage, Record<string, number>>;
	for (const language of Object.keys(WORDS) as ArticleLanguage[]) result[language] = {};
	for (const [token, claimed] of owners) {
		if (claimed.length !== 1) continue;
		result[claimed[0].language][token] = claimed[0].weight;
	}
	return result;
})();

const FOREIGN_STOPWORDS: Readonly<Record<ForeignLanguage, Readonly<Record<string, true>>>> = {
	en: { the: true, of: true, for: true, and: true, with: true, from: true, what: true, we: true, about: true, is: true, was: true, were: true, has: true, have: true },
	de: { und: true, der: true, die: true, das: true, in: true, bei: true, für: true, nicht: true, ist: true, sind: true, ein: true, eine: true },
	nl: { van: true, voor: true, bij: true, heeft: true, zijn: true, de: true, het: true, een: true, en: true },
};

const FRENCH_STOPWORDS: Readonly<Record<string, true>> = {
	the: true, and: true, for: true, with: true, from: true, est: true, les: true,
	des: true, une: true, dans: true, pour: true, aux: true, sur: true, par: true,
	que: true, qui: true, ce: true, on: true, de: true, le: true, la: true,
	et: true, en: true, un: true, du: true,
};

/** Deterministic language detection for article titles. */
export function detectArticleLanguage(text: string | null | undefined): LanguageDetection {
	const scores = {} as Record<ArticleLanguage, number>;
	for (const language of Object.keys(WORDS) as ArticleLanguage[]) scores[language] = 0;
	const normalised = String(text ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
	for (const token of normalised.match(/[a-z]+/g) ?? []) {
		for (const language of Object.keys(WORDS) as ArticleLanguage[]) {
			scores[language] += EXCLUSIVE_WORDS[language][token] ?? 0;
		}
	}
	for (const phrase of PHRASES) {
		const matches = String(text ?? "").match(phrase.pattern);
		if (matches) scores[phrase.language] += phrase.weight * matches.length;
	}
	const ranked = (Object.keys(WORDS) as ArticleLanguage[]).sort((a, b) => scores[b] - scores[a]);
	const best = ranked[0];
	const evidence = scores[best];
	if (evidence < MIN_LANGUAGE_EVIDENCE || scores[ranked[1]] === evidence) {
		return { language: "und", confidence: 0, scores };
	}
	const confidence = Number(((evidence - scores[ranked[1]]) / evidence).toFixed(3));
	if (confidence < MIN_LANGUAGE_CONFIDENCE) return { language: "und", confidence, scores };
	return { language: best, confidence, scores };
}

/** An article is in scope only when anchored in Nouvelle-Aquitaine. */
export function isInScopeArticle(article: Pick<ArticleRecord, "regional" | "department">): boolean {
	return isInNouvelleAquitaine(article);
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const FRENCH_PHONE = /\b0[1-9](?:[ .-]?\d{2}){4}\b/;

/** True when an article carries a victim's contact detail: never translate it. */
export function containsPersonalData(text: string | null | undefined): boolean {
	const value = String(text ?? "");
	return EMAIL.test(value) || FRENCH_PHONE.test(value);
}

const PHRASE_TRANSLATIONS: Readonly<Record<ForeignLanguage, ReadonlyArray<readonly [RegExp, string]>>> = {
	en: [
		[/what we know about/gi, "ce que l'on sait sur"],
		[/operational guidance for incident handling/gi, "orientations opérationnelles pour la gestion des incidents"],
		[/operational guidance/gi, "orientations opérationnelles"],
		[/incident handling/gi, "gestion des incidents"],
		[/data breach/gi, "fuite de données"],
		[/breached accounts/gi, "comptes compromis"],
		[/the arrests of/gi, "les arrestations de"],
		[/([A-Z][\w-]+)\s+affiliates/g, "affiliés de $1"],
		[/is a French company specializing in/gi, "est une entreprise française spécialisée dans"],
		[/headquartered in/gi, "sise à"],
	],
	de: [
		[/in frankreich wurden/gi, "en France,"],
		[/kritische sicherheitslücken/gi, "vulnérabilités critiques"],
		[/geht das auch bei uns/gi, "est-ce aussi le cas chez nous"],
		[/updates verfügbar/gi, "mises à jour disponibles"],
	],
	nl: [
		[/kwetsbaarheden verholpen in/gi, "vulnérabilités corrigées dans"],
		[/kwetsbaarheden in/gi, "vulnérabilités dans"],
		[/update nu/gi, "mise à jour maintenant"],
	],
};

const WORD_TRANSLATIONS: Readonly<Record<ForeignLanguage, Readonly<Record<string, string>>>> = {
	en: {
		breached: "compromis", breach: "fuite", accounts: "comptes", data: "données",
		incident: "incident", incidents: "incidents", vulnerabilities: "vulnérabilités",
		vulnerability: "vulnérabilité", critical: "critique", update: "mise à jour",
		updates: "mises à jour", arrests: "arrestations", affiliates: "affiliés",
		rulebooks: "recueils de règles", providing: "fournissant", properties: "biens",
		property: "immobilier", inspections: "inspections", inspection: "inspection",
		company: "entreprise", specializing: "spécialisée", headquartered: "sise",
		technical: "technique", diagnostics: "diagnostics", buildings: "bâtiments",
		building: "bâtiment", services: "services", service: "service",
		and: "et", the: "le", with: "avec", from: "de", for: "pour", of: "de",
		in: "dans", is: "est", was: "été", were: "été", has: "a", have: "ont",
	},
	de: {
		sicherheitslücken: "vulnérabilités", sicherheitslücke: "vulnérabilité",
		kühlanlagen: "installations de refroidissement", manipuliert: "manipulées",
		wurden: "ont été", frankreich: "France", verfügbar: "disponible",
		kritische: "critiques", kritischer: "critique", weitere: "autres",
		ausgenutzt: "exploitées", gegen: "contre", nach: "selon", für: "pour",
		nicht: "pas", und: "et", bei: "chez", uns: "nous", auch: "aussi",
		in: "dans", ist: "est", sind: "sont", der: "le", die: "la", das: "le",
	},
	nl: {
		kwetsbaarheden: "vulnérabilités", kwetsbaarheid: "vulnérabilité",
		verholpen: "corrigées", misbruikt: "exploitées", onmiddellijk: "immédiatement",
		mogelijk: "possible", meerdere: "plusieurs", actief: "actif",
		update: "mise à jour", nu: "maintenant", van: "de", voor: "pour",
		bij: "chez", heeft: "a", zijn: "sont",
	},
};

const NORMALISED_WORD_TRANSLATIONS: Readonly<Record<ForeignLanguage, Readonly<Record<string, string>>>> = (() => {
	const result = {} as Record<ForeignLanguage, Record<string, string>>;
	for (const language of ["en", "de", "nl"] as ForeignLanguage[]) {
		result[language] = {};
		for (const [raw, translated] of Object.entries(WORD_TRANSLATIONS[language])) {
			result[language][raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")] = translated;
		}
	}
	return result;
})();

function translateTokens(text: string, language: ForeignLanguage): string {
	return text.split(/(\s+)/).map((token) => {
		if (!token.trim()) return token;
		const key = token.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
		const translated = NORMALISED_WORD_TRANSLATIONS[language][key];
		if (!translated) return token;
		return /^[A-Z]/.test(token)
			? translated.charAt(0).toUpperCase() + translated.slice(1)
			: translated;
	}).join("");
}

/** Offline glossary translation. Proper nouns, numbers and product names stay put. */
export function translateArticle(text: string | null | undefined, language: ForeignLanguage): string {
	let output = String(text ?? "").replace(/\s+/g, " ").trim();
	for (const [pattern, replacement] of PHRASE_TRANSLATIONS[language]) {
		output = output.replace(pattern, replacement);
	}
	output = translateTokens(output, language);
	return output.replace(/\s+([,.;:!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

function protectedTokens(text: string): string[] {
	return String(text ?? "").match(/[A-Z0-9][\w'’-]*|\d[\d.,%]*|\S+\.\S+/g) ?? [];
}

function contentTokens(text: string): string[] {
	return (String(text ?? "").toLowerCase().match(/[\p{L}]{3,}/gu) ?? [])
		.filter((token) => !Object.hasOwn(FRENCH_STOPWORDS, token))
		.map((token) => token.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

/** Multiset F1 between the translation and an independent reference. */
function contentF1(translated: string, reference: string): number {
	const actual = contentTokens(translated);
	const expected = contentTokens(reference);
	if (expected.length === 0) return 0;
	const pool = new Map<string, number>();
	for (const token of expected) pool.set(token, (pool.get(token) ?? 0) + 1);
	let matched = 0;
	for (const token of actual) {
		const left = pool.get(token) ?? 0;
		if (left > 0) {
			matched++;
			pool.set(token, left - 1);
		}
	}
	const precision = matched / Math.max(actual.length, 1);
	const recall = matched / expected.length;
	return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function preservation(original: string, translated: string, language: ForeignLanguage): number {
	const glossary = NORMALISED_WORD_TRANSLATIONS[language];
	const patterns = PHRASE_TRANSLATIONS[language];
	const phraseWords = new Set<string>();
	for (const [pattern] of patterns) {
		for (const match of String(original ?? "").match(new RegExp(pattern.source, "gi")) ?? []) {
			for (const word of match.match(/[\p{L}\p{N}]+/gu) ?? []) {
				phraseWords.add(word.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
			}
		}
	}
	const tokens = protectedTokens(original).filter((token) => {
		const key = token.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
		return !Object.hasOwn(glossary, key) && !phraseWords.has(key);
	});
	if (tokens.length === 0) return 1;
	return tokens.filter((token) => translated.includes(token)).length / tokens.length;
}

function foreignResidue(text: string, language: ForeignLanguage): number {
	const tokens = String(text ?? "").toLowerCase().match(/[a-zà-ÿ]+/g) ?? [];
	if (tokens.length === 0) return 0;
	const stop = FOREIGN_STOPWORDS[language];
	return tokens.filter((token) => Object.hasOwn(stop, token)).length / tokens.length;
}

/**
 * Translation quality in [0, 1]. With a reference: 85% content F1 plus 15%
 * identifier preservation. Without one: no foreign residue and no lost
 * identifier. A translation identical to its source always scores zero.
 */
export function translationQuality(
	original: string,
	translated: string,
	language: ForeignLanguage,
	reference?: string | null,
): number {
	if (translated.trim() === original.trim()) return 0;
	const kept = preservation(original, translated, language);
	if (reference) return Number((0.85 * contentF1(translated, reference) + 0.15 * kept).toFixed(4));
	return Number((kept * (1 - foreignResidue(translated, language))).toFixed(4));
}

/** Build one translation when the article is eligible; otherwise return null. */
export function translateEligibleArticle(
	article: ArticleRecord,
	reference?: string | null,
): TranslationResult | null {
	if (!isInScopeArticle(article)) return null;
	if (containsPersonalData(article.title)) return null;
	const detection = detectArticleLanguage(article.title);
	if (detection.language === "fr" || detection.language === "und") return null;
	const translatedTitle = translateArticle(article.title, detection.language);
	return {
		eventId: article.id,
		language: detection.language,
		translatedTitle,
		quality: translationQuality(String(article.title ?? ""), translatedTitle, detection.language, reference),
	};
}
