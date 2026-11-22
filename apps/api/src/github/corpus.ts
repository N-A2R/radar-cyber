/**
 * Redacted evidence corpus for leaked secrets in public GitHub repositories.
 *
 * A record holds a location, a repository, a pinned commit, a file path, a line
 * number, a credential kind and a SHA-256 fingerprint. It never holds source
 * text or a credential value. Validation is strict so an accidental export of
 * raw values cannot silently become part of a published measurement.
 */
import { isNaLocation } from "./na-location.js";
import type { SecretKind } from "./secrets.js";

export type RedactedSecretRecord = {
  org: string;
  location: string;
  repository: string;
  commit: string;
  path: string;
  line: number;
  kind: SecretKind;
  fingerprint: string;
};

export type SecretCorpus = {
  collectedAt: string;
  scope: "nouvelle-aquitaine";
  origin: "public-github";
  queryLocations: readonly string[];
  organizations: readonly string[];
  repositories: number;
  filesScanned: number;
  records: readonly RedactedSecretRecord[];
};

const RECORD_KEYS: readonly string[] = [
  "org", "location", "repository", "commit", "path", "line", "kind", "fingerprint",
];

const ALLOWED_RECORD_KEYS: Record<string, true> = Object.fromEntries(
  RECORD_KEYS.map((key) => [key, true]),
);

const ALLOWED_KINDS: Record<string, true> = {
  aws_access_key_id: true,
  github_token: true,
  github_fine_grained_token: true,
  slack_token: true,
  google_api_key: true,
  generic_api_key: true,
  env_credential: true,
};

const CORPUS_KEYS: Record<string, true> = {
  collectedAt: true,
  scope: true,
  origin: true,
  queryLocations: true,
  organizations: true,
  repositories: true,
  filesScanned: true,
  records: true,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rejects any corpus carrying source text, a credential value or a non-NA record. */
export function validateCorpus(input: unknown): SecretCorpus {
  if (!isObject(input)) throw new Error("corpus must be an object");
  for (const key of Object.keys(input)) {
    if (!CORPUS_KEYS[key]) throw new Error(`corpus field '${key}' is not allowed`);
  }
  if (input.scope !== "nouvelle-aquitaine") throw new Error("corpus scope must be nouvelle-aquitaine");
  if (input.origin !== "public-github") throw new Error("corpus origin must be public-github");
  if (typeof input.collectedAt !== "string") throw new Error("corpus collectedAt must be a string");
  if (!Array.isArray(input.records)) throw new Error("corpus records must be an array");

  for (const [index, raw] of input.records.entries()) {
    if (!isObject(raw)) throw new Error(`record ${index} must be an object`);
    const keys = Object.keys(raw);
    if (keys.length !== RECORD_KEYS.length || keys.some((key) => !ALLOWED_RECORD_KEYS[key])) {
      throw new Error(`record ${index} has unexpected fields: ${keys.join(",")}`);
    }
    if (typeof raw.org !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(raw.org)) {
      throw new Error(`record ${index} has an invalid org login`);
    }
    if (typeof raw.location !== "string" || !isNaLocation(raw.location)) {
      throw new Error(`record ${index} is outside Nouvelle-Aquitaine`);
    }
    if (typeof raw.repository !== "string" || !raw.repository.includes("/")) {
      throw new Error(`record ${index} has an invalid repository`);
    }
    if (typeof raw.commit !== "string" || !/^[0-9a-f]{7,40}$/.test(raw.commit)) {
      throw new Error(`record ${index} has an invalid commit`);
    }
    if (typeof raw.path !== "string" || raw.path.length === 0 || raw.path.length > 500) {
      throw new Error(`record ${index} has an invalid path`);
    }
    if (!Number.isInteger(raw.line) || (raw.line as number) < 1) {
      throw new Error(`record ${index} has an invalid line`);
    }
    if (typeof raw.kind !== "string" || !ALLOWED_KINDS[raw.kind]) {
      throw new Error(`record ${index} has an invalid kind`);
    }
    if (typeof raw.fingerprint !== "string" || !/^[0-9a-f]{16}$/.test(raw.fingerprint)) {
      throw new Error(`record ${index} has an invalid fingerprint`);
    }
  }

  return {
    collectedAt: input.collectedAt,
    scope: "nouvelle-aquitaine",
    origin: "public-github",
    queryLocations: Array.isArray(input.queryLocations) ? input.queryLocations.map(String) : [],
    organizations: Array.isArray(input.organizations) ? input.organizations.map(String) : [],
    repositories: Number(input.repositories) || 0,
    filesScanned: Number(input.filesScanned) || 0,
    records: input.records as RedactedSecretRecord[],
  };
}

/** Aggregate counters computed from redacted records only. */
export function summarizeCorpus(corpus: SecretCorpus): {
  count: number;
  byKind: Record<string, number>;
  byOrg: Record<string, number>;
  organizations: number;
  repositories: number;
  filesScanned: number;
  records: number;
} {
  const byKind: Record<string, number> = {};
  const byOrg: Record<string, number> = {};
  const fingerprints = new Map<string, RedactedSecretRecord>();

  for (const record of corpus.records) {
    if (!fingerprints.has(record.fingerprint)) fingerprints.set(record.fingerprint, record);
  }
  for (const record of fingerprints.values()) {
    byKind[record.kind] = (byKind[record.kind] ?? 0) + 1;
    byOrg[record.org] = (byOrg[record.org] ?? 0) + 1;
  }

  return {
    count: fingerprints.size,
    byKind,
    byOrg,
    organizations: Object.keys(byOrg).length,
    repositories: corpus.repositories,
    filesScanned: corpus.filesScanned,
    records: corpus.records.length,
  };
}
