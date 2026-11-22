/**
 * One test per observable behavior of the public-forum watcher.
 * No test needs the network: feeds are injected as plain strings.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyForumMessage,
  summarizeForumVerdicts,
  type ForumMessage,
} from "../src/forums/classify.js";
import { collectForums, parseForumFeed, persistForumMessages, readForumStats } from "../src/forums/collect.js";
import { FORUM_SOURCES, forumSourceById, isPublicFreeForum, NA_SCOPES } from "../src/forums/sources.js";
import { query } from "../src/db.js";

const message = (sourceId: string, title: string, extra: Partial<ForumMessage> = {}): ForumMessage => ({
  id: `${sourceId}:${title}`,
  sourceId,
  title,
  ...extra,
});

const source = (id: string) => {
  const found = forumSourceById(id);
  assert.ok(found, `source ${id} must exist`);
  return found;
};

test("registry contains only free public forums with an explicit NA scope", () => {
  assert.equal(FORUM_SOURCES.length, 6);
  assert.ok(FORUM_SOURCES.every(isPublicFreeForum));
  const scoped = FORUM_SOURCES.filter((s) => s.scope.kind === "department");
  assert.deepEqual(scoped.map((s) => s.scope), NA_SCOPES.map((value) => ({ kind: "department", value })));
  assert.ok(FORUM_SOURCES.every((s) => !/author|victim|email/i.test(s.url)));
});

test("an NA-scoped discussion feed admits a cyber message without a department name", () => {
  const verdict = classifyForumMessage(
    message("forum:hn:bordeaux", "New ransomware campaign discussed by local admins"),
    source("forum:hn:bordeaux"),
  );
  assert.equal(verdict.relevant, true);
  assert.equal(verdict.reason, "relevant");
  assert.equal(verdict.place, "bordeaux");
});

test("a global forum rejects a cyber message with no Nouvelle-Aquitaine evidence", () => {
  const verdict = classifyForumMessage(
    message("forum:hn:latest", "Ransomware hits a hospital in Ohio"),
    source("forum:hn:latest"),
  );
  assert.equal(verdict.relevant, false);
  assert.equal(verdict.reason, "outside-na");
});

test("a global forum admits a cyber message naming an NA department", () => {
  const verdict = classifyForumMessage(
    message("forum:hn:latest", "Phishing cible une commune de la Gironde"),
    source("forum:hn:latest"),
  );
  assert.equal(verdict.relevant, true);
  assert.equal(verdict.place, "gironde");
});

test("a non-cyber message from a scoped forum is rejected", () => {
  const verdict = classifyForumMessage(
    message("forum:hn:bordeaux", "Fête du vin à Bordeaux : programme 2026"),
    source("forum:hn:bordeaux"),
  );
  assert.equal(verdict.relevant, false);
  assert.equal(verdict.reason, "no-cyber-signal");
});

test("a message carrying victim personal data is rejected before scoring", () => {
  const verdict = classifyForumMessage(
    message(
      "forum:hn:gironde",
      "Ransomware en Gironde — victime Jean Dupont, jdupont@example.fr, 06 12 34 56 78",
    ),
    source("forum:hn:gironde"),
  );
  assert.equal(verdict.relevant, false);
  assert.equal(verdict.reason, "personal-data");
  assert.equal(verdict.score, 0);
});

test("RSS and public search API payloads parse into forum messages", () => {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>f</title><item>` +
    `<title>Phishing en Gironde</title><link>https://example.invalid/a</link>` +
    `<description>Détails</description><pubDate>Thu, 20 Nov 2026 10:00:00 GMT</pubDate>` +
    `</item></channel></rss>`;
  const rssMessages = parseForumFeed(source("forum:hn:latest"), rss);
  assert.equal(rssMessages.length, 1);
  assert.equal(rssMessages[0]?.title, "Phishing en Gironde");
  assert.equal(rssMessages[0]?.url, "https://example.invalid/a");

  const json = JSON.stringify({ hits: [{ objectID: "42", title: "Cyber at Bordeaux", story_text: " intrusion ", created_at: "2026-11-20T10:00:00Z" }] });
  const jsonMessages = parseForumFeed(source("forum:hn:bordeaux"), json);
  assert.equal(jsonMessages.length, 1);
  assert.equal(jsonMessages[0]?.id, "42");
  assert.match(jsonMessages[0]?.url ?? "", /item\?id=42/);
});

test("a dead forum isolates its error and repeated messages are counted once", async () => {
  const payload = JSON.stringify({
    hits: [
      { objectID: "1", title: "Ransomware campaign in Bordeaux", story_text: "analysis", url: "https://example.invalid/same", created_at: "2026-11-20T10:00:00Z" },
      { objectID: "2", title: "Ransomware campaign in Bordeaux", story_text: "analysis", url: "https://example.invalid/same", created_at: "2026-11-20T10:00:00Z" },
    ],
  });
  const fetchImpl = (async (url: unknown) => {
    if (String(url).includes("gironde")) throw new Error("offline");
    return new Response(payload, { status: 200 });
  }) as unknown as typeof fetch;
  const collection = await collectForums({
    sources: [source("forum:hn:bordeaux"), source("forum:hn:gironde")],
    fetchImpl,
  });
  assert.equal(collection.summary.followedForums, 1);
  assert.equal(collection.summary.relevantMessages, 1);
  assert.equal(collection.messages.length, 1);
  assert.equal(collection.errors.length, 1);
  assert.match(collection.errors[0] ?? "", /gironde/);
  const repeated = summarizeForumVerdicts([...collection.verdicts, ...collection.verdicts]);
  assert.equal(repeated.relevantMessages, 2, "the summary counts verdicts, not deduped messages");
});

test("the API counts registered forum sources and admitted messages from the database", async () => {
  const before = await readForumStats();
  assert.equal(before.followedForums, 6);
  const collection = await collectForums({
    sources: [source("forum:hn:bordeaux")],
    fetchImpl: (async () => new Response(JSON.stringify({
      hits: [{ objectID: "db-test", title: "Ransomware campaign in Bordeaux", story_text: "intrusion", created_at: "2026-11-20T10:00:00Z" }],
    }), { status: 200 })) as unknown as typeof fetch,
  });
  const inserted = await persistForumMessages(collection);
  assert.equal(inserted, 1);
  const again = await persistForumMessages(collection);
  assert.equal(again, 0, "a second pass must not double the counter");
  const after = await readForumStats();
  assert.equal(after.relevantMessages, before.relevantMessages + 1);
  const key = collection.verdicts.find((v) => v.relevant)?.dedupKey ?? "";
  const rows = await query<{ title: string }>("SELECT title FROM event WHERE dedup_key = $1", [key]);
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0]?.title, "Ransomware campaign in Bordeaux");
});
