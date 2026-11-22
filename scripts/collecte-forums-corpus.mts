/**
 * Capture a frozen corpus from the registered public forum feeds.
 *
 * The corpus is versioned so `pnpm mesure:forums` is offline, deterministic
 * and fast. Author names are never stored: only title, body excerpt, URL and
 * timestamp of public messages.
 *
 *   pnpm forums:corpus
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchForumFeed } from "../apps/api/src/forums/collect.js";
import { FORUM_SOURCES } from "../apps/api/src/forums/sources.js";

const OUT = fileURLToPath(new URL("../bench/forums/corpus.json", import.meta.url));
const items: unknown[] = [];
const errors: string[] = [];

for (const source of FORUM_SOURCES) {
  try {
    const messages = await fetchForumFeed(source, globalThis.fetch, 8000);
    for (const message of messages) {
      items.push({
        id: message.id,
        sourceId: message.sourceId,
        title: message.title,
        summary: message.summary ?? null,
        url: message.url ?? null,
        observedAt: message.observedAt ?? null,
      });
    }
    console.error(`${source.id}: ${messages.length} message(s)`);
  } catch (error) {
    errors.push(`${source.id}: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`${source.id}: skipped (${errors.at(-1)})`);
  }
}

mkdirSync(fileURLToPath(new URL("../bench/forums/", import.meta.url)), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({
  meta: {
    capturedAt: new Date().toISOString(),
    command: "pnpm forums:corpus",
    sources: FORUM_SOURCES.map((s) => ({ id: s.id, url: s.url, scope: s.scope.kind })),
    errors,
  },
  items,
}, null, 2)}\n`);
console.error(`corpus written: ${OUT} (${items.length} messages)`);
