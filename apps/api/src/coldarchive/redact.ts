/** Victim personal data never reaches cold storage: redact before sealing. */
import type { ArchivedEvent } from "./scope.js";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+33[\s.-]?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const NIR = /\b[12]\s?\d{2}\s?\d{2}\s?\d{2,5}\s?\d{3}\s?\d{3}\s?\d{2}\b/g;

export type Redaction = { text: string; redacted: boolean };

const PATTERNS = [EMAIL, PHONE, NIR];

export function redactText(input: string | null | undefined): Redaction {
  if (!input) return { text: "", redacted: false };
  const text = input
    .replace(NIR, "[id-redacted]")
    .replace(EMAIL, "[email-redacted]")
    .replace(PHONE, "[phone-redacted]");
  return { text, redacted: text !== input };
}

export function containsPersonalData(input: string | null | undefined): boolean {
  if (!input) return false;
  return PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}

export function redactEvent(event: ArchivedEvent): ArchivedEvent {
  return {
    ...event,
    title: redactText(event.title).text,
    summary: redactText(event.summary).text,
    sourceUrl: redactText(event.sourceUrl).text,
  };
}

export function hasPersonalData(event: ArchivedEvent): boolean {
  return (
    containsPersonalData(event.title) ||
    containsPersonalData(event.summary) ||
    containsPersonalData(event.sourceUrl)
  );
}
