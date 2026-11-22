/**
 * Archive one claim capture per Nouvelle-Aquitaine leak-site victim.
 *
 * Public RansomLook and ransomwatch feeds are the evidence sources. Each
 * archived WARC record keeps the exact JSON object published by a feed, with
 * personal-data patterns removed and the feed URL as WARC-Target-URI. The
 * manifest stores organization ids and hashes only, never victim person data.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import {
  parseClaim,
  type ClaimEnrichie,
  type ClaimSource,
} from "./collectors/leak-sites.js";

export const FEEDS: Record<ClaimSource, readonly string[]> = {
  ransomlook: [
    "https://www.ransomlook.io/api/recent/5000",
    "https://www.ransomlook.io/api/posts/2025",
    "https://www.ransomlook.io/api/posts/2026",
  ],
  ransomwatch: ["https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json"],
};

export type FeedResponse = { status: number; text: string };

export const fetchFeed: (url: string) => Promise<FeedResponse> = async (url) => {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "radar-cyber-leak-victim-proofs/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    return { status: res.status, text: res.ok ? await res.text() : "" };
  } catch {
    return { status: 0, text: "" };
  }
};

/** Raw top-level objects of a JSON array, without re-serializing them. */
export function carveJsonArray(text: string): string[] {
  const start = text.indexOf("[");
  if (start < 0) return [];
  const elements: string[] = [];
  let depth = 0;
  let begin = -1;
  let inString = false;
  let escaped = false;
  for (let i = start + 1; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{" || char === "[") {
      if (depth === 0) begin = i;
      depth += 1;
    } else if (char === "}" || char === "]") {
      if (depth === 0) break;
      depth -= 1;
      if (depth === 0 && begin >= 0) {
        elements.push(text.slice(begin, i + 1));
        begin = -1;
      }
    }
  }
  return elements;
}

const PERSONAL_DATA: readonly [RegExp, string][] = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],
  [/\b0[1-9](?:[\s.-]?\d{2}){4}\b/g, "[REDACTED_PHONE]"],
  [/\+\d{1,3}(?:[\s.-]?\d{2,4}){2,4}\b/g, "[REDACTED_PHONE]"],
  [/\b[1-4]\d{2}(?:0[1-9]|1[0-2])(?:2[AB]|\d{3})\d{3}\d{2}\b/g, "[REDACTED_ID]"],
];

/** Remove victim person data before anything is written to the archive. */
export function redactPersonalData(text: string): string {
  return PERSONAL_DATA.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

export function hasPersonalData(text: string): boolean {
  return PERSONAL_DATA.some(([pattern]) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return bits > 0 ? output + BASE32_ALPHABET[(value << (5 - bits)) & 31] : output;
}

function base32Sha1(payload: string): string {
  return base32(createHash("sha1").update(Buffer.from(payload, "utf8")).digest());
}

function recordId(victimKey: string): string {
  const hex = createHash("sha256").update(victimKey).digest("hex").slice(0, 32);
  return `<urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}>`;
}

export type WarcRecord = {
  targetUri: string | null;
  claimFingerprint: string | null;
  victimKey: string | null;
  payload: string;
  headers: Map<string, string>;
  digestValid: boolean;
  lengthValid: boolean;
};

export function buildWarcRecord(input: {
  targetUri: string;
  date: string;
  payload: string;
  claimFingerprint: string;
  victimKey: string;
}): string {
  const { targetUri, date, payload, claimFingerprint, victimKey } = input;
  const headers = [
    "WARC/1.1",
    "WARC-Type: resource",
    `WARC-Record-ID: ${recordId(victimKey)}`,
    `WARC-Date: ${date}`,
    `WARC-Target-URI: ${targetUri}`,
    "WARC-Identified-Payload-Type: application/json",
    "Content-Type: application/json",
    `Content-Length: ${Buffer.byteLength(payload, "utf8")}`,
    `WARC-Block-Digest: sha1:${base32Sha1(payload)}`,
    `X-Claim-Fingerprint: ${claimFingerprint}`,
    `X-Victim-Key: ${victimKey}`,
  ];
  return `${headers.join("\r\n")}\r\n\r\n${payload}\r\n\r\n`;
}

export function parseWarcRecord(raw: string): WarcRecord {
  const split = raw.indexOf("\r\n\r\n");
  if (split < 0) throw new Error("WARC header block is missing");
  const lines = raw.slice(0, split).split("\r\n");
  if (lines[0] !== "WARC/1.1") throw new Error("WARC version is not 1.1");
  const headers = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const at = line.indexOf(":");
    if (at > 0) headers.set(line.slice(0, at).toLowerCase(), line.slice(at + 1).trim());
  }
  const payload = raw.slice(split + 4).replace(/(?:\r\n)+$/, "");
  const digest = headers.get("warc-block-digest") ?? "";
  return {
    targetUri: headers.get("warc-target-uri") ?? null,
    claimFingerprint: headers.get("x-claim-fingerprint") ?? null,
    victimKey: headers.get("x-victim-key") ?? null,
    payload,
    headers,
    digestValid: digest === `sha1:${base32Sha1(payload)}`,
    lengthValid: Number(headers.get("content-length")) === Buffer.byteLength(payload, "utf8"),
  };
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** A person is never the identity key: an organization id, else a hashed label. */
export function victimKey(claim: ClaimEnrichie): string {
  const identity = claim.orgId !== null
    ? `org:${claim.orgId}`
    : `label:${normalize(claim.victim)}|${normalize(claim.groupName)}`;
  return createHash("sha256").update(identity).digest("hex").slice(0, 24);
}

export type ProofEntry = {
  victimKey: string;
  claimFingerprint: string;
  source: ClaimSource;
  groupName: string;
  sourceUrl: string;
  warcPath: string;
  payloadSha256: string;
  capturedAt: string;
  orgId: number | null;
  naMotifs: string[];
};

export type ProofManifest = {
  generatedAt: string;
  scope: string;
  feeds: { url: string; claims: number }[];
  victims: ProofEntry[];
  skipped: { claimFingerprint: string; reason: string }[];
  stats: { naClaims: number; victims: number; archived: number; skipped: number };
};

export type CaptureOptions = {
  claims: readonly ClaimEnrichie[];
  dir: string;
  fetchText?: (url: string) => Promise<FeedResponse>;
  now?: () => Date;
};

/** Capture exactly one redacted WARC record per distinct NA victim. */
export async function captureVictimProofs(options: CaptureOptions): Promise<ProofManifest> {
  const fetcher = options.fetchText ?? fetchFeed;
  const now = options.now ?? (() => new Date());
  const naClaims = options.claims.filter((claim) => claim.na);
  const feeds = new Map<string, ClaimSource>();
  for (const claim of naClaims) for (const url of FEEDS[claim.source]) feeds.set(url, claim.source);

  const claimsByFingerprint = new Map<string, { raw: string; url: string }>();
  const feedStats: { url: string; claims: number }[] = [];
  for (const [url, source] of feeds) {
    const response = await fetcher(url);
    if (response.status !== 200) {
      feedStats.push({ url, claims: 0 });
      continue;
    }
    const elements = carveJsonArray(response.text);
    let usable = 0;
    for (const raw of elements) {
      let fingerprint: string | null = null;
      try {
        fingerprint = parseClaim(JSON.parse(raw), source)?.fingerprint ?? null;
      } catch {
        continue;
      }
      if (fingerprint && !claimsByFingerprint.has(fingerprint)) {
        claimsByFingerprint.set(fingerprint, { raw, url });
        usable += 1;
      }
    }
    feedStats.push({ url, claims: usable });
  }

  mkdirSync(options.dir, { recursive: true });
  const seen = new Set<string>();
  const victims: ProofEntry[] = [];
  const skipped: ProofManifest["skipped"] = [];
  const capturedAt = now().toISOString();
  for (const claim of naClaims) {
    const key = victimKey(claim);
    if (seen.has(key)) {
      skipped.push({ claimFingerprint: claim.fingerprint, reason: "duplicate victim" });
      continue;
    }
    const found = claimsByFingerprint.get(claim.fingerprint);
    if (!found) {
      skipped.push({ claimFingerprint: claim.fingerprint, reason: "claim not found in public feed" });
      continue;
    }
    const payload = redactPersonalData(found.raw);
    const warc = buildWarcRecord({
      targetUri: found.url,
      date: capturedAt,
      payload,
      claimFingerprint: claim.fingerprint,
      victimKey: key,
    });
    const fileName = `${key}.warc`;
    writeFileSync(join(options.dir, fileName), warc);
    seen.add(key);
    victims.push({
      victimKey: key,
      claimFingerprint: claim.fingerprint,
      source: claim.source,
      groupName: claim.groupName,
      sourceUrl: found.url,
      warcPath: fileName,
      payloadSha256: createHash("sha256").update(Buffer.from(payload, "utf8")).digest("hex"),
      capturedAt,
      orgId: claim.orgId,
      naMotifs: claim.naMotifs,
    });
  }
  return {
    generatedAt: capturedAt,
    scope: "Nouvelle-Aquitaine",
    feeds: feedStats,
    victims,
    skipped,
    stats: {
      naClaims: naClaims.length,
      victims: seen.size,
      archived: victims.length,
      skipped: skipped.length,
    },
  };
}

export type Measurement = {
  count: number;
  total: number;
  validClaims: number;
  invalid: { victimKey: string; reason: string }[];
};

/** Re-read the archived bytes: a counter is only valid if every record checks out. */
export function measureVictimProofs(manifestPath: string): Measurement {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ProofManifest;
  const invalid: Measurement["invalid"] = [];
  const validKeys = new Set<string>();
  let validClaims = 0;
  for (const entry of manifest.victims) {
    let reason: string | null = null;
    try {
      const path = isAbsolute(entry.warcPath) ? entry.warcPath : join(dirname(manifestPath), "..", "leak-victim-proofs", entry.warcPath);
      const record = parseWarcRecord(readFileSync(path, "utf8"));
      if (!record.digestValid || !record.lengthValid) reason = "invalid WARC digest or length";
      else if (record.targetUri !== entry.sourceUrl || !FEEDS[entry.source]?.includes(entry.sourceUrl)) reason = "unexpected source URL";
      else if (record.claimFingerprint !== entry.claimFingerprint || record.victimKey !== entry.victimKey) reason = "capture identity mismatch";
      else if (createHash("sha256").update(Buffer.from(record.payload, "utf8")).digest("hex") !== entry.payloadSha256) reason = "payload hash mismatch";
      else if (hasPersonalData(record.payload)) reason = "personal data in capture";
      else {
        const claim = parseClaim(JSON.parse(record.payload), entry.source);
        if (!claim || claim.fingerprint !== entry.claimFingerprint) reason = "claim mismatch";
        else validClaims += 1;
      }
    } catch (err) {
      reason = err instanceof Error ? err.message : "unreadable capture";
    }
    if (reason) invalid.push({ victimKey: entry.victimKey, reason });
    else validKeys.add(entry.victimKey);
  }
  return { count: validKeys.size, total: new Set(manifest.victims.map((v) => v.victimKey)).size, validClaims, invalid };
}
