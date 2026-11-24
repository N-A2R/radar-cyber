/** One test per behavior of the offline article-translation pipeline. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { closePools, query } from "../src/db.js";
import { installErrorHandler } from "../src/errors.js";
import translationsRoute from "../src/routes/translations.js";
import {
	containsPersonalData,
	detectArticleLanguage,
	isInScopeArticle,
	translateArticle,
	translateEligibleArticle,
	translationQuality,
	type ArticleRecord,
} from "../src/translation/index.js";
import { supprimerEvenementsArchivees } from "./helpers/archive-delete.js";

const TAG = `trans${Date.now().toString(36)}`;
const SOURCE = `${TAG}-source`;
let app: FastifyInstance;

before(async () => {
	await query("INSERT INTO source (id, name, family, url) VALUES ($1, $2, 'cti', $3)", [
		SOURCE, `Source ${TAG}`, "https://example.invalid/feed.xml",
	]);
	const org = await query<{ id: number }>(
		`INSERT INTO org (name, slug, kind, city, domain, status, dept)
		 VALUES ($1, $2, 'entreprise', 'Bordeaux', $3, 'confirme', '33') RETURNING id`,
		[`Org ${TAG}`, `${TAG}-org`, `${TAG}.example`],
	);
	const inside = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, org_id, regional, evidence)
		 VALUES ($1, 'cti', 'ambient_signal', $2, $3, $4, $5, false, $6::jsonb) RETURNING id`,
		[
			`${TAG}:inside`,
			"Kwetsbaarheden verholpen in F5 Networks",
			SOURCE,
			"https://example.invalid/feed.xml",
			org.rows[0]!.id,
			JSON.stringify({ run_id: "1" }),
		],
	);
	const outside = await query<{ id: number }>(
		`INSERT INTO event (dedup_key, family, assertion_type, title, source_id, source_url, regional, evidence)
		 VALUES ($1, 'cti', 'ambient_signal', $2, $3, $4, false, $5::jsonb) RETURNING id`,
		[
			`${TAG}:outside`,
			"Kwetsbaarheden verholpen in F5 Networks",
			SOURCE,
			"https://example.invalid/feed.xml",
			JSON.stringify({ run_id: "1" }),
		],
	);
	await query(
		`INSERT INTO article_translation (event_id, language, translated_title, quality)
		 VALUES ($1, 'nl', $2, 0.9), ($3, 'nl', $2, 0.9)`,
		[inside.rows[0]!.id, "vulnérabilités corrigées dans F5 Networks", outside.rows[0]!.id],
	);
	app = Fastify({ logger: false });
	installErrorHandler(app);
	await app.register(translationsRoute, { prefix: "/api" });
	await app.ready();
});

after(async () => {
	if (app) await app.close();
	await supprimerEvenementsArchivees("source_id = $1", [SOURCE]);
	await query("DELETE FROM source WHERE id = $1", [SOURCE]);
	await closePools();
});

const NA_ARTICLE = {
	id: 1,
	title: "Gîtes de France - 117,574 breached accounts",
	regional: false,
	department: "33",
} satisfies ArticleRecord;

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
	return { ...NA_ARTICLE, ...overrides };
}

test("English cyber headlines are detected as English", () => {
	const result = detectArticleLanguage(NA_ARTICLE.title);
	assert.equal(result.language, "en");
	assert.ok(result.confidence >= 0.3);
});

test("German and Dutch advisories are detected separately", () => {
	assert.equal(detectArticleLanguage("Kritische Sicherheitslücken in NGINX Plus").language, "de");
	assert.equal(detectArticleLanguage("Kwetsbaarheden verholpen in N-able N-central").language, "nl");
});

test("French headlines and evidence-free text are not labelled foreign", () => {
	assert.equal(detectArticleLanguage("Cyberattaque dans une commune de Gironde").language, "fr");
	assert.equal(detectArticleLanguage("sample").language, "und");
});

test("only Nouvelle-Aquitaine articles are in scope", () => {
	assert.equal(isInScopeArticle({ department: "64", regional: false }), true);
	assert.equal(isInScopeArticle({ department: "33", regional: false }), true);
	assert.equal(isInScopeArticle({ department: "75", regional: false }), false);
	assert.equal(isInScopeArticle({ department: null, regional: true }), true);
});

test("English breach headlines translate to French", () => {
	const translated = translateEligibleArticle(NA_ARTICLE);
	assert.equal(translated?.language, "en");
	assert.equal(translated?.translatedTitle, "Gîtes de France - 117,574 comptes compromis");
});

test("Dutch advisories translate with their product identifiers intact", () => {
	const translated = translateArticle("NCSC-2026-0478 Kwetsbaarheden verholpen in N-able N-central", "nl");
	assert.equal(translated, "NCSC-2026-0478 vulnérabilités corrigées dans N-able N-central");
});

test("German advisories translate their vulnerability wording", () => {
	const translated = translateArticle("Kritische Sicherheitslücken in NGINX Plus", "de");
	assert.equal(translated, "vulnérabilités critiques dans NGINX Plus");
});

test("a headline with an email address is never translated", () => {
	assert.equal(containsPersonalData("breached accounts victim@example.org"), true);
	assert.equal(translateEligibleArticle(article({ title: "breached accounts victim@example.org" })), null);
});

test("a headline with a phone number is never translated", () => {
	assert.equal(containsPersonalData("breached accounts 06 12 34 56 78"), true);
	assert.equal(translateEligibleArticle(article({ title: "breached accounts 06 12 34 56 78" })), null);
});

test("articles outside Nouvelle-Aquitaine produce no translation", () => {
	assert.equal(translateEligibleArticle(article({ department: "75", regional: false })), null);
});

test("quality rewards a faithful reference translation", () => {
	const reference = "Gîtes de France - 117,574 comptes compromis";
	const translated = translateArticle(NA_ARTICLE.title, "en");
	assert.equal(translationQuality(NA_ARTICLE.title, translated, "en", reference), 1);
});

test("quality falls when an identifier is lost", () => {
	const good = translationQuality("Kwetsbaarheden in F5", "vulnérabilités dans F5", "nl");
	const lost = translationQuality("Kwetsbaarheden in F5", "vulnérabilités dans Other", "nl");
	assert.ok(good > lost, `${good} > ${lost}`);
	assert.equal(lost, 0);
});

test("quality is zero when nothing was translated", () => {
	assert.equal(translationQuality(NA_ARTICLE.title, NA_ARTICLE.title, "en"), 0);
});

test("the gold corpus covers every foreign article with a quality floor", () => {
	const path = fileURLToPath(new URL("../../../bench/corpus/translation-gold.jsonl", import.meta.url));
	const gold = readFileSync(path, "utf8")
		.split("\n")
		.filter((line) => line.length > 0)
		.map((line) => JSON.parse(line) as ArticleRecord & { reference: string });
	assert.ok(gold.length >= 10);
	for (const row of gold) {
		const translated = translateEligibleArticle(row, row.reference);
		assert.ok(translated, `gold article ${row.id} must be eligible`);
		assert.ok(translated.quality >= 0.7, `gold article ${row.id} quality ${translated.quality}`);
	}
});

test("the translations endpoint exposes Nouvelle-Aquitaine headlines only", async () => {
	const response = await app.inject({ method: "GET", url: "/api/translations" });
	assert.equal(response.statusCode, 200);
	const body = response.json<{ count: number; items: Array<Record<string, unknown>> }>();
	assert.equal(body.count, 1);
	assert.equal(body.items[0]?.translatedTitle, "vulnérabilités corrigées dans F5 Networks");
	assert.equal(body.items[0]?.language, "nl");
	assert.equal(body.items[0]?.quality, 0.9);
});

test("the translations endpoint rejects an invalid limit", async () => {
	const response = await app.inject({ method: "GET", url: "/api/translations?limit=0" });
	assert.equal(response.statusCode, 400);
});
