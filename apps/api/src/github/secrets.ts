/**
 * Detects credential-shaped strings in public source code.
 *
 * This module is deliberately value-blind: it returns a stable fingerprint and
 * the kind of each match, never the matched text. Callers can therefore count
 * and deduplicate findings without ever holding a secret in a persisted file,
 * a log line or an API response.
 */
import { createHash } from "node:crypto";

export type SecretKind =
  | "aws_access_key_id"
  | "github_token"
  | "github_fine_grained_token"
  | "slack_token"
  | "google_api_key"
  | "private_key"
  | "generic_api_key"
  | "env_credential";

export type SecretFinding = {
  kind: SecretKind;
  line: number;
  /** First 16 hex characters of the SHA-256 digest of the matched value. */
  fingerprint: string;
};

type Pattern = { kind: SecretKind; regex: RegExp };

/** Patterns observed in public repositories; each one captures the value. */
export const SECRET_PATTERNS: readonly Pattern[] = [
  { kind: "aws_access_key_id", regex: /\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/g },
  { kind: "github_token", regex: /\b(gh[pousr]_[A-Za-z0-9]{36,255})\b/g },
  { kind: "github_fine_grained_token", regex: /\b(github_pat_[A-Za-z0-9_]{50,200})\b/g },
  { kind: "slack_token", regex: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g },
  { kind: "google_api_key", regex: /\b(AIza[0-9A-Za-z_-]{35})\b/g },
  {
    kind: "private_key",
    regex: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----)/g,
  },
  {
    kind: "generic_api_key",
    regex: /(?:api[_-]?key|secret[_-]?key|access[_-]?token|client[_-]?secret|auth[_-]?token)\s*[:=]\s*["']([^"'\s]{16,200})["']/gi,
  },
  {
    kind: "env_credential",
    regex: /(?:^|[\s,;])(?:AWS_SECRET_ACCESS_KEY|SECRET_KEY|API_KEY|CLIENT_SECRET|ACCESS_TOKEN|AUTH_TOKEN|GITHUB_TOKEN|SLACK_TOKEN|PRIVATE_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_\-/+.]{24,200})["']?/gim,
  },
];

/** Common documentation placeholders must not be counted as leaked secrets. */
const PLACEHOLDER_MARKERS =
  /example|sample|placeholder|your[_-]?|changeme|change[_-]?me|dummy|fake|redacted|test[_-]?|xxxx+|yyyy+|zzzz+|\$\{|<|>|^\*+$/i;
const REPEATED_CHARACTER = /^(.)\1{7,}$/s;

export function isPlaceholder(value: string): boolean {
  if (value.length < 8) return true;
  if (PLACEHOLDER_MARKERS.test(value)) return true;
  return REPEATED_CHARACTER.test(value);
}

export function fingerprintOf(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

/**
 * Finds distinct credential-shaped values in a block of code.
 *
 * The returned findings contain no part of the source text beyond the 1-based
 * line number, which is needed to locate an alert for the repository owner.
 */
export function scanCode(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();

  for (const { kind, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const value = match[1];
      if (!value || isPlaceholder(value)) continue;
      const fingerprint = fingerprintOf(value);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      findings.push({
        kind,
        line: text.slice(0, match.index).split("\n").length,
        fingerprint,
      });
      if (match[0].length === 0) regex.lastIndex += 1;
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind));
}

/** Number of distinct secret values, deduplicated by fingerprint. */
export function countDistinctSecrets(findings: readonly SecretFinding[]): number {
  return new Set(findings.map((finding) => finding.fingerprint)).size;
}

/** Aggregate view safe to publish: counts by credential type only. */
export function summarizeFindings(findings: readonly SecretFinding[]): {
  total: number;
  byKind: Record<string, number>;
} {
  const byKind: Record<string, number> = {};
  for (const fingerprint of new Set(findings.map((finding) => finding.fingerprint))) {
    const kind = findings.find((finding) => finding.fingerprint === fingerprint)?.kind;
    if (kind) byKind[kind] = (byKind[kind] ?? 0) + 1;
  }
  return { total: Object.values(byKind).reduce((sum, n) => sum + n, 0), byKind };
}
