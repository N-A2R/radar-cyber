/**
 * Shared privacy gate for the CTI connectors.
 *
 * Both connectors work on an allow-list of fields. This module is the second
 * line of defence: free text is scrubbed before it leaves the process and
 * URLs lose credentials, query strings and fragments. It is intentionally
 * independent of the database so that the rules can be tested in isolation.
 */

const REDACTIONS: readonly { pattern: RegExp; replacement: string }[] = [
  { pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacement: "[email-redacted]" },
  {
    pattern: /(?:\+33[\s.\-]?(?:0[\s.\-]?)?[1-9](?:[\s.\-]?\d{2}){4}|0[1-9](?:[\s.\-]\d{2}){4})(?!\d)/g,
    replacement: "[phone-redacted]",
  },
  { pattern: /\bFR\d{2}(?:[ ]?\d{4}){5}[ ]?\d{2}\b/g, replacement: "[iban-redacted]" },
  { pattern: /\b\d{15}\b/g, replacement: "[national-id-redacted]" },
  {
    pattern: /\b(?:M\.|Mme|Mlle|Dr|Pr)\s+[A-ZÀ-Ÿ][a-zà-ÿ'’-]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ'’-]+)?/g,
    replacement: "[person-redacted]",
  },
];

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  return value === null || value === undefined ? "" : String(value);
}

/** Remove direct identifiers from a free-text field. */
export function scrubText(value: unknown): string {
  let out = asText(value);
  for (const { pattern, replacement } of REDACTIONS) out = out.replace(pattern, replacement);
  return out.trim();
}

/** True when scrubbing would change the value: useful as an import rejection reason. */
export function hasPersonalData(value: unknown): boolean {
  return scrubText(value) !== asText(value).trim();
}

/** Keep the scheme, host and path only; drop user info, query strings and fragments. */
export function scrubUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}
