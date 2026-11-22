/**
 * Passive identification of public cyber actors on Nouvelle-Aquitaine forums.
 *
 * An actor is a named public entity observed as acting in an admitted,
 * French-language forum message: a threat group, a public body, a company or
 * a security community. Author names are never ingested and victims are never
 * described: only public actor labels, message keys and timestamps are used.
 * Nothing here contacts a forum, a group or a person.
 */
import { languageVerdict } from "../collectors/filter.js";
import { containsVictimPersonalData, dedupKey, type ForumMessage } from "./classify.js";

export type ForumActorKind = "threat-group" | "public-body" | "company" | "community";

export type ForumActor = {
  key: string;
  label: string;
  kind: ForumActorKind;
  aliases: readonly string[];
};

export type ActorMention = {
  actorKey: string;
  label: string;
  kind: ForumActorKind;
  messageKey: string;
  sourceId: string;
  observedAt: string | null;
};

export type ActorActivity = {
  key: string;
  label: string;
  kind: ForumActorKind;
  messages: number;
  sources: number;
  firstSeen: string | null;
  lastSeen: string | null;
  activeDays: number;
};

export type ActorActivitySummary = {
  actorsIdentified: number;
  mentions: number;
  messagesWithActors: number;
  byActor: readonly ActorActivity[];
};

/** Public actors tracked in the NA cyber ecosystem; only mentioned ones are counted. */
export const FORUM_ACTORS: readonly ForumActor[] = [
  { key: "zataz", label: "ZATAZ", kind: "community", aliases: ["zataz"] },
  { key: "noname", label: "NoName", kind: "threat-group", aliases: ["noname", "no name"] },
  { key: "ransomhouse", label: "RansomHouse", kind: "threat-group", aliases: ["ransomhouse"] },
  { key: "thedestroyer", label: "TheDestroyer", kind: "threat-group", aliases: ["thedestroyer"] },
  {
    key: "gendarmerie-nationale",
    label: "Gendarmerie Nationale",
    kind: "public-body",
    aliases: ["gendarmerie nationale", "gendarmerie"],
  },
  { key: "police-judiciaire", label: "Police Judiciaire", kind: "public-body", aliases: ["police judiciaire"] },
  { key: "vitalis", label: "Vitalis", kind: "company", aliases: ["vitalis"] },
  { key: "sante-publique-france", label: "Santé publique France", kind: "public-body", aliases: ["sante publique france"] },
  { key: "education-nationale", label: "Éducation Nationale", kind: "public-body", aliases: ["education nationale"] },
  { key: "anssi", label: "ANSSI", kind: "public-body", aliases: ["anssi"] },
  { key: "ovhcloud", label: "OVHcloud", kind: "company", aliases: ["ovhcloud"] },
  { key: "lockbit", label: "LockBit", kind: "threat-group", aliases: ["lockbit"] },
];

const normalize = (value: string): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&#(?:x27|39);|&#8217;|&#039;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A French-language message is required for an actor to count as francophone. */
export function isFrancophoneMessage(message: ForumMessage): boolean {
  return languageVerdict(message.title, message.summary ?? null).language === "fr";
}

/** Distinct public actors explicitly named in one message; never an author. */
export function findActorMentions(message: ForumMessage): readonly ActorMention[] {
  if (containsVictimPersonalData(`${message.title} ${message.summary ?? ""}`)) return [];
  const text = normalize(`${message.title} ${message.summary ?? ""}`);
  const key = dedupKey(message);
  const mentions: ActorMention[] = [];
  for (const actor of FORUM_ACTORS) {
    const matched = actor.aliases.some((alias) => {
      const needle = normalize(alias);
      if (needle.length < 4) return false;
      const pattern = new RegExp(`(?:^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9]|$)`);
      return pattern.test(text);
    });
    if (matched) {
      mentions.push({
        actorKey: actor.key,
        label: actor.label,
        kind: actor.kind,
        messageKey: key,
        sourceId: message.sourceId,
        observedAt: message.observedAt ?? null,
      });
    }
  }
  return mentions;
}

const timestamp = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const day = (value: number): string => new Date(value).toISOString().slice(0, 10);

/** Aggregate actor mentions into identified actors and their observable activity. */
export function summarizeActorActivity(messages: readonly ForumMessage[]): ActorActivitySummary {
  const byActor = new Map<string, ActorActivity>();
  const messagesWithActors = new Set<string>();
  let mentions = 0;

  for (const message of messages) {
    if (!isFrancophoneMessage(message)) continue;
    const found = findActorMentions(message);
    if (found.length === 0) continue;
    messagesWithActors.add(dedupKey(message));
    for (const mention of found) {
      mentions++;
      let activity = byActor.get(mention.actorKey);
      if (!activity) {
        activity = {
          key: mention.actorKey,
          label: mention.label,
          kind: mention.kind,
          messages: 0,
          sources: 0,
          firstSeen: null,
          lastSeen: null,
          activeDays: 0,
        };
        byActor.set(mention.actorKey, activity);
      }
      activity.messages++;
      const at = timestamp(mention.observedAt);
      if (at !== null) {
        if (activity.firstSeen === null || at < timestamp(activity.firstSeen)!) activity.firstSeen = day(at);
        if (activity.lastSeen === null || at > timestamp(activity.lastSeen)!) activity.lastSeen = day(at);
        const first = timestamp(activity.firstSeen)!;
        activity.activeDays = Math.floor((timestamp(activity.lastSeen)! - first) / 86_400_000) + 1;
      }
    }
  }

  const rows = [...byActor.values()].map((row) => {
    const sources = new Set(
      messages
        .filter((message) => isFrancophoneMessage(message) && findActorMentions(message).some((m) => m.actorKey === row.key))
        .map((message) => message.sourceId),
    );
    return { ...row, sources: sources.size };
  });
  rows.sort((a, b) => b.messages - a.messages || a.key.localeCompare(b.key));

  return {
    actorsIdentified: rows.length,
    mentions,
    messagesWithActors: messagesWithActors.size,
    byActor: rows,
  };
}
