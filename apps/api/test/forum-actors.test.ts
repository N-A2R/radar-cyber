/**
 * One test per observable behavior of passive forum actor identification.
 * No test needs the network or any interaction with an actor.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORUM_ACTORS,
  findActorMentions,
  isFrancophoneMessage,
  summarizeActorActivity,
  type ForumMessage,
} from "../src/forums/actors.js";
import { persistForumActorMentions, readForumActorStats } from "../src/forums/actor-store.js";
import { classifyForumMessage, dedupKey, type ForumVerdict } from "../src/forums/classify.js";
import { forumSourceById } from "../src/forums/sources.js";
import { query } from "../src/db.js";

const message = (sourceId: string, title: string, extra: Partial<ForumMessage> = {}): ForumMessage => ({
  id: `${sourceId}:${title}`,
  sourceId,
  title,
  ...extra,
});

test("the actor registry contains unique public labels and no personal data", () => {
  const keys = FORUM_ACTORS.map((actor) => actor.key);
  assert.ok(FORUM_ACTORS.length >= 8);
  assert.equal(new Set(keys).size, keys.length);
  const labels = FORUM_ACTORS.flatMap((actor) => [actor.label, ...actor.aliases]).join(" ");
  assert.doesNotMatch(labels, /[\w.+-]+@[\w-]+\.[\w.-]+/);
  assert.doesNotMatch(labels, /\b(?:\+33|0)[ .-]?[1-9](?:[ .-]?\d{2}){4}\b/);
  assert.ok(FORUM_ACTORS.length >= 12);
});

test("spelling variants of one public actor produce a single key per message", () => {
  const first = findActorMentions(message("forum:zataz:bordeaux", "ZATAZ détecte une fuite"));
  const second = findActorMentions(message("forum:zataz:bordeaux", "Le service veille ZATAZ détecte une fuite"));
  assert.deepEqual(first.map((m) => m.actorKey), ["zataz"]);
  assert.deepEqual(second.map((m) => m.actorKey), ["zataz"]);
});

test("actor matching respects word boundaries and never matches a substring", () => {
  const found = findActorMentions(message("forum:zataz:poitiers", "Vitaliser la donnée publique"));
  assert.deepEqual(found, []);
});

test("a non-French message is not counted as a francophone actor", () => {
  const english = message("forum:hn:latest", "RansomHouse attacks Vitalis in Bordeaux");
  assert.equal(isFrancophoneMessage(english), false);
  assert.equal(summarizeActorActivity([english]).actorsIdentified, 0);
});

test("victim personal data produces no actor mention", () => {
  const unsafe = message(
    "forum:zataz:gironde",
    "RansomHouse vise la victime Jean Dupont, jdupont@example.fr",
  );
  assert.deepEqual(findActorMentions(unsafe), []);
});

test("a summary counts distinct actors, messages and mentions separately", () => {
  const first = message("forum:zataz:bordeaux", "ZATAZ et NoName revendiquent une attaque contre une commune");
  const second = message("forum:zataz:poitiers", "NoName revendique une attaque");
  const summary = summarizeActorActivity([first, second]);
  assert.equal(summary.actorsIdentified, 2);
  assert.equal(summary.messagesWithActors, 2);
  assert.equal(summary.mentions, 3);
  assert.equal(summary.byActor.find((row) => row.key === "noname")?.messages, 2);
});

test("a tracked actor absent from the messages is not identified", () => {
  const summary = summarizeActorActivity([
    message("forum:zataz:bordeaux", "ZATAZ analyse une fuite de données en Gironde"),
  ]);
  assert.equal(summary.actorsIdentified, 1);
  assert.deepEqual(summary.byActor.map((row) => row.key), ["zataz"]);
});

test("activity reports the first and last public observation and source breadth", () => {
  const messages = [
    message("forum:zataz:bordeaux", "RansomHouse publie une fuite", {
      observedAt: "Sun, 11 Oct 2026 13:40:26 +0000",
    }),
    message("forum:zataz:poitiers", "RansomHouse publie une analyse de la fuite de données", {
      observedAt: "Wed, 18 Mar 2026 19:02:23 +0000",
    }),
  ];
  const row = summarizeActorActivity(messages).byActor.find((item) => item.key === "ransomhouse");
  assert.equal(row?.messages, 2);
  assert.equal(row?.sources, 2);
  assert.equal(row?.firstSeen, "2026-03-18");
  assert.equal(row?.lastSeen, "2026-10-11");
  assert.equal(row?.activeDays, 208);
});

test("stored actor mentions are idempotent and feed the public aggregate", async () => {
  const source = forumSourceById("forum:zataz:bordeaux");
  assert.ok(source);
  const admitted = message("forum:zataz:bordeaux", "ZATAZ et NoName révèlent une cyberattaque", {
    summary: "Analyse publique d'une fuite de données en Gironde",
    url: "https://example.invalid/forum-actors-test",
    observedAt: "2026-11-20T10:00:00Z",
  });
  const verdict: ForumVerdict = classifyForumMessage(admitted, source);
  assert.equal(verdict.relevant, true);
  await query("DELETE FROM forum_actor_mention WHERE message_key = $1", [verdict.dedupKey]);
  const before = await readForumActorStats();
  const collection = { verdicts: [verdict], messages: [admitted], admitted: [admitted], summary: {
    followedForums: 1, relevantMessages: 1,
    rejected: { relevant: 0, empty: 0, "personal-data": 0, "outside-na": 0, "no-cyber-signal": 0 },
  }, errors: [] };
  assert.equal(await persistForumActorMentions(collection), 2);
  assert.equal(await persistForumActorMentions(collection), 0);
  const after = await readForumActorStats();
  assert.equal(after.mentions, before.mentions + 2);
  assert.equal(after.actorsIdentified, before.actorsIdentified + 2);
  const rows = await query<{ actor_key: string }>(
    "SELECT actor_key FROM forum_actor_mention WHERE message_key = $1 ORDER BY actor_key",
    [dedupKey(admitted)],
  );
  assert.deepEqual(rows.rows.map((row) => row.actor_key), ["noname", "zataz"]);
});
