/**
 * Audio/video watch — deterministic transcription pipeline.
 *
 * The radar already monitors the written web. This module extends the watch to
 * radio and television items published by Nouvelle-Aquitaine outlets. It turns
 * a media item into a transcription record from the text the publisher ships
 * with the audio/video file (caption, episode description, article text).
 * There is no acoustic model and no paid service: the transcription method is
 * always reported, and the raw text is never persisted.
 */
import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { evaluatePertinence } from "../collectors/pertinence.js";
import { NA_DEPARTMENTS } from "../filiation/siret.js";

export type MediaType = "audio" | "video";
export type TranscriptionMethod = "enclosure-caption" | "publisher-caption";

export interface MediaSourceRef {
	id: string;
	dept: string;
}

export interface MediaItem {
	id: string;
	sourceId: string;
	dept: string;
	mediaType: MediaType;
	mediaUrl: string;
	method: TranscriptionMethod;
	title: string;
	caption: string;
	pageUrl: string;
	publishedAt: string;
}

export interface Transcription {
	id: string;
	sourceId: string;
	dept: string;
	mediaUrl: string;
	mediaType: MediaType;
	method: TranscriptionMethod;
	textSha256: string;
	textLength: number;
	wordCount: number;
	language: "fr" | "unknown";
	relevant: boolean;
	score: number;
	reason: string;
	evidence: {
		pageUrl: string;
		publishedAt: string;
		method: TranscriptionMethod;
		rule: string;
	};
}

export interface ProcessingResult {
	processed: number;
	relevant: number;
	blocked: number;
	outsideNa: number;
	transcriptions: Transcription[];
}

const MIN_CAPTION_LENGTH = 40;
const MIN_RELEVANCE_SCORE = 2;
const NA_SET: ReadonlySet<string> = new Set(Object.keys(NA_DEPARTMENTS));
const FRENCH_MARKERS = [" le ", " la ", " des ", " une ", " pour ", " dans ", " est ", " avec "];

/** Only the twelve Nouvelle-Aquitaine departments are in scope. */
export function isNaDepartment(dept: string | null | undefined): boolean {
	return typeof dept === "string" && NA_SET.has(dept.trim());
}

/** Images, manifests and documents are not media items. */
export function mediaTypeFromMime(mime: string | null | undefined): MediaType | null {
	if (typeof mime !== "string") return null;
	const normalised = mime.trim().toLowerCase().split(";")[0] ?? "";
	if (normalised.startsWith("audio/")) return "audio";
	if (normalised.startsWith("video/")) return "video";
	return null;
}

export function stableId(sourceId: string, mediaUrl: string): string {
	return createHash("sha256").update(`${sourceId}|${mediaUrl}`).digest("hex").slice(0, 24);
}

export function textHash(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function textNode(value: unknown): string {
	if (typeof value === "string" || typeof value === "number") return String(value);
	if (value && typeof value === "object" && "#text" in value) {
		return String((value as Record<string, unknown>)["#text"] ?? "");
	}
	return "";
}

function stripHtml(value: string): string {
	return value
		.replace(/<[^>]+>/g, " ")
		.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function firstText(value: unknown): string {
	return Array.isArray(value) ? textNode(value[0]) : textNode(value);
}

interface RawEnclosure {
	"@_url"?: string;
	"@_type"?: string;
	url?: string;
	type?: string;
}

/**
 * Parse a radio/TV RSS feed. Only items carrying a real audio/video enclosure
 * and a department in Nouvelle-Aquitaine become media items.
 */
export function parseMediaFeed(xml: string, source: MediaSourceRef): MediaItem[] {
	if (!isNaDepartment(source.dept)) return [];
	const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" })
		.parse(xml) as Record<string, any>;
	const channel = parsed?.rss?.channel ?? parsed?.feed ?? {};
	const raw = channel?.item ?? channel?.entry ?? [];
	const entries: Record<string, any>[] = Array.isArray(raw) ? raw : [raw];
	const items: MediaItem[] = [];

	for (const entry of entries) {
		if (!entry || typeof entry !== "object") continue;
		const enclosures: RawEnclosure[] = Array.isArray(entry.enclosure) ? entry.enclosure : [entry.enclosure ?? entry["media:content"]];
		let mediaUrl = "";
		let mediaType: MediaType | null = null;
		for (const candidate of enclosures) {
			if (!candidate || typeof candidate !== "object") continue;
			const url = String(candidate["@_url"] ?? candidate.url ?? "");
			const mime = String(candidate["@_type"] ?? candidate.type ?? "");
			const detected = mediaTypeFromMime(mime);
			if (url && detected) {
				mediaUrl = url;
				mediaType = detected;
				break;
			}
		}
		if (!mediaUrl || !mediaType) continue;

		const title = stripHtml(firstText(entry.title));
		const description = stripHtml(firstText(entry.description) ?? firstText(entry["content:encoded"]) ?? firstText(entry.summary));
		const caption = description.length >= MIN_CAPTION_LENGTH ? description : "";
		if (!title || !caption) continue;

		const link = firstText(entry.link);
		const pageUrl = typeof link === "string" && link.startsWith("http") ? link : mediaUrl;
		items.push({
			id: stableId(source.id, mediaUrl),
			sourceId: source.id,
			dept: source.dept.trim(),
			mediaUrl,
			mediaType,
			method: "enclosure-caption",
			title,
			caption,
			pageUrl: pageUrl.replace(/&amp;/g, "&"),
			publishedAt: firstText(entry.pubDate ?? entry.published ?? entry.updated),
		});
	}
	return items;
}

/** Add a publisher media URL to an item discovered on an article page. */
export function withPublisherMedia(item: MediaItem, mediaUrl: string, mediaType: MediaType, caption: string): MediaItem | null {
	if (!mediaUrl || !mediaType) return null;
	if (stripHtml(caption).length < MIN_CAPTION_LENGTH) return null;
	return {
		...item,
		id: stableId(item.sourceId, mediaUrl),
		mediaUrl,
		mediaType,
		method: "publisher-caption",
		caption: stripHtml(caption).slice(0, 4000),
	};
}

/**
 * Refuse anything that could carry victim personal data. Organisational
 * victims ("victime d'une cyberattaque") stay in scope; personal harm does not.
 */
const PERSONAL_HARM = [
	/violences? conjugales?/i,
	/agression sexuelle/i,
	/harc[eè]lement sexuel/i,
	/conjointe.{0,60}bless/i,
	/mineur(e)? .*(agress|viol|disparu)/i,
	/\b\d{1,2}[ .-]\d{2}[ .-]\d{2}[ .-]\d{2}[ .-]\d{2}\b/,
	/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i,
];

export function containsVictimData(text: string): boolean {
	return PERSONAL_HARM.some((pattern) => pattern.test(text));
}

function detectLanguage(text: string): "fr" | "unknown" {
	const lower = ` ${text.toLowerCase()} `;
	const hits = FRENCH_MARKERS.filter((marker) => lower.includes(marker)).length;
	return hits >= 2 ? "fr" : "unknown";
}

function departmentMentioned(text: string, dept: string): boolean {
	const names: Record<string, string[]> = {
		"16": ["charente"], "17": ["charente-maritime"], "19": ["corr[eè]ze"],
		"23": ["creuse"], "24": ["dordogne"], "33": ["gironde", "bordeaux"],
		"40": ["landes"], "47": ["lot-et-garonne"], "64": ["pyr[eé]n[eé]es-atlantiques"],
		"79": ["deux-s[eè]vres"], "86": ["vienne", "poitiers"], "87": ["haute-vienne", "limoges"],
	};
	return (names[dept] ?? []).some((name) => new RegExp(`\\b${name}\\b`, "i").test(text));
}

/** Build a transcription record. The publisher text is hashed, never stored. */
export function transcribe(item: MediaItem): Transcription {
	const text = `${item.title}. ${item.caption}`;
	const input = { title: item.title, summary: item.caption, url: item.pageUrl };
	const cyber = evaluatePertinence(input);
	const verdict = evaluatePertinence(input, { department: departmentMentioned(text, item.dept) });
	const signal = cyber.score >= MIN_RELEVANCE_SCORE ? "keyword" : verdict.reason;
	const method = item.method;
	return {
		id: item.id,
		sourceId: item.sourceId,
		dept: item.dept,
		mediaUrl: item.mediaUrl,
		mediaType: item.mediaType,
		method,
		textSha256: textHash(text),
		textLength: text.length,
		wordCount: text.split(/\s+/).filter(Boolean).length,
		language: detectLanguage(text),
		relevant: verdict.relevant && verdict.score >= MIN_RELEVANCE_SCORE,
		score: verdict.score,
		reason: signal,
		evidence: {
			pageUrl: item.pageUrl,
			publishedAt: item.publishedAt,
			method,
			rule: signal,
		},
	};
}

/** Stage 4: screen, transcribe and count in one deterministic pass. */
export function processMediaItems(items: readonly MediaItem[]): ProcessingResult {
	const result: ProcessingResult = { processed: 0, relevant: 0, blocked: 0, outsideNa: 0, transcriptions: [] };
	const seen = new Set<string>();
	for (const item of items) {
		if (!isNaDepartment(item.dept)) {
			result.outsideNa++;
			continue;
		}
		if (containsVictimData(`${item.title} ${item.caption}`)) {
			result.blocked++;
			continue;
		}
		if (seen.has(item.id)) continue;
		seen.add(item.id);
		const record = transcribe(item);
		result.transcriptions.push(record);
		result.processed++;
		if (record.relevant) result.relevant++;
	}
	return result;
}
