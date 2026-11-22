/**
 * Large-scale anchors for campaign detection.
 *
 * Two deterministic signals are added on top of the existing group,
 * infrastructure and organisation anchors:
 *   - an explicit CVE identifier: the same vulnerability reported by two
 *     sources inside a short window is a vulnerability campaign;
 *   - an identical advisory headline published by at least two distinct
 *     sources: a syndicated advisory is one observable campaign.
 *
 * No victim name, contact detail or inferred attribute is used. Headlines are
 * normalised and stripped of e-mail addresses and phone-like numbers before
 * they can become an anchor or a campaign label.
 */
import type { EvenementCampagne } from "./campagnes.js";

export type ScaleSignalType = "cve" | "headline";
export type ScaleSignal = { type: ScaleSignalType; value: string };

const CVE_PATTERN = /\bCVE-\d{4}-\d{4,}\b/gi;
const MIN_HEADLINE_LENGTH = 25;
const MAX_HEADLINE_LENGTH = 180;
const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;
const GENERIC_HEADLINES: Record<string, true> = {
	"attack map": true,
	"victim tracker": true,
	"ransomware.live": true,
	"ransomware .live leak-site monitoring": true,
	"weekly ransomware & cyber extortion intelligence report": true,
};

function cvesFromEvidence(evidence: Record<string, unknown>): string[] {
	const found: string[] = [];
	for (const key of ["cve", "cveId", "cve_id", "identifier"]) {
		const value = evidence[key];
		if (typeof value === "string") found.push(value);
		if (Array.isArray(value)) {
			for (const item of value) if (typeof item === "string") found.push(item);
		}
	}
	return found;
}

/** Normalised headline, or null for generic, very short or CVE-only titles. */
export function normalizeHeadline(title: string): string | null {
	const cleaned = title
		.normalize("NFKC")
		.replace(EMAIL_PATTERN, " ")
		.replace(PHONE_PATTERN, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
	if (cleaned.length < MIN_HEADLINE_LENGTH || GENERIC_HEADLINES[cleaned] === true) return null;
	if (/^cve-\d{4}-\d{4,}\b/.test(cleaned)) return null;
	return cleaned.slice(0, MAX_HEADLINE_LENGTH);
}

export function extractScaleSignals(event: EvenementCampagne): ScaleSignal[] {
	const signals: ScaleSignal[] = [];
	const seen = new Set<string>();
	const add = (type: ScaleSignalType, value: string): void => {
		const key = `${type}:${value}`;
		if (seen.has(key)) return;
		seen.add(key);
		signals.push({ type, value });
	};

	const searchable = [event.title ?? "", ...cvesFromEvidence(event.evidence ?? {})].join(" ");
	for (const match of searchable.matchAll(CVE_PATTERN)) add("cve", match[0].toUpperCase());

	const headline = normalizeHeadline(event.title ?? "");
	if (headline !== null) add("headline", headline);
	return signals;
}
