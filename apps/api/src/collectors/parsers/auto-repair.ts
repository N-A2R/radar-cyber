/**
 * Automatic, content-preserving repair of unreadable source bodies.
 *
 * A source is "repaired without human intervention" when one generic
 * transformation of its own response body removes a transport-level defect
 * without inventing content: UTF-8 read as latin-1, UTF-16 misdecoding, NUL
 * bytes, a short preamble, JSONP or CDATA wrappers, truncated JSON.
 * Structural candidates are used when the detector finds no item; encoding
 * normalisers also run on readable bodies, where they fix the text of the
 * items that were already extracted.
 *
 * Callers inject the detector so this module stays free of a circular import
 * with generic.ts, and so the exact same code path runs in production and in
 * the reproducible measurement command.
 */

import type { DetectionResult, DetectionStrategy } from "../generic.js";

export interface RepairCandidate {
	/** Stable identifier, used as the audit label of the repair. */
	id: string;
	body: string;
}

export interface AutoRepairResult {
	repaired: boolean;
	repairs: string[];
	strategy: DetectionStrategy | "none";
	itemCount: number;
	path: string | null;
}

export interface RepairedDetection extends AutoRepairResult {
	items: Record<string, unknown>[];
	/** Body actually parsed. Never exposed through `evaluateRepairs`. */
	body: string;
}

type Detector = (body: string, contentType: string | null) => DetectionResult;

const CHALLENGE_RE =
	/just a moment|checking your browser|ddos protection|enable javascript|captcha|access denied|attention required/i;
const MIN_BODY_LENGTH = 40;
const MAX_REPAIRED_ITEMS = 2000;
const MOJIBAKE_RE = /[\u00C0-\u00C5\u00C7-\u00CF\u00D1-\u00D6\u00D8-\u00DE][\u0080-\u00BF\u2018\u2019\u201A\u201C\u201D\u2026]|â€[™œš]/;
const MOJIBAKE_SEQ_RE = /[\u00C2-\u00F4][\u0080-\u00BF]{1,3}/g;
/** Cheap gate used by the collector before paying for a full detection pass. */
export function hasEncodingDefect(body: string): boolean {
	return MOJIBAKE_RE.test(body);
}

/** UTF-8 bytes decoded as latin-1: "LycÃ©e" instead of "Lycée". */
function fixMojibake(body: string): string | null {
	if (!MOJIBAKE_RE.test(body)) return null;
	let changed = false;
	const fixed = body.replace(MOJIBAKE_SEQ_RE, (sequence) => {
		const decoded = Buffer.from(sequence, "latin1").toString("utf8");
		if (decoded === sequence || decoded.length >= sequence.length || decoded.includes("\uFFFD")) return sequence;
		changed = true;
		return decoded;
	});
	return changed ? fixed : null;
}

/** UTF-16 decoded as latin-1: almost every second byte is NUL. */
function decodeUtf16(body: string): string | null {
	if (body.length < MIN_BODY_LENGTH) return null;
	const nuls = (body.match(/\u0000/g) ?? []).length;
	if (nuls < body.length / 4) return null;
	const bytes = Buffer.from(body, "latin1");
	if (bytes[0] !== 0xff || bytes[1] !== 0xfe) return null;
	const decoded = bytes.toString("utf16le").replace(/^\uFEFF/, "");
	return decoded.length > 0 ? decoded : null;
}

function removeControlChars(body: string): string | null {
	const out = body.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
	return out !== body ? out : null;
}

/** PHP notices or a short plain-text preamble before a JSON/XML document. */
function trimLeadingJunk(body: string): string | null {
	const match = body.match(/<\?xml|<rss\b|<feed\b|<rdf:RDF\b|\[|\{/i);
	if (!match || match.index === undefined || match.index === 0) return null;
	const prefix = body.slice(0, match.index);
	if (prefix.length > 400 || prefix.includes("<")) return null;
	return body.slice(match.index);
}

function unwrapJsonp(body: string): string | null {
	const match = body.trim().match(/^[A-Za-z_$][\w$.]*\s*\(\s*([\s\S]+?)\s*\)\s*;?$/);
	return match?.[1] ?? null;
}

function unwrapCdata(body: string): string | null {
	return body.trim().match(/^<!\[CDATA\[([\s\S]*)\]\]>$/)?.[1] ?? null;
}

/** Close a truncated JSON document, keeping every already-complete value. */
function closeTruncatedJson(body: string): string | null {
	const text = body.trim();
	if (!text.startsWith("[") && !text.startsWith("{")) return null;
	const stack: string[] = [];
	let inString = false;
	let escaped = false;
	for (const char of text) {
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === "\\" && inString) {
			escaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (char === "[" || char === "{") stack.push(char);
		else if (char === "]" || char === "}") stack.pop();
	}
	if (stack.length === 0 && !inString) return null;
	let out = inString ? `${text}"` : text;
	for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === "[" ? "]" : "}";
	try {
		JSON.parse(out);
	} catch {
		return null;
	}
	return out;
}

/** Encoding fixes are safe even when the detector already found items. */
const NORMALIZERS: readonly { id: string; apply: (body: string) => string | null }[] = [
	{ id: "utf8-mojibake-fixed", apply: fixMojibake },
];

/** Structural repairs are ordered: encoding first, then dependent damage. */
const STRUCTURAL: readonly { id: string; apply: (body: string) => string | null }[] = [
	{ id: "utf16-decoded", apply: decodeUtf16 },
	{ id: "control-chars-removed", apply: removeControlChars },
	{ id: "leading-junk-trimmed", apply: trimLeadingJunk },
	{ id: "jsonp-unwrapped", apply: unwrapJsonp },
	{ id: "cdata-unwrapped", apply: unwrapCdata },
	{ id: "truncated-json-closed", apply: closeTruncatedJson },
];

export function repairCandidates(body: string, normalizingOnly = false): RepairCandidate[] {
	const transforms = normalizingOnly ? NORMALIZERS : [...NORMALIZERS, ...STRUCTURAL];
	const candidates: RepairCandidate[] = [];
	for (const transform of transforms) {
		const repaired = transform.apply(body);
		if (repaired !== null && repaired !== body) candidates.push({ id: transform.id, body: repaired });
	}
	// A body can carry two defects where neither repair alone is sufficient
	// (NUL bytes + truncated JSON): apply the transforms in sequence once.
	let accumulated = body;
	const applied: string[] = [];
	for (const transform of transforms) {
		const next = transform.apply(accumulated);
		if (next !== null && next !== accumulated) {
			accumulated = next;
			applied.push(transform.id);
		}
	}
	if (applied.length > 1 && !candidates.some((candidate) => candidate.body === accumulated)) {
		candidates.push({ id: `combined:${applied.join("+")}`, body: accumulated });
	}
	return candidates;
}

/** Run the repairs and return the verified items to the caller. */
export function repairItems(
	body: string,
	contentType: string | null,
	detect: Detector,
	baseline: DetectionResult = detect(body, contentType),
): RepairedDetection {
	const refusal: RepairedDetection = { repaired: false, repairs: [], strategy: "none", itemCount: 0, path: null, items: [], body };
	if (baseline.items.length > 0) {
		for (const candidate of repairCandidates(body, true)) {
			const result = detect(candidate.body, contentType);
			if (result.items.length === 0 || result.items.length > MAX_REPAIRED_ITEMS) continue;
			return {
				repaired: true,
				repairs: [candidate.id],
				strategy: result.strategy,
				itemCount: result.items.length,
				path: result.path,
				items: result.items,
				body: candidate.body,
			};
		}
		return {
			repaired: false,
			repairs: [],
			strategy: baseline.strategy,
			itemCount: baseline.items.length,
			path: baseline.path,
			items: baseline.items,
			body,
		};
	}
	if (body.trim().length < MIN_BODY_LENGTH || CHALLENGE_RE.test(body.slice(0, 5000))) return refusal;

	for (const candidate of repairCandidates(body)) {
		if (CHALLENGE_RE.test(candidate.body.slice(0, 5000))) continue;
		const result = detect(candidate.body, contentType);
		if (result.strategy === "none" || result.items.length === 0) continue;
		if (result.items.length > MAX_REPAIRED_ITEMS) continue;
		return {
			repaired: true,
			repairs: [candidate.id],
			strategy: result.strategy,
			itemCount: result.items.length,
			path: result.path,
			items: result.items,
			body: candidate.body,
		};
	}
	return refusal;
}

/**
 * Measurement-facing view: identical verdict, no item content. This is the
 * guarantee that no victim data ever reaches a report or a log line.
 */
export function evaluateRepairs(
	body: string,
	contentType: string | null,
	detect: Detector,
): AutoRepairResult {
	const result = repairItems(body, contentType, detect);
	return {
		repaired: result.repaired,
		repairs: result.repairs,
		strategy: result.strategy,
		itemCount: result.itemCount,
		path: result.path,
	};
}
