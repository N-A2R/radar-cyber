/** Audio/video watch — one test per observable behaviour. */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { closePools, query } from "../src/db.js";
import {
	containsVictimData, mediaTypeFromMime, parseMediaFeed, processMediaItems,
	transcribe, withPublisherMedia, type MediaItem,
} from "../src/media/transcription.js";
import { applyTranscriptions, countTranscriptions } from "../src/media/store.js";
import Fastify from "fastify";
import mediaTranscriptionsRoute from "../src/routes/media-transcriptions.js";

const feed = (enclosure: string, title: string, description: string): string => `<?xml version="1.0"?>
<rss version="2.0"><channel><title>ICI Landes</title>
<item><title>${title}</title><link>https://www.ici.fr/landes/article</link>
<description>${description}</description>
${enclosure}<pubDate>Sat, 21 Nov 2026 20:00:00 +0100</pubDate></item>
</channel></rss>`;

const audio = '<enclosure url="https://media.example.fr/episode.mp3" type="audio/mpeg" length="1000"/>';
const description = "Une cyberattaque a touché une association des Landes. Les adhérents ont été prévenus par la fédération.";

const item = (overrides: Partial<MediaItem> = {}): MediaItem => ({
	id: `item-${Math.random().toString(36).slice(2)}`,
	sourceId: "corpus:ici-landes",
	dept: "40",
	mediaUrl: "https://media.example.fr/episode.mp3",
	mediaType: "audio",
	method: "enclosure-caption",
	title: "Cyberattaque contre une association des Landes",
	caption: description,
	pageUrl: "https://www.ici.fr/landes/article",
	publishedAt: "2026-11-21T20:00:00Z",
	...overrides,
});

after(async () => {
	await closePools().catch(() => {});
});

test("an audio enclosure from an NA radio feed becomes a media item", () => {
	const items = parseMediaFeed(feed(audio, "Cyberattaque dans les Landes", description), { id: "corpus:ici-landes", dept: "40" });
	assert.equal(items.length, 1);
	assert.equal(items[0].mediaType, "audio");
	assert.equal(items[0].dept, "40");
	assert.equal(items[0].method, "enclosure-caption");
	assert.match(items[0].mediaUrl, /\.mp3$/);
});

test("images, short captions and sources outside Nouvelle-Aquitaine are ignored", () => {
	const image = '<enclosure url="https://img.example.fr/photo.jpg" type="image/jpeg" length="10"/>';
	assert.equal(mediaTypeFromMime("image/jpeg"), null);
	assert.deepEqual(parseMediaFeed(feed(image, "Photo", description), { id: "x", dept: "40" }), []);
	assert.deepEqual(parseMediaFeed(feed(audio, "Trop court", "court"), { id: "x", dept: "40" }), []);
	assert.deepEqual(parseMediaFeed(feed(audio, "Paris", description), { id: "x", dept: "75" }), []);
});

test("a publisher media URL found on an article keeps its caption method", () => {
	const [base] = parseMediaFeed(feed(audio, "Podcast local", description), { id: "corpus:ici-landes", dept: "40" });
	const updated = withPublisherMedia(base, "https://media.radiofrance.fr/itema.mp3", "audio", "Transcription publiée par la radio locale");
	assert.equal(updated?.method, "publisher-caption");
	assert.notEqual(updated?.id, base.id);
	assert.equal(updated?.caption, "Transcription publiée par la radio locale");
});

test("victim personal data blocks processing", () => {
	assert.equal(containsVictimData("Un homme a violenté sa conjointe à Biscarrosse, blessée au visage."), true);
	assert.equal(containsVictimData("Une cyberattaque a touché la fédération des Landes."), false);
	const result = processMediaItems([item({ title: "Violence conjugale à Mont-de-Marsan", caption: "La conjointe blessée au visage a été prise en charge." })]);
	assert.deepEqual([result.processed, result.blocked, result.relevant], [0, 1, 0]);
});

test("a cyber item is marked relevant and a music item is not", () => {
	const cyber = processMediaItems([item()]);
	const music = processMediaItems([item({ title: "Festival de musique à Bordeaux", caption: "Le groupe local joue ce soir à la salle des fêtes de la ville." })]);
	assert.equal(cyber.relevant, 1);
	assert.equal(cyber.transcriptions[0].score >= 2, true);
	assert.equal(cyber.transcriptions[0].reason, "keyword");
	const regional = processMediaItems([item({
		title: "Balade dans les Landes",
		caption: "Une balade entre habitants et associations des Landes, diffusée ce matin à Mont-de-Marsan.",
	})]);
	assert.deepEqual([regional.relevant, regional.transcriptions[0].reason], [1, "dept"]);
	assert.equal(music.relevant, 0);
	assert.equal(music.transcriptions[0].score, 0);
});

test("a transcription stores a hash and no raw publisher text", () => {
	const record = transcribe(item({ caption: "Cyberattaque à Bordeaux, contact: jean.dupont@example.fr" }));
	assert.match(record.textSha256, /^[0-9a-f]{64}$/);
	assert.equal(record.wordCount > 0, true);
	assert.equal(JSON.stringify(record).includes("jean.dupont"), false);
	assert.equal(JSON.stringify(record).includes("Cyberattaque à Bordeaux"), false);
});

test("duplicate and non-NA items are counted once or excluded", () => {
	const repeated = item({ id: "same" });
	const result = processMediaItems([repeated, repeated, item({ id: "same" }), item({ id: "outside", dept: "75" })]);
	assert.deepEqual([result.processed, result.outsideNa, result.relevant], [1, 1, 1]);
});

test("transcription records persist idempotently and are counted with NA scoping", async () => {
	const records = [item({ id: `persist-${Date.now()}` }), item({ id: `persist2-${Date.now()}`, dept: "33" })].map(transcribe);
	const first = await applyTranscriptions(records);
	const second = await applyTranscriptions(records);
	try {
		assert.deepEqual([first, second], [2, 0]);
		const counts = await countTranscriptions();
		assert.equal(counts.total >= 2, true);
		assert.equal(counts.byDept["40"] >= 1, true);
		assert.equal(counts.byDept["33"] >= 1, true);
		const stored = await query<{ text: string | null; caption: string | null }>(
			"SELECT text_sha256::text AS text, evidence::text AS caption FROM media_transcription WHERE id = $1", [records[0].id]);
		assert.equal(stored.rows[0].text?.length, 64);
		assert.equal(stored.rows[0].caption?.includes("contact"), false);
	} finally {
		await query("DELETE FROM media_transcription WHERE id = ANY($1::text[])", [records.map((r) => r.id)]);
	}
});

test("the public route reports counts without exposing transcript text", async () => {
	const record = transcribe(item({ id: `route-${Date.now()}` }));
	await applyTranscriptions([record]);
	const app = Fastify({ logger: false });
	await app.register(mediaTranscriptionsRoute, { prefix: "/api" });
	try {
		const response = await app.inject({ method: "GET", url: "/api/media/transcriptions" });
		assert.equal(response.statusCode, 200);
		const body = response.json() as { total: number; relevant: number };
		assert.equal(body.total, 1);
		assert.equal(typeof body.relevant, "number");
		assert.equal(response.body.includes("Les adhérents"), false);
		assert.equal(response.body.includes("jean.dupont"), false);
	} finally {
		await app.close();
		await query("DELETE FROM media_transcription WHERE id = $1", [record.id]);
	}
});
