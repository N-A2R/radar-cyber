#!/usr/bin/env -S npx tsx
/**
 * Harvest a frozen corpus of real audio/video items from the NA radio and TV
 * sources already present in the referential. Network calls are bounded; the
 * measurement itself never uses the network.
 *
 *   DATABASE_URL=postgres://radar:radar@localhost:5433/radar \
 *     tsx scripts/harvest-media-items.mts --out=bench/audio-video/items.json
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
	containsVictimData, mediaTypeFromMime, parseMediaFeed, stableId, withPublisherMedia,
	type MediaItem,
} from "../apps/api/src/media/transcription.js";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const pg = require("pg") as typeof import("pg");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_URL = "postgres://radar:radar@localhost:5433/radar";
const FETCH_TIMEOUT = 8000;
const MAX_ARTICLES_PER_FEED = 12;

interface CorpusSource {
	id: string;
	url: string;
	dept: string;
}

function stripTags(value: string): string {
	return value.replace(/<[^>]+>/g, " ").replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, " ")
		.replace(/\s+/g, " ").trim();
}

function articleText(html: string): string {
	const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
		.map((match) => stripTags(match[1] ?? ""))
		.filter((text) => text.length >= 60);
	return paragraphs.slice(0, 6).join(" ").slice(0, 4000);
}

function mediaUrlFromHtml(html: string): { url: string; type: "audio" | "video" } | null {
	const match = html.match(/https?:\\?\/\\?\/[^"'\\ ]+?\.(?:mp3|m4a|mp4|ogg)(?:\?[^"'\\ ]*)?/i);
	if (!match) return null;
	const url = match[0].replace(/\\\//g, "/");
	const type = mediaTypeFromMime(url.endsWith(".mp4") ? "video/mp4" : "audio/mpeg");
	return type ? { url, type } : null;
}

async function fetchText(url: string): Promise<string> {
	const response = await fetch(url, {
		signal: AbortSignal.timeout(FETCH_TIMEOUT),
		headers: { "user-agent": "radar-cyber-media-watch/1.0" },
	});
	if (!response.ok) throw new Error(`${response.status} ${url}`);
	return response.text();
}

async function departmentMap(): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	const dir = new URL("bench/corpus/", `file://${ROOT}`);
	for (const file of (await readdir(dir)).filter((f) => f.startsWith("sources-") && f.endsWith(".jsonl"))) {
		const content = await readFile(new URL(file, dir), "utf8");
		for (const line of content.split("\n")) {
			if (!line.trim()) continue;
			try {
				const row = JSON.parse(line) as { url_flux?: string; departement?: string };
				if (row.url_flux && /^\d{2}$/.test(row.departement ?? "")) map.set(row.url_flux, row.departement!);
			} catch { /* ignore malformed corpus lines */ }
		}
	}
	return map;
}

async function main(): Promise<void> {
	const url = process.env.DATABASE_URL ?? DEFAULT_URL;
	const client = new pg.Client({ connectionString: url });
	await client.connect();
	let sources: CorpusSource[] = [];
	let baseline: Record<string, number> = {};
	try {
		const [media, counts] = await Promise.all([
			client.query<{ id: string; url: string }>(`
				SELECT id, url FROM source
				WHERE enabled AND url <> ''
				  AND (family IN ('radio','tv') OR id LIKE 'corpus:%radio%' OR id LIKE 'corpus:%tv%')
				ORDER BY id`),
			client.query<{ org: string; source: string; event: string }>(`
				SELECT (SELECT count(*) FROM org)::text AS org,
				       (SELECT count(*) FROM source)::text AS source,
				       (SELECT count(*) FROM event)::text AS event`),
		]);
		const depts = await departmentMap();
		sources = media.rows
			.map((row) => ({ ...row, dept: depts.get(row.url) ?? "" }))
			.filter((row) => /^\d{2}$/.test(row.dept));
		const row = counts.rows[0];
		baseline = { organisations: Number(row.org), sources: Number(row.source), events: Number(row.event) };
	} finally {
		await client.end();
	}

	const items: MediaItem[] = [];
	const seen = new Set<string>();
	for (const source of sources) {
		let xml = "";
		try { xml = await fetchText(source.url); } catch { continue; }
		for (const item of parseMediaFeed(xml, source)) {
			if (seen.has(item.id) || containsVictimData(`${item.title} ${item.caption}`)) continue;
			seen.add(item.id);
			items.push(item);
		}

		// Most local outlets publish only an image enclosure in RSS, while the
		// article page exposes the broadcast file and its publisher text.
		const links = [...xml.matchAll(/<item[\s\S]*?<link>(https?:[^<]+)<\/link>/g)]
			.map((match) => match[1].replace(/&amp;/g, "&"))
			.slice(0, MAX_ARTICLES_PER_FEED);
		for (const link of links) {
			let html = "";
			try { html = await fetchText(link); } catch { continue; }
			const media = mediaUrlFromHtml(html);
			const caption = articleText(html);
			if (!media || !caption) continue;
			const base: MediaItem = {
				id: stableId(source.id, link), sourceId: source.id, dept: source.dept,
				mediaUrl: link, mediaType: media.type, method: "publisher-caption",
				title: link, caption, pageUrl: link, publishedAt: "",
			};
			const item = withPublisherMedia(base, media.url, media.type, caption);
			if (!item || seen.has(item.id) || containsVictimData(`${item.title} ${item.caption}`)) continue;
			seen.add(item.id);
			items.push(item);
		}
	}

	items.sort((a, b) => a.id.localeCompare(b.id));
	const digest = createHash("sha256").update(JSON.stringify(items)).digest("hex");
	const outArg = process.argv.find((a) => a.startsWith("--out="));
	const out = outArg ? outArg.slice(6) : "bench/audio-video/items.json";
	await mkdir(new URL("bench/audio-video/", `file://${ROOT}`), { recursive: true });
	await writeFile(new URL(out, `file://${ROOT}`), `${JSON.stringify({
		meta: {
			generatedAt: new Date().toISOString(),
			baseline,
			mediaSources: sources.length,
			items: items.length,
			sha256: digest,
			note: "Caption text is publisher-provided; no acoustic recognition is performed.",
		},
		items,
	}, null, 2)}\n`);
	console.log(`sources: ${sources.length}, items: ${items.length}, sha256: ${digest}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
