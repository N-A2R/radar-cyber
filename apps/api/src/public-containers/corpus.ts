/**
 * Versioned, redacted corpus of public containers exposing NA data.
 *
 * A record holds only public identifiers and counters. Validation is strict:
 * any extra key, personal identifier or unknown host makes the whole corpus
 * invalid, so a collection change cannot silently publish victim data.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  ALLOWED_HOSTS,
  fingerprint,
  isPublicReadable,
} from "./detect.js";

const HostSchema = z.string().refine(
  (host) => ALLOWED_HOSTS.includes(host) ||
    host.endsWith(".s3.amazonaws.com") || host.endsWith(".storage.googleapis.com") ||
    /^[a-z0-9-]+\.blob\.core\.windows\.net$/.test(host),
);

const ContainerRecordSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{16}$/),
  kind: z.enum(["repository", "gist", "bucket"]),
  host: HostSchema,
  name: z.string().regex(/^[A-Za-z0-9._-]{1,120}$/),
  ownerHash: z.string().regex(/^[a-f0-9]{16}$/),
  naSignal: z.string().min(1).max(120),
  dataSignal: z.string().min(1).max(120),
  dataFiles: z.number().int().nonnegative(),
  status: z.number().int().min(100).max(599),
  origin: z.string().regex(/^[a-z0-9-]{2,40}$/),
  checkedAt: z.string().datetime(),
}).strict();

const CorpusSchema = z.object({
  collectedAt: z.string().datetime(),
  scope: z.literal("nouvelle-aquitaine"),
  method: z.string().min(1),
  candidatesScanned: z.number().int().nonnegative(),
  records: z.array(ContainerRecordSchema),
}).strict();

export type ContainerRecord = z.infer<typeof ContainerRecordSchema>;
export type ContainerCorpus = z.infer<typeof CorpusSchema>;

/** Keys that must never reach a published artefact. */
const FORBIDDEN_KEYS = /email|phone|mail|victim|victime|name$|fullName|summary|body|content|address|contact|token|secret|password/i;
const EMAILISH = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONEISH = /(?:\+?33[\s.-]?\(?0\)?|(?:^|\s)0[1-9](?:[\s.-]?\d{2}){4})(?=\s|$)/;

/**
 * Throws when the corpus is not a redacted NA container corpus. The check is
 * applied both by the collector before writing and by the measure command.
 */
export function validateCorpus(value: unknown): ContainerCorpus {
  const corpus = CorpusSchema.parse(value);
  const serialized = JSON.stringify(corpus);
  if (FORBIDDEN_KEYS.test(serialized) || EMAILISH.test(serialized) || PHONEISH.test(serialized)) {
    throw new Error("Corpus contains a personal or sensitive field");
  }
  for (const record of corpus.records) {
    const expected = fingerprint(`${record.kind}:${record.host}:${record.ownerHash}:${record.name}`);
    if (record.id !== expected) throw new Error("Container id does not match its target");
  }
  return corpus;
}

export function loadCorpus(path: string): ContainerCorpus {
  return validateCorpus(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export type ContainerCount = {
  count: number;
  byKind: { repository: number; gist: number; bucket: number };
  accessibleChecked: number;
  duplicates: number;
};

/** Counts distinct anonymously readable containers that hold NA data. */
export function countAccessible(corpus: ContainerCorpus): ContainerCount {
  const seen = new Set<string>();
  const byKind = { repository: 0, gist: 0, bucket: 0 };
  let accessibleChecked = 0;
  let duplicates = 0;
  for (const record of corpus.records) {
    if (!isPublicReadable(record.status) || record.dataFiles < 1 ||
        !record.naSignal || !record.dataSignal) continue;
    accessibleChecked++;
    if (seen.has(record.id)) {
      duplicates++;
      continue;
    }
    seen.add(record.id);
    byKind[record.kind]++;
  }
  return { count: seen.size, byKind, accessibleChecked, duplicates };
}
