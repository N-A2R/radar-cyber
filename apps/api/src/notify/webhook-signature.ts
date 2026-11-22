/**
 * HMAC-SHA256 signing for outgoing alert webhooks.
 *
 * A receiver verifies the exact raw request body with the shared secret:
 *   sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 * The timestamp is a Unix time in seconds, so stale requests can be rejected.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-radar-signature";
export const TIMESTAMP_HEADER = "x-radar-timestamp";
export const SIGNATURE_PREFIX = "sha256=";
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** Sign a raw JSON body with its timestamp; the body is never re-serialized. */
export function signWebhookBody(secret: string, rawBody: string, timestampSeconds: number): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestampSeconds}.${rawBody}`, "utf8")
    .digest("hex");
  return `${SIGNATURE_PREFIX}${digest}`;
}

/** Headers for one webhook POST, bound to the exact bytes sent as the body. */
export function buildSignedWebhookHeaders(
  secret: string,
  rawBody: string,
  now: Date = new Date(),
): Record<string, string> {
  const timestamp = Math.floor(now.getTime() / 1000);
  return {
    "content-type": "application/json",
    [SIGNATURE_HEADER]: signWebhookBody(secret, rawBody, timestamp),
    [TIMESTAMP_HEADER]: String(timestamp),
  };
}

export interface VerifyWebhookOptions {
  secret: string;
  rawBody: string;
  signature: string | string[] | undefined;
  timestamp: string | string[] | undefined;
  now?: Date;
  toleranceSeconds?: number;
}

/** Receiver-side verification: false for malformed, stale or altered requests. */
export function verifyWebhookSignature(options: VerifyWebhookOptions): boolean {
  const signature = Array.isArray(options.signature) ? options.signature[0] : options.signature;
  const timestampRaw = Array.isArray(options.timestamp) ? options.timestamp[0] : options.timestamp;
  if (!options.secret || !signature || !timestampRaw || !/^\d+$/.test(timestampRaw)) return false;

  const timestamp = Number(timestampRaw);
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > tolerance) return false;

  const expected = signWebhookBody(options.secret, options.rawBody, timestamp);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
}

