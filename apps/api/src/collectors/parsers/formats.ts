/**
 * Lecture des flux tels que les sources les renvoient réellement.
 *
 * Un seul point d'entrée (`parseSource`) pour les cinq formats rencontrés en
 * production : RSS 2.0, Atom, JSON-LD (schema.org), pages HTML à `<article>`
 * ou `<main>`, et flux JSON maison. Chaque item porte les cinq champs que la
 * collecte exploite : `title`, `date`, `link`, `summary`, `language`.
 *
 * Règles : jamais d'item inventé, jamais de champ deviné à partir d'un menu,
 * et la langue déclarée par le document prime sur l'heuristique de texte.
 */
import { XMLParser } from "fast-xml-parser";
import { detectLanguage } from "../filter.js";

export type SourceFormat = "rss2" | "atom" | "jsonld" | "html" | "json" | "unknown";

export interface SourceItem {
	title: string;
	date: string;
	link: string;
	summary: string;
	language: string;
}

export interface SourceParseResult {
	format: SourceFormat;
	path: string;
	/** Langue déclarée par le document (flux ou page), vide si absente. */
	language: string;
	items: SourceItem[];
}

export interface SourceParseOptions {
	contentType?: string | null;
	/** URL de la source : sert à rendre les liens relatifs absolus. */
	sourceUrl?: string;
	/** Chemin explicite déclaré dans `source.parser.itemsPath`. */
	itemsPath?: string;
}

type JsonRecord = Record<string, unknown>;

export interface HtmlMeta {
	title: string;
	link: string;
	date: string;
	language: string;
}

const xml = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	textNodeName: "#text",
	trimValues: true,
	parseTagValue: false,
	parseAttributeValue: false,
});

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
	copy: "©", reg: "®", hellip: "…", mdash: "—", ndash: "–",
	laquo: "«", raquo: "»", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
	eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ucirc: "û", ecirc: "ê",
	igrave: "ì", ocirc: "ô", ugrave: "ù", auml: "ä", ouml: "ö", szlig: "ß",
	"#39": "'",
};

const MAX_TITLE = 400;
const MAX_SUMMARY = 2000;
const MAX_ITEMS = 5000;

function isObject(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Décode les entités, y compris les doubles échappements (`&lt;p&gt;`). */
function decode(value: string): string {
	let out = value;
	for (let pass = 0; pass < 2; pass += 1) {
		if (!out.includes("&")) break;
		out = out.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/gi, (match, entity: string) => {
			if (/^#x/i.test(entity)) {
				const code = Number.parseInt(entity.slice(2), 16);
				return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
			}
			if (entity.startsWith("#")) {
				const code = Number.parseInt(entity.slice(1), 10);
				return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
			}
			return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
		});
	}
	return out;
}

/** Texte lisible d'un fragment HTML ou d'un champ RSS échappé. */
function plain(value: unknown): string {
	const raw = typeof value === "string" ? value : textOf(value);
	return decode(raw)
		.replace(/<br\s*\/?>/gi, " ")
		.replace(/<\/(?:p|li|div|h[1-6]|tr)>/gi, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/[\u00a0\s]+/g, " ")
		.trim();
}

function clip(value: string, max: number): string {
	return plain(value).slice(0, max);
}

/** Valeur textuelle d'un nœud fast-xml-parser (texte, CDATA, `#text`, attribut). */
function textOf(value: unknown): string {
	if (typeof value === "string" || typeof value === "number") return String(value).trim();
	if (Array.isArray(value)) {
		for (const entry of value) {
			const text = textOf(entry);
			if (text) return text;
		}
		return "";
	}
	if (!isObject(value)) return "";
	for (const key of ["#text", "@_href", "@_url", "url", "name", "value"]) {
		const text = textOf(value[key]);
		if (text) return text;
	}
	return "";
}

/** BCP 47 → code court ; `"en-US"` devient `"en"`. */
export function normalizeLanguage(value: unknown): string {
	const raw = plain(value).toLowerCase();
	if (!raw) return "";
	const token = raw.split(/[-_]/)[0] ?? "";
	if (token === "français" || token === "francais") return "fr";
	if (token === "english") return "en";
	return /^[a-z]{2,3}$/.test(token) ? token : "";
}

function languageOf(text: string): string {
	const detection = detectLanguage(text);
	return detection.scores.fr === detection.scores.en ? "" : detection.language;
}

function absolute(value: string, base?: string): string {
	const raw = plain(value);
	if (!raw || raw.startsWith("#") || /^(?:javascript|mailto|tel):/i.test(raw)) return "";
	if (/^https?:\/\//i.test(raw)) return raw;
	if (raw.startsWith("//")) return `https:${raw}`;
	if (base) {
		try { return new URL(raw, base).href; } catch { /* lien relatif inexploitable */ }
	}
	return raw;
}

function firstString(record: JsonRecord, keys: string[]): string {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
		if (typeof value === "number") return String(value);
	}
	return "";
}

function firstText(record: JsonRecord, keys: string[]): string {
	for (const key of keys) {
		const value = record[key];
		if (value === undefined || value === null || value === "") continue;
		const text = plain(value);
		if (text) return text;
	}
	return "";
}

function makeItem(
	title: string,
	date: string,
	link: string,
	summary: string,
	language: string,
): SourceItem | null {
	const cleanTitle = clip(title, MAX_TITLE);
	if (!cleanTitle) return null;
	return {
		title: cleanTitle,
		date: clip(date, 120),
		link,
		summary: clip(summary, MAX_SUMMARY),
		language: normalizeLanguage(language) || languageOf(`${cleanTitle} ${plain(summary)}`),
	};
}

function dedupe(items: SourceItem[]): SourceItem[] {
	const seen = new Set<string>();
	const out: SourceItem[] = [];
	for (const item of items) {
		const key = (item.link || item.title).toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(item);
	}
	return out;
}

function children(container: unknown, key: string): JsonRecord[] {
	if (!isObject(container)) return [];
	const value = container[key];
	if (Array.isArray(value)) return value.filter(isObject);
	return isObject(value) ? [value] : [];
}

/** Cherche un tableau d'items profond quand le chemin canonique est vide. */
function deepItems(root: unknown): JsonRecord[] {
	const found: JsonRecord[] = [];
	const visit = (node: unknown, depth: number): void => {
		if (depth > 7 || found.length >= MAX_ITEMS) return;
		if (Array.isArray(node)) {
			const objects = node.filter(isObject);
			if (objects.some((o) => firstText(o, ["title", "name", "post_title", "headline"]) !== "")) {
				found.push(...objects);
				return;
			}
			for (const entry of node) visit(entry, depth + 1);
			return;
		}
		if (!isObject(node)) return;
		for (const key of ["item", "entry", "items", "entries", "results", "posts"]) {
			if (node[key] !== undefined) visit(node[key], depth + 1);
		}
		if (found.length === 0) for (const value of Object.values(node)) visit(value, depth + 1);
	};
	visit(root, 0);
	return found;
}

/* ------------------------------------------------------------------ RSS 2.0 */

function rssLink(item: JsonRecord, base?: string): string {
	const raw = item.link;
	if (isObject(raw) || Array.isArray(raw)) {
		const link = textOf(raw);
		return absolute(link, base);
	}
	if (typeof raw === "string" && raw.trim()) return absolute(raw, base);
	const guid = firstText(item, ["guid", "id"]);
	return /^https?:\/\//i.test(guid) ? guid : "";
}

function parseRss2(root: JsonRecord, options: SourceParseOptions): SourceParseResult | null {
	const rss = isObject(root.rss) ? root.rss : root;
	const channel = isObject(rss.channel) ? rss.channel : rss;
	const feedLanguage = normalizeLanguage(channel.language ?? rss["@_xml:lang"] ?? root["@_xml:lang"]);
	const feedLink = absolute(textOf(channel.link), options.sourceUrl);
	let items = children(channel, "item");
	let path = "rss.channel.item";
	if (items.length === 0) {
		items = children(rss, "item");
		path = "rss.item";
	}
	if (items.length === 0) {
		items = deepItems(root);
		path = "auto";
	}
	const parsed = items.slice(0, MAX_ITEMS).map((item) => {
		const link = rssLink(item, feedLink || options.sourceUrl);
		return makeItem(
			firstText(item, ["title", "dc:title", "atom:title", "name"]),
			firstText(item, ["pubDate", "dc:date", "date", "published", "updated", "lastBuildDate"]),
			link,
			firstText(item, ["content:encoded", "description", "summary", "dc:description", "content", "encoded"]),
			normalizeLanguage(item["dc:language"] ?? item["@_xml:lang"] ?? item.language) || feedLanguage,
		);
	}).filter((item): item is SourceItem => item !== null);
	return parsed.length > 0 ? { format: "rss2", path, language: feedLanguage, items: dedupe(parsed) } : null;
}

/* -------------------------------------------------------------------- Atom */

function atomLink(value: unknown, base?: string): string {
	const links = Array.isArray(value) ? value : [value];
	const candidates = links.filter(isObject);
	const alternate = candidates.find((l) => {
		const rel = String(l["@_rel"] ?? "alternate").toLowerCase();
		return rel === "alternate" && String(l["@_type"] ?? "text/html").includes("html");
	});
	const usable = [alternate, ...candidates.filter((l) => l !== alternate && !["self", "replies", "enclosure", "related"].includes(String(l["@_rel"] ?? "").toLowerCase()))];
	for (const candidate of usable) {
		if (!isObject(candidate)) continue;
		const href = absolute(String(candidate["@_href"] ?? textOf(candidate)), base);
		if (href) return href;
	}
	return "";
}

function parseAtom(root: JsonRecord, options: SourceParseOptions): SourceParseResult | null {
	const feed = isObject(root.feed) ? root.feed : isObject(root["atom:feed"]) ? root["atom:feed"] : root;
	const language = normalizeLanguage(feed["@_xml:lang"] ?? feed["@_lang"] ?? feed.language);
	const base = options.sourceUrl || atomLink(feed.link, options.sourceUrl);
	let entries = children(feed, "entry");
	let path = "feed.entry";
	if (entries.length === 0) {
		entries = children(root, "entry");
		path = "entry";
	}
	if (entries.length === 0) {
		entries = deepItems(root);
		path = "auto";
	}
	const parsed = entries.slice(0, MAX_ITEMS).map((entry) => {
		const id = firstText(entry, ["id", "guid"]);
		const link = atomLink(entry.link, base) || (/^https?:\/\//i.test(id) ? id : "");
		return makeItem(
			firstText(entry, ["title", "dc:title"]),
			firstText(entry, ["published", "updated", "dc:date", "date"]),
			link,
			firstText(entry, ["summary", "content", "description"]),
			normalizeLanguage(entry["@_xml:lang"] ?? entry["dc:language"] ?? entry.language) || language,
		);
	}).filter((item): item is SourceItem => item !== null);
	return parsed.length > 0 ? { format: "atom", path, language, items: dedupe(parsed) } : null;
}

/* ----------------------------------------------------------------- JSON-LD */

const ARTICLE_TYPES: Record<string, true> = {
	article: true, newsarticle: true, blogposting: true, techarticle: true,
	reportagenewsarticle: true, liveblogposting: true, scholarlyarticle: true,
	socialmediaposting: true, event: true,
};

function typeNames(value: unknown): string[] {
	if (typeof value === "string") return [value.split("/").pop()!.toLowerCase()];
	if (Array.isArray(value)) return value.flatMap(typeNames);
	return [];
}

function jsonLdNodes(value: unknown, out: JsonRecord[] = [], depth = 0): JsonRecord[] {
	if (depth > 8 || out.length >= MAX_ITEMS) return out;
	if (Array.isArray(value)) {
		for (const entry of value) jsonLdNodes(entry, out, depth + 1);
		return out;
	}
	if (!isObject(value)) return out;
	if (typeNames(value["@type"]).some((type) => ARTICLE_TYPES[type] === true)) out.push(value);
	for (const key of ["@graph", "itemListElement", "item", "mainEntity", "hasPart", "articles"]) {
		if (value[key] !== undefined) jsonLdNodes(value[key], out, depth + 1);
	}
	return out;
}

function jsonLdLink(value: unknown, base?: string): string {
	if (typeof value === "string") return absolute(value, base);
	if (Array.isArray(value)) return jsonLdLink(value[0], base);
	if (isObject(value)) return absolute(String(value["@id"] ?? value.url ?? value["@_href"] ?? ""), base);
	return "";
}

/** Objets JSON complets au début d'un script tronqué par le transport. */
function objectsInFragment(raw: string): JsonRecord[] {
	const out: JsonRecord[] = [];
	let cursor = 0;
	while (cursor < raw.length && out.length < MAX_ITEMS) {
		const start = raw.indexOf("{", cursor);
		if (start < 0) break;
		let depth = 0;
		let inString = false;
		let escaped = false;
		let end = -1;
		for (let i = start; i < raw.length; i += 1) {
			const ch = raw[i] ?? "";
			if (inString) {
				if (escaped) escaped = false;
				else if (ch === "\\") escaped = true;
				else if (ch === '"') inString = false;
				continue;
			}
			if (ch === '"') inString = true;
			else if (ch === "{") depth += 1;
			else if (ch === "}") {
				depth -= 1;
				if (depth === 0) { end = i + 1; break; }
			}
		}
		if (end < 0) { cursor = start + 1; continue; }
		try {
			const parsed: unknown = JSON.parse(raw.slice(start, end));
			if (isObject(parsed)) out.push(parsed);
		} catch { /* objet illisible : on passe au suivant */ }
		cursor = end;
	}
	return out;
}

function parseJsonLd(body: string, options: SourceParseOptions): SourceParseResult | null {
	const raws: string[] = [];
	const trimmed = body.trim();
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) raws.push(trimmed);
	for (const script of trimmed.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
		if (!/type\s*=\s*["']application\/ld\+json["']/i.test(script[1] ?? "")) continue;
		const raw = (script[2] ?? "").trim();
		if (raw) raws.push(raw);
	}
	if (raws.length === 0) return null;
	const pageLanguage = normalizeLanguage(
		/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(body)?.[1]
		?? /<meta\b[^>]*http-equiv\s*=\s*["']content-language["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(body)?.[1],
	);
	const base = options.sourceUrl || htmlMeta(body).link;
	const nodes: JsonRecord[] = [];
	for (const raw of raws) {
		try { jsonLdNodes(JSON.parse(raw) as unknown, nodes); }
		catch { for (const object of objectsInFragment(raw)) jsonLdNodes(object, nodes); }
	}
	if (nodes.length === 0) return null;
	const parsed = nodes.slice(0, MAX_ITEMS).map((node) => {
		const link = jsonLdLink(node.url ?? node["@id"] ?? node.mainEntityOfPage, base);
		return makeItem(
			firstText(node, ["headline", "name", "title"]),
			firstText(node, ["datePublished", "dateCreated", "dateModified", "uploadDate"]),
			link,
			firstText(node, ["description", "abstract", "articleBody", "summary"]),
			normalizeLanguage(node.inLanguage) || pageLanguage,
		);
	}).filter((item): item is SourceItem => item !== null);
	// Les pages d'actualité décrivent l'article en JSON-LD (titre, date, URL
	// relative) mais mettent le texte dans `<article>`. On recolle les deux
	// vues du même objet sans rien inventer : les champs viennent du document.
	if (parsed.length > 0 && /<article\b/i.test(body)) {
		const htmlItems = parseHtml(body, options)?.items ?? [];
		const byTitle = new Map(htmlItems.map((item) => [item.title.toLowerCase(), item]));
		const byLink = new Map(htmlItems.filter((item) => item.link).map((item) => [item.link, item]));
		for (const item of parsed) {
			const match = byLink.get(item.link) ?? byTitle.get(item.title.toLowerCase());
			if (!match) continue;
			if (!item.summary) item.summary = match.summary;
			if (!item.link) item.link = match.link;
		}
	}
	return parsed.length > 0 ? { format: "jsonld", path: "@graph", language: pageLanguage, items: dedupe(parsed) } : null;
}

/* --------------------------------------------------------------- HTML page */

function htmlBlocks(body: string, tag: "article" | "main"): string[] {
	const open = new RegExp(`<${tag}\\b[^>]*>`, "gi");
	const close = new RegExp(`</${tag}\\s*>`, "gi");
	const blocks: string[] = [];
	let depth = 0;
	let start = -1;
	const tokens = [...[...body.matchAll(open)].map((m) => ({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, closing: false })),
		...[...body.matchAll(close)].map((m) => ({ at: m.index ?? 0, end: (m.index ?? 0) + m[0].length, closing: true }))]
		.sort((a, b) => a.at - b.at);
	for (const token of tokens) {
		if (token.closing) {
			depth -= 1;
			if (depth === 0 && start >= 0) {
				blocks.push(body.slice(start, token.at));
				start = -1;
			}
		} else {
			if (depth === 0) start = token.end;
			depth += 1;
		}
	}
	if (start >= 0 && depth > 0) blocks.push(body.slice(start));
	return blocks;
}

function htmlMeta(body: string): HtmlMeta {
	const attr = (attrs: string, name: string): string =>
		new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(attrs)?.[1] ?? "";
	let title = "";
	let link = "";
	let date = "";
	for (const match of body.matchAll(/<(?:meta|link)\b([^>]*)>/gi)) {
		const attrs = match[1] ?? "";
		const key = /(?:\bname|\bproperty)\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase() ?? "";
		const content = attr(attrs, "content");
		if (!title && (key === "og:title" || key === "twitter:title")) title = content;
		if (!link && (/\brel\s*=\s*["']canonical["']/i.test(attrs) || key === "og:url")) link = attr(attrs, "href") || content;
		if (!date && key === "article:published_time") date = content;
	}
	if (!title) title = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(body)?.[1] ?? "";
	const language = normalizeLanguage(
		/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i.exec(body)?.[1]
		?? /<meta\b[^>]*http-equiv\s*=\s*["']content-language["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(body)?.[1],
	);
	return { title: plain(title), link: absolute(link, undefined), date: plain(date), language };
}

function htmlItem(block: string, meta: HtmlMeta, options: SourceParseOptions): SourceItem | null {
	const heading = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/i.exec(block)?.[1] ?? "";
	const title = clip(heading, MAX_TITLE) || meta.title;
	if (title.length < 10) return null;
	const blockLang = normalizeLanguage(/\blang\s*=\s*["']([^"']+)["']/i.exec(block)?.[1]);
	const time = /<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i.exec(block)?.[1]
		?? /itemprop\s*=\s*["']datePublished["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(block)?.[1]
		?? meta.date;
	let summary = "";
	for (const paragraph of block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)) {
		const candidate = plain(paragraph[1]);
		if (candidate.length >= 40) { summary = candidate; break; }
	}
	if (!summary) summary = plain(block);
	if (summary.length < 40) return null;
	const href = /<a\b[^>]*href\s*=\s*["']([^"']+)["']/i.exec(block)?.[1] ?? meta.link;
	return makeItem(title, plain(time), absolute(href, options.sourceUrl || meta.link), summary, blockLang || meta.language);
}

function parseHtml(body: string, options: SourceParseOptions): SourceParseResult | null {
	const meta = htmlMeta(body);
	const articles = htmlBlocks(body, "article")
		.map((block) => htmlItem(block, meta, options))
		.filter((item): item is SourceItem => item !== null);
	if (articles.length > 0) {
		return { format: "html", path: "article", language: meta.language, items: dedupe(articles).slice(0, MAX_ITEMS) };
	}
	const mains = htmlBlocks(body, "main")
		.map((block) => htmlItem(block, meta, options))
		.filter((item): item is SourceItem => item !== null);
	return mains.length > 0
		? { format: "html", path: "main", language: meta.language, items: dedupe(mains).slice(0, MAX_ITEMS) }
		: null;
}

/* --------------------------------------------------------------- JSON maison */

const TITLE_KEYS = ["title", "post_title", "headline", "name", "Name", "Title", "subject", "description", "summary", "text"];
const DATE_KEYS = ["date", "pubDate", "published", "published_at", "datePublished", "dateAdded", "BreachDate", "AddedDate", "discovered", "created_at", "createdAt", "timestamp", "last_seen"];
const LINK_KEYS = ["link", "url", "href", "permalink", "html_url", "source_url", "Domain", "guid", "id"];
const SUMMARY_KEYS = ["summary", "description", "Description", "abstract", "excerpt", "body", "text", "content", "message"];
const LANGUAGE_KEYS = ["language", "lang", "locale", "inLanguage", "languageCode"];

function pickPath(root: unknown, path: string): unknown {
	let node: unknown = root;
	for (const key of path.split(".")) {
		if (Array.isArray(node)) node = node[Number(key)];
		else if (isObject(node)) node = node[key];
		else return undefined;
	}
	return node;
}

/** Meilleur tableau d'objets porteurs d'un titre, toutes profondeurs confondues. */
function bestRecords(root: unknown): { records: JsonRecord[]; path: string } | null {
	let best: { records: JsonRecord[]; path: string } | null = null;
	let bestScore = 0;
	const score = (records: JsonRecord[]): number =>
		records.reduce((n, record) => n + (TITLE_KEYS.some((key) => firstText(record, [key]) !== "") ? 1 : 0), 0);
	const visit = (node: unknown, path: string, depth: number): void => {
		if (depth > 6) return;
		if (Array.isArray(node)) {
			const records = node.filter(isObject);
			if (records.length > 0) {
				const candidateScore = score(records);
				if (candidateScore > bestScore) {
					best = { records, path };
					bestScore = candidateScore;
				}
				return;
			}
			node.forEach((entry, i) => visit(entry, `${path}.${i}`, depth + 1));
			return;
		}
		if (isObject(node)) for (const [key, value] of Object.entries(node)) visit(value, path ? `${path}.${key}` : key, depth + 1);
	};
	visit(root, "", 0);
	return best !== null && bestScore > 0 ? best : null;
}

function parseCustomJson(body: string, options: SourceParseOptions): SourceParseResult | null {
	let data: unknown;
	try { data = JSON.parse(body); } catch { return null; }
	let records: JsonRecord[] = [];
	let path = "";
	if (options.itemsPath) {
		const node = pickPath(data, options.itemsPath);
		records = Array.isArray(node) ? node.filter(isObject) : isObject(node) ? [node] : [];
		path = options.itemsPath;
	}
	if (records.length === 0) {
		const found = bestRecords(data);
		if (!found) return null;
		records = found.records;
		path = found.path;
	}
	const parsed = records.slice(0, MAX_ITEMS).map((record) => {
		const link = absolute(firstText(record, LINK_KEYS), options.sourceUrl);
		return makeItem(
			firstText(record, TITLE_KEYS),
			firstText(record, DATE_KEYS),
			link,
			firstText(record, SUMMARY_KEYS),
			normalizeLanguage(firstText(record, LANGUAGE_KEYS)),
		);
	}).filter((item): item is SourceItem => item !== null);
	return parsed.length > 0 ? { format: "json", path, language: "", items: dedupe(parsed) } : null;
}

/** Détecte le format réel d'un corps, d'après son contenu avant sa déclaration. */
export function detectSourceFormat(body: string, options: SourceParseOptions = {}): SourceFormat {
	return parseSource(body, options).format;
}

/**
 * Parse un corps de source et renvoie ses items canoniques.
 * L'ordre est celui de la fiabilité : JSON-LD explicite, XML déclaré par sa
 * racine, JSON valide, puis HTML structuré. Aucun fallback « on invente un
 * item » : un corps illisible renvoie `unknown` avec zéro item.
 */
export function parseSource(body: string, options: SourceParseOptions = {}): SourceParseResult {
	const text = body.trim();
	if (!text) return { format: "unknown", path: "", language: "", items: [] };

	const jsonLd = parseJsonLd(text, options);
	if (jsonLd) return jsonLd;

	if (text.startsWith("<")) {
		let root: unknown;
		try { root = xml.parse(text) as unknown; } catch { root = undefined; }
		if (isObject(root)) {
			const atomRoot = isObject(root.feed) || isObject(root["atom:feed"]);
			if (atomRoot) {
				const atom = parseAtom(root, options);
				if (atom) return atom;
			}
			const rss = parseRss2(root, options);
			if (rss) return rss;
			if (!atomRoot) {
				const atom = parseAtom(root, options);
				if (atom) return atom;
			}
		}
	}

	const json = parseCustomJson(text, options);
	if (json) return json;

	if (/<(?:html|article|main|body)\b/i.test(text)) {
		const html = parseHtml(text, options);
		if (html) return html;
	}

	return { format: "unknown", path: "", language: "", items: [] };
}
