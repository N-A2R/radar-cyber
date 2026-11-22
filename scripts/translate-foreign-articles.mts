#!/usr/bin/env -S npx tsx
/**
 * Measure and store offline translations of foreign-language NA articles.
 *
 * Read-only by default. `--apply` upserts translated headlines only (never the
 * original text or a summary) into article_translation. `--offline` replays the
 * frozen gold corpus with no database access.
 *
 *   apps/api/node_modules/.bin/tsx scripts/translate-foreign-articles.mts \
 *     --json=bench/results/translation.json
 *   apps/api/node_modules/.bin/tsx scripts/translate-foreign-articles.mts --apply
 *   apps/api/node_modules/.bin/tsx scripts/translate-foreign-articles.mts --offline
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	containsPersonalData,
	detectArticleLanguage,
	translateEligibleArticle,
	type ArticleRecord,
	type ForeignLanguage,
} from "../apps/api/src/translation/index.js";
import { NA_DEPARTMENTS } from "../apps/api/src/multilingualIncidents/index.js";

const argv = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
	const found = argv.find((arg) => arg.startsWith(`${name}=`));
	return found ? found.slice(name.length + 1) : fallback;
};
const OFFLINE = argv.includes("--offline");
const APPLY = argv.includes("--apply");
const GOLD_PATH = option("--gold", "bench/corpus/translation-gold.jsonl");
const RESULT_PATH = option("--json", "bench/results/translation.json");

const NA_CODES = Object.keys(NA_DEPARTMENTS).map((code) => `'${code}'`).join(", ");
const ARTICLE_SQL = `
  SELECT e.id::text AS id, e.title, e.regional, o.dept AS department, e.source_id
    FROM event e
    LEFT JOIN org o ON o.id = e.org_id
   WHERE e.regional OR o.dept IN (${NA_CODES})
   ORDER BY e.id
`;
const BASELINE_SQL = `
  SELECT (SELECT count(*)::int FROM org) AS organizations,
         (SELECT count(*)::int FROM source) AS sources,
         (SELECT count(*)::int FROM event) AS events
`;
const RULE =
  "article = event anchored in Nouvelle-Aquitaine (regional flag or org department in the 12 NA codes); " +
  "foreign = deterministic title language detection with at least 3 evidence points and confidence >= 0.3; " +
  "translation = offline glossary, no network and no paid service; " +
  "personal data = email or phone in the headline blocks translation; " +
  "quality = 85% multiset content F1 against an independent French reference + 15% identifier preservation";

interface GoldRow extends ArticleRecord {
	language: ForeignLanguage;
	reference: string;
}

interface ArticleRow extends ArticleRecord {
	source_id?: string | null;
}

function readGold(): GoldRow[] {
	if (!existsSync(GOLD_PATH)) throw new Error(`missing gold corpus: ${GOLD_PATH}`);
	return readFileSync(GOLD_PATH, "utf8")
		.split("\n")
		.filter((line) => line.length > 0 && !line.startsWith("#"))
		.map((line) => {
			const row = JSON.parse(line) as GoldRow;
			if (row.id === undefined || typeof row.title !== "string" || typeof row.reference !== "string") {
				throw new Error(`invalid gold line: ${line}`);
			}
			return row;
		});
}

async function loadLive(): Promise<{ rows: ArticleRow[]; baseline: Record<string, number> }> {
	const { query } = await import("../apps/api/src/db.js");
	const [articles, baseline] = await Promise.all([
		query<ArticleRow>(ARTICLE_SQL),
		query<Record<string, number>>(BASELINE_SQL),
	]);
	return { rows: articles.rows, baseline: baseline.rows[0] ?? {} };
}

async function store(rows: ReturnType<typeof translateEligibleArticle>[]): Promise<number> {
	const { ingestQuery } = await import("../apps/api/src/db.js");
	const translations = rows.filter((row): row is NonNullable<typeof row> => row !== null);
	for (const row of translations) {
		await ingestQuery(
			`INSERT INTO article_translation (event_id, language, translated_title, quality)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (event_id) DO UPDATE
			   SET language = EXCLUDED.language,
			       translated_title = EXCLUDED.translated_title,
			       quality = EXCLUDED.quality,
			       created_at = now()`,
			[row.eventId, row.language, row.translatedTitle, row.quality],
		);
	}
	return translations.length;
}

function mean(values: number[]): number {
	return values.length === 0 ? 0 : Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4));
}

async function main(): Promise<void> {
	if (APPLY && OFFLINE) throw new Error("--apply requires the live database");
	try {
	const gold = readGold();
	const references = new Map(gold.map((row) => [String(row.id), row.reference]));
	const live = OFFLINE ? null : await loadLive();
	const rows: ArticleRow[] = live?.rows ?? gold;
	const foreign = rows.filter((row) => {
		const detection = detectArticleLanguage(row.title);
		return detection.language !== "fr" && detection.language !== "und";
	});
	const results = rows.map((row) =>
		translateEligibleArticle(row, references.get(String(row.id)) ?? null),
	).filter((result): result is NonNullable<typeof result> => result !== null);
	const goldQuality = results
		.filter((result) => references.has(String(result.eventId)))
		.map((result) => result.quality);
	const selfQuality = results.map((result) => result.quality);
	const personalDataViolations = results.filter((result) =>
		containsPersonalData(result.translatedTitle),
	).length;
	const byLanguage: Record<string, number> = {};
	for (const result of results) byLanguage[result.language] = (byLanguage[result.language] ?? 0) + 1;

	const goldCovered = gold.every((row) => results.some((result) => String(result.eventId) === String(row.id)))
		&& goldQuality.length === results.length;
	const payload = {
		scope: "Nouvelle-Aquitaine (12 departments)",
		rule: RULE,
		baseline: live?.baseline ?? null,
		naArticles: rows.length,
		foreignArticles: foreign.length,
		translatedArticles: results.length,
		byLanguage: Object.fromEntries(Object.entries(byLanguage).sort(([a], [b]) => a.localeCompare(b))),
		quality: {
			goldEntries: gold.length,
			goldCovered,
			meanReferenceQuality: mean(goldQuality),
			minReferenceQuality: goldQuality.length === 0 ? 0 : Math.min(...goldQuality),
			meanSelfQuality: mean(selfQuality),
		},
		personalDataViolations,
		corpus: GOLD_PATH,
		sql: { articles: ARTICLE_SQL, baseline: BASELINE_SQL },
	};

	console.log(`NA articles: ${rows.length}`);
	console.log(`foreign-language articles: ${foreign.length}`);
	console.log(`translated articles: ${results.length}`);
	console.log(`mean reference quality: ${payload.quality.meanReferenceQuality}`);
	console.log(`personal-data violations: ${personalDataViolations}`);
	writeFileSync(RESULT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	console.log(`written: ${RESULT_PATH}`);

	if (!goldCovered) throw new Error("gold corpus and eligible articles disagree: refresh translations before publishing");
	if (personalDataViolations > 0) throw new Error("translated headline contains personal data");
	if (APPLY) console.log(`stored translations: ${await store(results)}`);
	} finally {
		if (!OFFLINE) {
			const { closePools } = await import("../apps/api/src/db.js");
			await closePools();
		}
	}
}

try {
	await main();
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
