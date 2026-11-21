/**
 * JSON sérialisé dans une page HTML : `<script type="application/json">`,
 * Inertia (`data-page`), `__NEXT_DATA__`… Le collecteur ne voyait que du HTML
 * et refusait le corps (`none`) alors que les objets utiles sont dans la page.
 *
 * Le corps peut être tronqué par le transport : on sait donc aussi lire les
 * objets complets d'un tableau dont la fin manque, sans jamais inventer
 * d'enregistrement.
 */

type JsonRecord = Record<string, unknown>;

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const JSON_TYPE_RE = /type\s*=\s*["']application\/(?:json|ld\+json)["']/i;
const ARRAY_START_RE = /"([A-Za-z_][\w.-]*)"\s*:\s*\[/g;
const TITLE_KEYS = ["title", "name", "post_title", "headline", "label", "slug"];
const SUMMARY_KEYS = ["summary", "description", "excerpt", "body", "text"];
const LINK_KEYS = ["link", "url", "href", "permalink"];

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function titleOf(record: JsonRecord): string {
	for (const key of TITLE_KEYS) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return "";
}

function score(records: JsonRecord[]): number {
	return records.reduce((total, record) => total + (titleOf(record) ? 1 : 0), 0);
}

/** Objets complets au début d'un tableau JSON, même si la queue est tronquée. */
function objectsInFragment(fragment: string, from: number): JsonRecord[] {
	const out: JsonRecord[] = [];
	let cursor = from;
	while (cursor < fragment.length) {
		while (cursor < fragment.length && /[\s,]/.test(fragment[cursor] ?? "")) cursor += 1;
		if (fragment[cursor] !== "{") break;
		let depth = 0;
		let inString = false;
		let escaped = false;
		let end = -1;
		for (let i = cursor; i < fragment.length; i += 1) {
			const ch = fragment[i] ?? "";
			if (inString) {
				if (escaped) escaped = false;
				else if (ch === "\\") escaped = true;
				else if (ch === '"') inString = false;
				continue;
			}
			if (ch === '"') inString = true;
			else if (ch === "{") depth += 1;
			else if (ch === "}") {
				depth -= 1;
				if (depth === 0) { end = i + 1; break; }
			}
		}
		if (end < 0) break;
		try {
			const parsed: unknown = JSON.parse(fragment.slice(cursor, end));
			if (isRecord(parsed)) out.push(parsed);
		} catch { /* objet illisible : on passe au suivant */ }
		cursor = end;
	}
	return out;
}

/** Tableaux d'objets nommés d'un JSON complet (le premier porteur de titres gagne). */
function recordsFromJson(value: unknown): JsonRecord[] {
	let best: JsonRecord[] = [];
	const visit = (node: unknown, depth: number): void => {
		if (depth > 8 || best.length > 5000) return;
		if (Array.isArray(node)) {
			const objects = node.filter(isRecord);
			if (score(objects) > score(best)) best = objects;
			for (const entry of node) {
				if (isRecord(entry) || Array.isArray(entry)) visit(entry, depth + 1);
			}
			return;
		}
		if (isRecord(node)) for (const entry of Object.values(node)) visit(entry, depth + 1);
	};
	visit(value, 0);
	return best;
}

/** Extrait les enregistrements d'un JSON embarqué, tronqué ou non. */
export function parseEmbeddedJson(body: string): JsonRecord[] | null {
	const fragment = /"[\w.-]+"\s*:\s*\[/i.test(body);
	if (!fragment && !/<script\b/i.test(body)) return null;
	if (!fragment && !/application\/(?:json|ld\+json)|data-page\s*=/i.test(body)) return null;
	const sources: { raw: string }[] = [];
	if (!/<script\b/i.test(body)) {
		sources.push({ raw: body.trim() });
	} else {
		for (const script of body.matchAll(SCRIPT_RE)) {
			const attrs = script[1] ?? "";
			const raw = (script[2] ?? "").trim();
			if (!raw || (!JSON_TYPE_RE.test(attrs) && !/data-page\s*=/i.test(attrs))) continue;
			sources.push({ raw });
		}
	}
	let best: JsonRecord[] = [];
	for (const { raw } of sources) {
		let candidates: JsonRecord[] = [];
		try {
			candidates = recordsFromJson(JSON.parse(raw) as unknown);
		} catch {
			for (const match of raw.matchAll(ARRAY_START_RE)) {
				const objects = objectsInFragment(raw, (match.index ?? 0) + match[0].length);
				if (score(objects) > score(candidates)) candidates = objects;
			}
		}
		if (score(candidates) > score(best)) best = candidates;
	}
	if (best.length === 0) return null;
	return best.map((record) => {
		const item: JsonRecord = { title: titleOf(record).slice(0, 400) };
		for (const key of SUMMARY_KEYS) {
			const value = record[key];
			if (typeof value === "string" && value.trim()) {
				item.summary = value.trim().slice(0, 800);
				break;
			}
		}
		for (const key of LINK_KEYS) {
			const value = record[key];
			if (typeof value === "string" && /^(?:https?:\/\/|\/)/.test(value)) {
				item.link = value;
				break;
			}
		}
		return item;
	});
}
