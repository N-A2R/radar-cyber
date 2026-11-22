/**
 * Encrypted cold archive procedure, run end to end:
 * select -> redact -> seal -> encrypt -> verify -> restore.
 *
 * Only ciphertext is written to the cold directory. The digest is computed on
 * the canonical plaintext so a reproducible command can publish a stable
 * figure even though each envelope has a fresh salt and IV.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { decrypt, encrypt } from "./cipher.js";
import { hasPersonalData, redactEvent } from "./redact.js";
import {
  EXCLUDED_FAMILIES,
  EXCLUDED_TLP,
  fetchArchiveEvents,
  NA_DEPARTMENTS,
  type ArchivedEvent,
} from "./scope.js";

export const ARCHIVE_FILE = "cold-archive.enc";
const PLAINTEXT_MARKER = "radar-cold-archive-payload";

export type ArchiveScope = {
  region: "Nouvelle-Aquitaine";
  departments: readonly string[];
  excludedTlp: readonly string[];
  excludedFamilies: readonly string[];
  greySourcesAllowed: true;
};

export type ColdArchivePayload = {
  version: 1;
  marker: string;
  scope: ArchiveScope;
  count: number;
  sources: number;
  records: ArchivedEvent[];
  sha256: string;
};

export type StageResult = { name: string; ok: boolean; detail: string };

export type ProcedureResult = {
  stages: StageResult[];
  selected: number;
  restored: number;
  sources: number;
  sha256: string;
  file: string;
  plaintextBytes: number;
  encryptedBytes: number;
};

/** Canonical JSON: key order and record order never change the digest. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function digest(records: ArchivedEvent[]): string {
  return createHash("sha256").update(stableStringify(records)).digest("hex");
}

export function buildPayload(records: ArchivedEvent[]): ColdArchivePayload {
  const clean = [...records].sort((a, b) => a.id - b.id).map(redactEvent);
  if (clean.some(hasPersonalData)) throw new Error("personal data found in archive input");
  return {
    version: 1,
    marker: PLAINTEXT_MARKER,
    scope: {
      region: "Nouvelle-Aquitaine",
      departments: NA_DEPARTMENTS,
      excludedTlp: EXCLUDED_TLP,
      excludedFamilies: EXCLUDED_FAMILIES,
      greySourcesAllowed: true,
    },
    count: clean.length,
    sources: new Set(clean.map((record) => record.sourceId)).size,
    records: clean,
    sha256: digest(clean),
  };
}

/** Reject a decrypted file whose digest, scope or redaction no longer holds. */
export function readPayload(bytes: Buffer): ColdArchivePayload {
  const payload = JSON.parse(bytes.toString("utf8")) as ColdArchivePayload;
  if (payload.version !== 1 || payload.marker !== PLAINTEXT_MARKER) {
    throw new Error("invalid cold archive payload");
  }
  if (payload.count !== payload.records.length || payload.sha256 !== digest(payload.records)) {
    throw new Error("cold archive digest mismatch");
  }
  if (payload.records.some(hasPersonalData)) throw new Error("personal data in cold archive");
  return payload;
}

export async function runColdArchiveProcedure(options: {
  directory: string;
  passphrase: string;
}): Promise<ProcedureResult> {
  await mkdir(options.directory, { recursive: true });
  const stages: StageResult[] = [];

  const selected = await fetchArchiveEvents();
  const selectedSources = new Set(selected.map((record) => record.sourceId)).size;
  stages.push({
    name: "select",
    ok: selected.length > 0,
    detail: `${selected.length} NA events from ${selectedSources} sources`,
  });

  const payload = buildPayload(selected);
  stages.push({
    name: "redact",
    ok: payload.records.every((record) => !hasPersonalData(record)),
    detail: `${payload.count} records free of victim personal data`,
  });
  stages.push({
    name: "seal",
    ok: payload.sha256 === digest(payload.records) && payload.marker === PLAINTEXT_MARKER,
    detail: `sha256=${payload.sha256}`,
  });

  const plaintext = Buffer.from(stableStringify(payload), "utf8");
  const envelope = encrypt(plaintext, options.passphrase);
  const file = join(options.directory, ARCHIVE_FILE);
  await writeFile(file, envelope, { mode: 0o600 });
  const noPlaintextOnDisk = !envelope.includes(Buffer.from(PLAINTEXT_MARKER));
  stages.push({
    name: "encrypt",
    ok: noPlaintextOnDisk && envelope.length > 0,
    detail: `${envelope.length} encrypted bytes on disk, no plaintext marker`,
  });

  const opened = readPayload(decrypt(await readFile(file), options.passphrase));
  const tampered = Buffer.from(envelope);
  tampered[tampered.length - 1] ^= 0x01;
  let tamperRejected = false;
  try {
    decrypt(tampered, options.passphrase);
  } catch {
    tamperRejected = true;
  }
  const scopeOk =
    opened.scope.region === "Nouvelle-Aquitaine" &&
    opened.scope.greySourcesAllowed === true &&
    opened.records.every(
      (record) => record.regional || NA_DEPARTMENTS.includes(record.dept ?? ""),
    );
  stages.push({
    name: "verify",
    ok: opened.sha256 === payload.sha256 && tamperRejected && scopeOk,
    detail: `digest ok, scope ok, tamper ${tamperRejected ? "rejected" : "ACCEPTED"}`,
  });

  const roundTrip = stableStringify(opened.records) === stableStringify(payload.records);
  const restored = opened.records.length;
  const percent = selected.length === 0 ? 0 : Math.round((restored / selected.length) * 100);
  stages.push({
    name: "restore",
    ok: roundTrip && restored === selected.length,
    detail: `${restored}/${selected.length} events restored (${percent}%)`,
  });

  return {
    stages,
    selected: selected.length,
    restored,
    sources: payload.sources,
    sha256: payload.sha256,
    file,
    plaintextBytes: plaintext.length,
    encryptedBytes: envelope.length,
  };
}
